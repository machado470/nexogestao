import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envCandidates = [
  resolve(process.cwd(), '../../.env.test'),
  resolve(process.cwd(), '.env.test'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '.env'),
]

const applyEnvFile = (envPath: string) => {
  const content = readFileSync(envPath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key] !== undefined) continue

    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

for (const envPath of envCandidates) {
  if (!existsSync(envPath)) continue
  applyEnvFile(envPath)
}

if (!process.env.DATABASE_URL && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/nexogestao?schema=public'
}

if (!process.env.REDIS_URL && process.env.TEST_REDIS_URL) {
  process.env.REDIS_URL = process.env.TEST_REDIS_URL
}

if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379'
}

const redisUrl = new URL(process.env.REDIS_URL)
process.env.REDIS_HOST = process.env.REDIS_HOST || redisUrl.hostname
process.env.REDIS_PORT = process.env.REDIS_PORT || redisUrl.port || '6379'

process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id'
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-client-secret'
process.env.GOOGLE_REDIRECT_URL = process.env.GOOGLE_REDIRECT_URL || 'http://localhost:3000/auth/google/callback'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'api-tests-explicit-secret'

process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_key'
