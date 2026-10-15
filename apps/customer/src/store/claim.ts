import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { MAX_CLAIM_PHOTOS, type ClaimCategory, type ClaimDraft, type ClaimPhoto, type ClaimProblem } from '@retake/rules'
import type { UploadState } from '@retake/native'

export type SubmitState = 'idle' | 'queued' | 'running' | 'retrying' | 'filed' | 'failed'

export interface ClaimState {
  draft: ClaimDraft | null
  /** Problems from the last submit try, phone side or server side. */
  problems: string[]
  submit: {
    state: SubmitState
    uploadId: string | null
    claimId: string | null
    message: string | null
  }
}

const idleSubmit: ClaimState['submit'] = { state: 'idle', uploadId: null, claimId: null, message: null }
const initialState: ClaimState = { draft: null, problems: [], submit: idleSubmit }

export const claim = createSlice({
  name: 'claim',
  initialState,
  reducers: {
    started: (s, a: PayloadAction<{ orderId: string; itemId: string }>) => {
      s.draft = { ...a.payload, category: null, note: '', photos: [] }
      s.problems = []
      s.submit = idleSubmit
    },
    categoryPicked: (s, a: PayloadAction<ClaimCategory>) => {
      if (s.draft) s.draft.category = a.payload
      s.problems = s.problems.filter((p) => p !== 'pick_category')
    },
    noteChanged: (s, a: PayloadAction<string>) => {
      if (s.draft) s.draft.note = a.payload
    },
    photoAdded: (s, a: PayloadAction<ClaimPhoto>) => {
      if (s.draft && s.draft.photos.length < MAX_CLAIM_PHOTOS) s.draft.photos.push(a.payload)
      s.problems = s.problems.filter((p) => p !== 'add_photo')
    },
    photoRemoved: (s, a: PayloadAction<number>) => {
      s.draft?.photos.splice(a.payload, 1)
    },
    submitRequested: () => {},
    problemsFound: (s, a: PayloadAction<ClaimProblem[] | string[]>) => {
      s.problems = a.payload
      s.submit = idleSubmit
    },
    queued: (s, a: PayloadAction<string>) => {
      s.problems = []
      s.submit = { ...idleSubmit, state: 'queued', uploadId: a.payload }
    },
    progressed: (s, a: PayloadAction<UploadState>) => {
      if (a.payload === 'queued' || a.payload === 'running' || a.payload === 'retrying') s.submit.state = a.payload
    },
    filed: (s, a: PayloadAction<{ claimId: string; needsReview: boolean }>) => {
      s.submit.state = 'filed'
      s.submit.claimId = a.payload.claimId
      s.submit.message = a.payload.needsReview ? 'A person will look at your photos before the pickup.' : null
      s.draft = null
    },
    failed: (s, a: PayloadAction<string>) => {
      s.submit.state = 'failed'
      s.submit.message = a.payload
    },
    closed: () => initialState,
  },
})
