import type { FrameIssue } from '@retake/rules'

export const HINTS: Record<FrameIssue, string> = {
  too_dark: 'Too dark. Move to better light.',
  too_bright: 'Too bright. Step out of direct sun.',
  glare: 'Glare on the pack. Tilt the phone a little.',
  blurry: 'Blurry. Hold still and move a bit closer.',
}

export const AIMING = 'Point the camera at the item.'
export const READY = 'Looks good. Take the photo.'
export const MISMATCH = "This may not be the item in the customer's photo. Check before you shoot."
