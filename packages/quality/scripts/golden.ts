// Regenerates fixtures/golden.json from the TypeScript implementation.
// Run after an intentional change to analyze.ts, then update FrameMath.kt to match.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeLuma } from '../src/analyze'
import { PATTERNS, render } from '../src/patterns'

const out = PATTERNS.map((p) => ({
  name: p.name,
  metrics: analyzeLuma(render(p), p.width, p.height, p.stride),
}))
writeFileSync(join(__dirname, '../fixtures/golden.json'), JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${out.length} fixtures`)
