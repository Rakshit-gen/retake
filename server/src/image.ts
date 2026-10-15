import sharp from 'sharp'
import { analyzeLuma, type FrameMetrics } from '@retake/quality'

/**
 * Runs the same luma analysis the phone runs, on an uploaded photo. EXIF
 * orientation is applied first so "rotate 0" means upright as the user saw it.
 */
export async function measure(photo: Buffer, rotate: 0 | 90 | 180 | 270 = 0): Promise<FrameMetrics> {
  const { data, info } = await sharp(photo)
    .autoOrient()
    .rotate(rotate)
    .greyscale()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true })
  return analyzeLuma(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height)
}

/**
 * dHash of a claim photo in all four rotations. The rider's phone compares its
 * live frame against the closest one, so it doesn't matter which way up the
 * camera sensor reports its frames.
 */
export async function rotatedHashes(photo: Buffer): Promise<string[]> {
  const out: string[] = []
  for (const r of [0, 90, 180, 270] as const) out.push((await measure(photo, r)).dhash)
  return out
}
