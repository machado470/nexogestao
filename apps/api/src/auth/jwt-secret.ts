import { ConfigService } from '@nestjs/config'

const INSECURE_LEGACY_SECRET = 'dev-secret'

export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim()

  if (!secret) {
    throw new Error('JWT_SECRET must be explicitly configured')
  }

  if (
    config.get<string>('NODE_ENV')?.trim().toLowerCase() === 'production' &&
    secret === INSECURE_LEGACY_SECRET
  ) {
    throw new Error('JWT_SECRET uses a forbidden legacy value')
  }

  return secret
}
