import type { FrameMetrics } from '@retake/quality'
import { validateClaimDraft, type ClaimDraft } from './claim'

const sharp: FrameMetrics = {
  width: 320,
  height: 240,
  meanLuma: 130,
  darkFraction: 0.02,
  brightFraction: 0.01,
  sharpness: 500,
  glare: 0.05,
  dhash: 'aaaaaaaaaaaaaaaa',
}

const draft: ClaimDraft = {
  orderId: 'o1',
  itemId: 'i1',
  category: 'damaged',
  note: '',
  photos: [{ uri: 'file:///a.jpg', metrics: sharp }],
}

describe('validateClaimDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateClaimDraft(draft)).toEqual([])
  })

  it('needs an item and a category', () => {
    expect(validateClaimDraft({ ...draft, itemId: '', category: null })).toEqual(['pick_item', 'pick_category'])
  })

  it('needs one to three photos', () => {
    expect(validateClaimDraft({ ...draft, photos: [] })).toEqual(['add_photo'])
    const four = Array.from({ length: 4 }, () => draft.photos[0])
    expect(validateClaimDraft({ ...draft, photos: four })).toEqual(['too_many_photos'])
  })

  it('rejects a photo that would not pass the camera gate', () => {
    const blurry = { uri: 'file:///b.jpg', metrics: { ...sharp, sharpness: 3 } }
    expect(validateClaimDraft({ ...draft, photos: [blurry] })).toEqual(['retake_photo'])
  })

})
