import { all, call, delay, getContext, put, race, select, take, takeLatest, takeLeading } from 'redux-saga/effects'
import type { SagaIterator } from 'redux-saga'
import type { UploadQueue, UploadRequest, UploadStatus } from '@retake/native'
import { validateClaimDraft, type ClaimDraft } from '@retake/rules'
import type { Api, ClaimFiled, Order } from '../api'
import { claim } from './claim'
import { orders } from './orders'
import type { RootState } from './index'

export interface SagaDeps {
  api: Api
  queue: UploadQueue
  pollMs?: number
}

export const CLAIM_TAG = 'claim'

function* loadOrders(): SagaIterator {
  const api: Api = yield getContext('api')
  try {
    const list: Order[] = yield call([api, api.getOrders])
    yield put(orders.actions.loaded(list))
  } catch (e) {
    yield put(orders.actions.failed(e instanceof Error ? e.message : 'Could not load orders'))
  }
}

/** expo-file-system gives file:// URIs; the native queue wants plain paths. */
export function toPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''))
}

export function claimUpload(baseUrl: string, d: ClaimDraft): UploadRequest {
  return {
    url: `${baseUrl}/claims`,
    tag: CLAIM_TAG,
    fields: [
      { name: 'orderId', value: d.orderId },
      { name: 'itemId', value: d.itemId },
      { name: 'category', value: d.category ?? '' },
      { name: 'note', value: d.note },
      { name: 'overrides', value: JSON.stringify(d.photos.map((p) => !!p.override)) },
    ],
    files: d.photos.map((p) => ({ name: 'photo', path: toPath(p.uri), contentType: 'image/jpeg' })),
  }
}

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

/**
 * Follows one upload until WorkManager is done with it. The job itself does
 * not depend on this loop: if the app is closed, WorkManager carries on and
 * resumePending picks the job up again on the next launch.
 */
export function* pollUpload(id: string): SagaIterator {
  const queue: UploadQueue = yield getContext('queue')
  const pollMs: number = (yield getContext('pollMs')) ?? 1500
  while (true) {
    const st: UploadStatus | undefined = yield call([queue, queue.status], id)
    if (!st) {
      yield put(claim.actions.failed('The upload went missing. Please file the claim again.'))
      return
    }
    if (st.state === 'succeeded') {
      const body = parse<ClaimFiled>(st.body)
      if (body?.claim?.id) yield put(claim.actions.filed({ claimId: body.claim.id, needsReview: body.claim.needsReview }))
      else yield put(claim.actions.failed('The server sent an answer the app did not understand.'))
      return
    }
    if (st.state === 'failed') {
      // 4xx from the server: the worker gives up and keeps the body.
      const body = parse<{ problems?: string[] }>(st.body)
      if (body?.problems?.length) yield put(claim.actions.problemsFound(body.problems))
      else yield put(claim.actions.failed(`Upload failed${st.httpStatus ? ` (HTTP ${st.httpStatus})` : ''}.`))
      return
    }
    if (st.state === 'cancelled') {
      yield put(claim.actions.failed('Upload cancelled.'))
      return
    }
    yield put(claim.actions.progressed(st.state))
    yield delay(pollMs)
  }
}

function* follow(id: string): SagaIterator {
  // Leaving the screen stops the polling, not the upload.
  yield race({ done: call(pollUpload, id), closed: take(claim.actions.closed.type) })
}

function* submitClaim(): SagaIterator {
  const draft: ClaimDraft | null = yield select((s: RootState) => s.claim.draft)
  if (!draft) return
  const problems = validateClaimDraft(draft)
  if (problems.length > 0) {
    yield put(claim.actions.problemsFound(problems))
    return
  }
  const api: Api = yield getContext('api')
  const queue: UploadQueue = yield getContext('queue')
  const id: string = yield call([queue, queue.enqueue], claimUpload(api.baseUrl, draft))
  yield put(claim.actions.queued(id))
  yield call(follow, id)
}

/** On launch, pick up a claim upload that was still going when the app closed. */
export function* resumePending(): SagaIterator {
  const queue: UploadQueue = yield getContext('queue')
  const jobs: UploadStatus[] = yield call([queue, queue.list], CLAIM_TAG)
  const pending = jobs.find((j) => j.state === 'queued' || j.state === 'running' || j.state === 'retrying')
  if (!pending) return
  yield put(claim.actions.queued(pending.id))
  yield call(follow, pending.id)
}

export function* rootSaga(): SagaIterator {
  yield all([takeLatest(orders.actions.requested.type, loadOrders), takeLeading(claim.actions.submitRequested.type, submitClaim), call(resumePending)])
}
