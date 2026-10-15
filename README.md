# retake

Catches bad photos on the phone, before upload, for grocery delivery claims and return pickups.

A customer reporting a wrong or damaged item, and a delivery partner picking a return up at the door, both have to send a photo that a checker (a person or a vision model) can judge. When the photo is dark, blurry or glared, the check fails for a reason that has nothing to do with the item. retake runs a small image check on every camera frame, in Kotlin on the camera thread, and keeps the shutter locked until the frame is usable. It then sends the photo through a persistent upload queue to a server that makes the match decision in plain code.

## Why this problem

Swiggy's engineering blog wrote about their visual AI for Instamart claims and returns ([post](https://medium.com/swiggy-bytes/building-production-scale-visual-ai-for-claims-and-returns-at-swiggy-instamart-a0918a0abf28)). These are their figures, quoted as motivation. retake did not measure any of them:

- more than 40K claims a day;
- 10 to 15% of returned orders were wrong or short;
- about 60% of "not a match" results from their return check came from bad photos, not wrong items;
- riders get 2 retries before a pickup goes to manual review, and a checker outage must send the pickup to review instead of blocking the rider;
- their rule for the model: "LLM as the artist, code as the accountant".

If most failed checks are photo problems, the cheapest fix is to stop the bad photo before it leaves the phone. That is what this repo builds. The apps use made-up brands and no real company's name or branding.

## What is in it

```
apps/customer      Expo app. Orders, claim form, guided camera. Redux Toolkit + Redux Saga.
apps/rider         Expo app. Return pickups, camera with the customer's photo as a ghost
                   overlay, server check, nudge and retry, hand-off. Zustand.
packages/quality   Luma analysis in TypeScript: brightness, blur, glare, dHash.
packages/rules     Pure decisions: frame gate with hysteresis, claim validation,
                   return decision (accept / retry with nudge / escalate), similarity hint.
packages/native    Kotlin, as Nitro modules:
                     FrameScorer  VisionCamera frame plugin, a port of packages/quality
                     UploadQueue  WorkManager multipart uploads
packages/capture   GuidedCamera component and useQualityGate hook.
packages/ui        Tokens and a few components (Button, Banner, Row, Choices, Screen, Text).
server             Fastify. Claims, pickups, attempt checks, idempotency.
eval               Synthetic labelled photo set and the gate evaluation.
```

### Claim flow (customer)

1. Pick an order item, pick what went wrong.
2. Guided camera: the Kotlin scorer measures about 10 frames a second. The shutter unlocks after 4 good frames in a row and locks again after 2 bad ones, with a hint ("Too dark. Move to better light."). After 4 s locked, "Shoot anyway" appears, and the photo is marked as an override. The gate blocks about 5% of good photos in the eval, so it must never be the last word.
3. Submit runs the same `validateClaimDraft` the server runs, then hands a multipart job to WorkManager. The saga polls the job until it finishes. A server 400 puts its problems back on the form.
4. The server measures each uploaded photo again with the same code (it doesn't trust the phone's numbers), flags failed or overridden photos for review, and stores dHashes of each photo in 4 rotations for the rider's phone.

### Pickup flow (rider)

1. Open a pickup. The camera shows the customer's photo faded over the preview so the rider shoots from the same side.
2. While aiming, the live frame's dHash is compared to the claim photo hashes. A few frames in a row far from all of them show "This may not be the item in the customer's photo". This is only a hint; lighting and angle move the hash too.
3. The photo goes through the upload queue to `POST /pickups/:id/attempts`. The server counts the attempt (before any await, so two uploads can't both be attempt 1), bounces a photo that fails the gate without calling the checker, and otherwise asks the checker with an 8 s timeout.
4. `decideReturn` in `packages/rules` turns the verdict into accept, retry with a nudge ("The item is inside the delivery bag. Take it out and shoot again."), or escalate. A checker error or timeout escalates straight away. After 2 retries it escalates. If no answer reaches the phone in 15 s, the rider can collect the item and move on; the upload still finishes in the background.

## Quickstart

Needs Node 20.19.4 or newer (React Native 0.86). Tested with Node 24.

```
npm install
npm test               # 105 tests: rules, quality, server, UI, camera, both apps
npm run typecheck
npm run lint
```

Server, with the offline hash checker:

```
npm start -w @retake/server         # http://0.0.0.0:4000
```

Apps, on an Android emulator or a phone with USB debugging (needs the Android SDK and JDK 17+):

```
cd apps/customer && npx expo run:android
cd apps/rider && npx expo run:android
```

The apps call `http://10.0.2.2:4000`, the host as the emulator sees it. On a real phone, set `EXPO_PUBLIC_API_URL=http://<laptop LAN IP>:4000` before building.

Checks for the numbers in the table below:

```
npm run eval:set && npm run eval     # gate evaluation on the synthetic set
npm run eval -- --sweep              # threshold sweep
npm run golden                       # regenerate TS fixtures
npm run golden:kotlin                # Kotlin port must match them exactly (needs kotlinc + JDK)
```

### Checker modes

| `CHECKER` | What it does |
|---|---|
| `hash` (default) | Distance between dHashes: at most 12 bits is a match, at least 20 is a different item, between is ambiguous. Offline, free, and crude. See limits. |
| `groq` | Sends the claim photo and the pickup photo to a vision model on Groq with JSON output. Needs `GROQ_API_KEY`; model from `GROQ_VISION_MODEL`, default `qwen/qwen3.8-27b`. The reply is parsed strictly; anything off-script counts as no answer and escalates. |
| `none` | Every check fails, to see the "checker is down" path. |

The model only says what it sees. What happens to the pickup is decided in `decideReturn`, which has its own tests.

## Measured vs Claimed

Every number states what it measures and how. Update this table instead of writing new numbers anywhere else.

| Claim | Value | How measured | Date |
|---|---|---|---|
| Gate blocks good photos | 5.0% of 120 | `npm run eval`, synthetic set, 640 px analysis | 2026-10-16 |
| Gate catches blurry photos | 95.8% of 120 | same | 2026-10-16 |
| Gate catches dark photos | 100% of 60 | same | 2026-10-16 |
| Gate catches over-bright photos | 100% of 60 | same | 2026-10-16 |
| Gate catches glare | 65.0% of 60 | same | 2026-10-16 |
| Same, analysing at 320 px instead | good blocked 0.8%, blurry caught 68.3%, glare 60.0% | same; this is why 640 px is the default | 2026-10-16 |
| TS analysis time | 4.4 to 5.4 ms per 1280x720 frame | `npm run eval`, Node 24, M-series laptop; varies run to run | 2026-10-16 |
| Kotlin analysis time | 1.8 ms per 1280x720 frame | `npm run golden:kotlin`, laptop JVM (aarch64). **Not a phone.** | 2026-10-16 |
| Kotlin matches TS | 5 of 5 fixtures, every metric equal | `npm run golden:kotlin`, also in CI | 2026-10-16 |
| Analysis time on a phone | not measured | no device on hand; dev builds of the rider app show the scorer's last time on screen | |
| Bad-photo rejections avoided in production | not measured | needs real traffic | |

The eval set is 60 synthetic grocery packs rendered from SVG, each saved clean and in degraded copies (420 images). Real blur, sensor noise and glare are messier, so these numbers say the thresholds are sane, not how the gate does on real photos.

## Known limits

- **Glare is the weakest check.** A white label clips to the same values a reflection does, so the glare check misses a third of glared packs, and some false blocks on good photos are white labels.
- **Portrait frames trip the glare check more.** Turned to portrait, most synthetic packs fail the glare check, because a white barcode box fills more of one 8x8 grid cell. The eval set is landscape only, so this isn't in the table above.
- **The hash checker is a stand-in.** Synthetic packs with the same layout land 18 to 28 bits apart, so it can't tell two similar packs apart. It exists to run the whole flow offline.
- **The Groq checker has not been run against the live API.** Its request and parsing are unit-tested against a fake `fetch`.
- **No on-device numbers yet.** The APK builds for arm64 (debug and release locally, release in CI) but it hasn't been run on a phone for this table.
- Android only. The native module has no iOS side.
- Server state is in memory; photos go to `server/data`.

## Notes on the libraries underneath

The parts where knowing how a library works changed the design:

- **VisionCamera v5 frame outputs.** `useFrameOutput` runs `onFrame` as a worklet on the camera's own thread. Frames come as YUV: the Y plane is the brightness image, so the scorer reads it in place with no colour conversion. It copies it once into a reused buffer (respecting row stride, which is wider than the image on many phones; one golden fixture has stride 704 for 640 px to catch this). Frames are disposed in a `finally`, because an undisposed frame stalls the camera pipeline.
- **Nitro and worklets.** Nitro registers its hybrid objects as custom serializables with react-native-worklets, so the Kotlin `FrameScorer` can be called from inside the frame worklet directly. Only the small metrics object crosses back to React, via `scheduleOnRN`.
- **Throttle without re-renders.** Frames are skipped unless 100 ms have passed (Android frame timestamps are nanoseconds; the last one is kept in a `Synchronizable`). `useQualityGate` keeps the gate state in a ref and only sets React state when the shutter, hint or warning changes, so 10 scores a second cause about zero renders while nothing changes (tested).
- **WorkManager.** Jobs survive the app being killed and wait for a network. The work id doubles as the `Idempotency-Key`, so a retried upload is replayed by the server instead of counting as a new attempt. WorkManager's `ListenableFuture` methods don't compile in a React Native app: Guava's `listenablefuture` is resolved to the empty `9999.0-empty-to-avoid-conflict-with-guava` artifact. The queue uses WorkManager's Flow API instead.
- **Redux Saga.** `takeLeading` makes a double tap on submit queue one upload. Polling runs in a `race` with the screen closing, so leaving stops the polling but not the upload, and a saga at launch picks up a claim upload still in flight. Dependencies (API, queue) come in through saga context, which is how the tests swap in a fake queue.
- **Exact numbers in two languages.** The TS and Kotlin analysers use integer maths or doubles summed in the same order, so they agree exactly, not approximately. The golden check fails on any difference.
- **Layout across Android screens.** Sizes are in dp on a 4 step, touch targets are 48 dp, lines use `StyleSheet.hairlineWidth` (one physical pixel), text scaling is capped at 1.4x, and the camera overlay is placed with safe-area insets rather than fixed offsets.

## Status

Works: everything in the test suite (105 tests), the eval, the Kotlin golden check, Metro bundles for both apps, and arm64 debug and release APKs of the rider app built locally (release is 40 MB). CI runs typecheck, lint, tests, the golden check, and release APK builds for both apps.

Not done: running on a real phone and measuring there, a live Groq run, iOS, persistent server storage.
