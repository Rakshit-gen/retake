// Builds a synthetic labelled photo set in eval/out/set. Each base image is a
// made-up grocery pack (label, brand text, small print, barcode) on a table,
// rendered from SVG. Each base is then saved clean and in degraded copies.
//
// This is NOT a substitute for real phone photos: real blur, sensor noise and
// glare are messier. It exists so the gate thresholds are tuned against
// something reproducible instead of guessed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp, { type Sharp } from 'sharp'

const W = 1280
const H = 720
const BASES = 60
export const SET_DIR = join(__dirname, 'out/set')

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Made-up brand names on purpose.
const BRANDS = ['Kesari', 'Gaurav', 'Nimbu', 'Sonali', 'Tara', 'Mitra', 'Dhaani', 'Pakka', 'Ujala', 'Roshni']
const WORDS = ['Toned Milk', 'Atta', 'Bhujia', 'Marie', 'Curd', 'Paneer', 'Ghee', 'Poha', 'Rava Idli', 'Sunflower Oil']

interface Pack {
  x: number
  y: number
  w: number
  h: number
}

function packSvg(r: () => number): { svg: string; pack: Pack } {
  const hue = Math.floor(r() * 360)
  const bg = `hsl(${Math.floor(r() * 360)},${10 + Math.floor(r() * 20)}%,${35 + Math.floor(r() * 30)}%)`
  const pw = 480 + Math.floor(r() * 240)
  const ph = 520 + Math.floor(r() * 140)
  const px = Math.floor((W - pw) / 2 + (r() - 0.5) * 200)
  const py = Math.max(10, Math.floor((H - ph) / 2 + (r() - 0.5) * 60))
  const brand = BRANDS[Math.floor(r() * BRANDS.length)]
  const word = WORDS[Math.floor(r() * WORDS.length)]
  let bars = ''
  for (let i = 0, x = px + 30; i < 40 && x < px + 200; i++) {
    const bw = 1 + Math.floor(r() * 4)
    bars += `<rect x="${x}" y="${py + ph - 90}" width="${bw}" height="60" fill="#111"/>`
    x += bw + 1 + Math.floor(r() * 3)
  }
  let small = ''
  for (let i = 0; i < 6; i++) {
    small += `<text x="${px + 30}" y="${py + 250 + i * 18}" font-size="13" font-family="Helvetica, Arial, sans-serif" fill="#222">MFD 0${1 + i}/2026  BEST BEFORE 6 MONTHS  NET WT ${100 + i * 50} g</text>`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="0" y="${H - 160}" width="${W}" height="160" fill="hsl(30,25%,${25 + Math.floor(r() * 20)}%)"/>
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="18" fill="hsl(${hue},55%,62%)" stroke="#333" stroke-width="3"/>
  <rect x="${px + 20}" y="${py + 20}" width="${pw - 40}" height="120" rx="10" fill="hsl(${(hue + 180) % 360},60%,45%)"/>
  <text x="${px + 40}" y="${py + 100}" font-size="64" font-weight="bold" font-family="Helvetica, Arial, sans-serif" fill="#fff">${brand}</text>
  <text x="${px + 30}" y="${py + 200}" font-size="36" font-family="Helvetica, Arial, sans-serif" fill="#111">${word}</text>
  <circle cx="${px + pw - 70}" cy="${py + 210}" r="40" fill="hsl(${(hue + 90) % 360},70%,50%)" stroke="#fff" stroke-width="4"/>
  ${small}
  <rect x="${px + 20}" y="${py + ph - 100}" width="200" height="80" fill="#fff"/>
  ${bars}
</svg>`
  return { svg, pack: { x: px, y: py, w: pw, h: ph } }
}

function motionKernel(len: number, horizontal: boolean) {
  const kernel = new Array(len * len).fill(0)
  const mid = Math.floor(len / 2)
  for (let i = 0; i < len; i++) kernel[horizontal ? mid * len + i : i * len + i] = 1
  return { width: len, height: len, kernel, scale: len }
}

/** A specular highlight somewhere on the pack, where it would hide the label. */
function glareSvg(r: () => number, p: Pack): Buffer {
  const cx = p.x + Math.floor(p.w * (0.25 + r() * 0.5))
  const cy = p.y + Math.floor(p.h * (0.25 + r() * 0.5))
  const rx = 70 + Math.floor(r() * 60)
  const ry = 40 + Math.floor(r() * 40)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.65" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#g)"/>
</svg>`)
}

export type Label = 'good' | 'blurry' | 'dark' | 'bright' | 'glare'

async function main() {
  rmSync(SET_DIR, { recursive: true, force: true })
  mkdirSync(SET_DIR, { recursive: true })
  const manifest: { file: string; label: Label; detail: string }[] = []
  const save = async (img: Sharp, name: string, label: Label, detail: string) => {
    const file = `${name}.jpg`
    await img.jpeg({ quality: 85 }).toFile(join(SET_DIR, file))
    manifest.push({ file, label, detail })
  }

  for (let b = 0; b < BASES; b++) {
    const r = rng(1000 + b)
    const { svg, pack } = packSvg(r)
    const base = await sharp(Buffer.from(svg)).png().toBuffer()
    const id = String(b).padStart(2, '0')
    const exposure = 0.85 + r() * 0.3

    await save(sharp(base), `${id}-good-clean`, 'good', 'clean')
    await save(sharp(base).linear(exposure, 0).blur(0.6), `${id}-good-soft`, 'good', `exposure ${exposure.toFixed(2)}, blur sigma 0.6`)

    const sigma = 1.5 + r() * 2.5
    await save(sharp(base).blur(sigma), `${id}-blurry-gauss`, 'blurry', `gaussian sigma ${sigma.toFixed(2)}`)
    const len = 2 * (4 + Math.floor(r() * 6)) + 1
    await save(sharp(base).convolve(motionKernel(len, r() < 0.5)), `${id}-blurry-motion`, 'blurry', `motion ${len}px`)

    const dim = 0.12 + r() * 0.18
    await save(sharp(base).linear(dim, 0), `${id}-dark`, 'dark', `x${dim.toFixed(2)}`)

    const gain = 2 + r() * 1.2
    await save(sharp(base).linear(gain, 30), `${id}-bright`, 'bright', `x${gain.toFixed(2)} +30`)

    await save(sharp(base).composite([{ input: glareSvg(r, pack) }]), `${id}-glare`, 'glare', 'white spot')
  }
  writeFileSync(join(SET_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`wrote ${manifest.length} images to ${SET_DIR}`)
}

if (require.main === module) void main()
