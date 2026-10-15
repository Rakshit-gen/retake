const BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]

/** Number of differing bits between two hex strings of the same length. */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) throw new Error(`hash length mismatch: ${a.length} vs ${b.length}`)
  let d = 0
  for (let i = 0; i < a.length; i++) d += BITS[parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)]!
  return d
}
