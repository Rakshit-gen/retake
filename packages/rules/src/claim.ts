import type { FrameMetrics } from '@retake/quality'
import { assessFrame } from './frame'

export type ClaimCategory = 'wrong_item' | 'expired' | 'bad_quality' | 'damaged' | 'packaging'

export interface ClaimPhoto {
  uri: string
  /** Metrics of the frame the shutter fired on. */
  metrics: FrameMetrics
}

export interface ClaimDraft {
  orderId: string
  itemId: string
  category: ClaimCategory | null
  note: string
  photos: ClaimPhoto[]
}

export type ClaimProblem = 'pick_item' | 'pick_category' | 'add_photo' | 'too_many_photos' | 'retake_photo'

export const MAX_CLAIM_PHOTOS = 3

export function validateClaimDraft(d: ClaimDraft): ClaimProblem[] {
  const out: ClaimProblem[] = []
  if (!d.itemId) out.push('pick_item')
  if (!d.category) out.push('pick_category')
  if (d.photos.length === 0) out.push('add_photo')
  else if (d.photos.length > MAX_CLAIM_PHOTOS) out.push('too_many_photos')
  else if (d.photos.some((p) => !assessFrame(p.metrics).ok)) out.push('retake_photo')
  return out
}
