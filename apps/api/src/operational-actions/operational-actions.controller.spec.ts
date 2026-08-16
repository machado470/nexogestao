import { OperationalActionsController } from './operational-actions.controller'

describe('OperationalActionsController', () => {
  it('diagnostics usa orgId do req.user', async () => {
    const actions = { getOperationalActionsDiagnostics: jest.fn().mockResolvedValue({ ok: true }) } as any
    const controller = new OperationalActionsController(actions)

    const out = await controller.diagnostics({ user: { orgId: 'org-abc' } })

    expect(out).toEqual({ ok: true })
    expect(actions.getOperationalActionsDiagnostics).toHaveBeenCalledWith('org-abc')
  })
})


it('recoverStuck usa orgId e actor do req.user', async () => {
  const actions = { recoverStuckExecution: jest.fn().mockResolvedValue({ ok: true }) } as any
  const controller = new OperationalActionsController(actions)

  const out = await controller.recoverStuck({ user: { orgId: 'org-1', sub: 'u-9' } }, { executionId: 'exec-1', recoveryReason: 'manual' })

  expect(out).toEqual({ ok: true })
  expect(actions.recoverStuckExecution).toHaveBeenCalledWith({ orgId: 'org-1', actorUserId: 'u-9', executionId: 'exec-1', recoveryReason: 'manual' })
})

it('request usa sub autenticado e ignora identidade inexistente no contrato', async () => {
  const actions = { request: jest.fn().mockResolvedValue({ status: 'REQUESTED' }) } as any
  const controller = new OperationalActionsController(actions)
  await controller.request({ user: { orgId: 'org-a', sub: 'user-a' } }, { actionType: 'RECALCULATE_RISK', entityType: 'person', entityId: 'person-a' })
  expect(actions.request).toHaveBeenCalledWith({ orgId: 'org-a', actorUserId: 'user-a', actionType: 'RECALCULATE_RISK', entityType: 'person', entityId: 'person-a' })
})
