export const PRODUCTION_SEED_BREAK_GLASS = 'I_UNDERSTAND_DATA_MUTATION'

export function assertSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if ((env.NODE_ENV ?? '').trim().toLowerCase() !== 'production') return
  if ((env.ALLOW_PRODUCTION_SEED ?? '') === PRODUCTION_SEED_BREAK_GLASS) return
  throw new Error('Seed bloqueada em produção. Use migrations no deploy; autorização break-glass inválida ou ausente.')
}
