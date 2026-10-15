import { join } from 'node:path'
import { buildApp } from './app'
import { groqChecker, hashChecker, type Checker } from './checker'

function pickChecker(): Checker {
  const mode = process.env.CHECKER ?? 'hash'
  if (mode === 'hash') return hashChecker()
  if (mode === 'none') return async () => Promise.reject(new Error('checker turned off'))
  if (mode === 'groq') {
    const key = process.env.GROQ_API_KEY
    if (!key) throw new Error('CHECKER=groq needs GROQ_API_KEY')
    return groqChecker(key, process.env.GROQ_VISION_MODEL ?? 'qwen/qwen3.8-27b')
  }
  throw new Error(`unknown CHECKER=${mode}, use hash, groq or none`)
}

const app = buildApp({
  dataDir: process.env.DATA_DIR ?? join(__dirname, '../data'),
  checker: pickChecker(),
  logger: true,
})

app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
