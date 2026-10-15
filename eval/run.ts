// Runs the on-device gate over the synthetic set and prints how often each
// kind of bad photo is caught, and how often a good photo is wrongly blocked.
//
//   npx tsx eval/make-set.ts   (once)
//   npx tsx eval/run.ts [--sweep]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { analyzeLuma, type FrameMetrics } from '../packages/quality/src'
import { assessFrame, DEFAULT_THRESHOLDS, type FrameIssue, type Thresholds } from '../packages/rules/src'
import { SET_DIR, type Label } from './make-set'

interface Row {
  file: string
  label: Label
  metrics: Record<number, FrameMetrics>
}

const WIDTHS = [320, 640]
const EXPECTED: Record<Exclude<Label, 'good'>, FrameIssue> = {
  blurry: 'blurry',
  dark: 'too_dark',
  bright: 'too_bright',
  glare: 'glare',
}

async function load(): Promise<{ rows: Row[]; msPerFrame: Record<number, number> }> {
  const manifest: { file: string; label: Label }[] = JSON.parse(readFileSync(join(SET_DIR, 'manifest.json'), 'utf8'))
  const rows: Row[] = []
  const time: Record<number, number> = Object.fromEntries(WIDTHS.map((w) => [w, 0]))
  for (const m of manifest) {
    const { data, info } = await sharp(join(SET_DIR, m.file)).greyscale().raw().toBuffer({ resolveWithObject: true })
    const px = new Uint8Array(data.buffer, data.byteOffset, data.length)
    const metrics: Record<number, FrameMetrics> = {}
    for (const w of WIDTHS) {
      const t0 = performance.now()
      metrics[w] = analyzeLuma(px, info.width, info.height, info.width, w)
      time[w]! += performance.now() - t0
    }
    rows.push({ file: m.file, label: m.label, metrics })
  }
  const msPerFrame = Object.fromEntries(WIDTHS.map((w) => [w, time[w]! / rows.length]))
  return { rows, msPerFrame }
}

function score(rows: Row[], width: number, t: Thresholds) {
  const byLabel = new Map<Label, { n: number; flagged: number; rightIssue: number }>()
  for (const r of rows) {
    const a = assessFrame(r.metrics[width]!, t)
    const s = byLabel.get(r.label) ?? { n: 0, flagged: 0, rightIssue: 0 }
    s.n++
    if (!a.ok) s.flagged++
    if (r.label !== 'good' && a.issues.includes(EXPECTED[r.label])) s.rightIssue++
    byLabel.set(r.label, s)
  }
  return byLabel
}

const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`

function table(rows: Row[], width: number, t: Thresholds): string {
  const s = score(rows, width, t)
  const lines = ['| Photo kind | Count | Blocked | Blocked for the right reason |', '|---|---|---|---|']
  for (const [label, v] of s) {
    lines.push(`| ${label} | ${v.n} | ${pct(v.flagged, v.n)} | ${label === 'good' ? 'n/a' : pct(v.rightIssue, v.n)} |`)
  }
  return lines.join('\n')
}

function sweep(rows: Row[]) {
  const line = (w: number, t: Thresholds, label: Label) => {
    const v = score(rows, w, t).get(label)!
    return label === 'good' ? pct(v.flagged, v.n) : pct(v.rightIssue, v.n)
  }
  for (const w of WIDTHS) {
    console.log(`\nwidth ${w}: minSharpnessRatio -> good blocked / blurry caught`)
    for (const v of [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7]) {
      const t = { ...DEFAULT_THRESHOLDS, minSharpnessRatio: v }
      console.log(`  ${v}: ${line(w, t, 'good')} / ${line(w, t, 'blurry')}`)
    }
    console.log(`width ${w}: maxGlare -> good blocked / glare caught`)
    for (const v of [0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) {
      const t = { ...DEFAULT_THRESHOLDS, maxGlare: v }
      console.log(`  ${v}: ${line(w, t, 'good')} / ${line(w, t, 'glare')}`)
    }
  }
  // Which good photos get blocked, and why.
  for (const r of rows.filter((r) => r.label === 'good')) {
    const a = assessFrame(r.metrics[640]!)
    if (!a.ok) {
      const m = r.metrics[640]!
      console.log(`blocked good ${r.file}: ${a.issues.join(',')} ratio ${(m.sharpness / m.contrast).toFixed(2)} contrast ${m.contrast.toFixed(0)} glare ${m.glare.toFixed(2)}`)
    }
  }
}

async function main() {
  const { rows, msPerFrame } = await load()
  if (process.argv.includes('--sweep')) sweep(rows)
  for (const w of WIDTHS) {
    console.log(`\n### Analysis width ${w}px (${msPerFrame[w]!.toFixed(2)} ms per 1280x720 frame in Node)\n`)
    console.log(table(rows, w, DEFAULT_THRESHOLDS))
  }
}

void main()
