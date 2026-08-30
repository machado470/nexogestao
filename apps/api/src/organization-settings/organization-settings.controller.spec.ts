import { OrganizationSettingsController } from './organization-settings.controller'

describe('OrganizationSettingsController', () => {
  it('lê configurações usando o orgId da sessão autenticada', async () => {
    const service = { getOrganizationSettings: jest.fn().mockResolvedValue({ name: 'Tenant Correto' }) } as any
    const controller = new OrganizationSettingsController(service)

    await expect(controller.getSettings({ user: { orgId: 'org-authenticated' } })).resolves.toEqual({ name: 'Tenant Correto' })
    expect(service.getOrganizationSettings).toHaveBeenCalledWith('org-authenticated')
  })

  it('atualiza somente o tenant autenticado sem receber orgId no DTO', async () => {
    const service = { updateOrganizationSettings: jest.fn().mockResolvedValue({ name: 'Tenant Correto' }) } as any
    const controller = new OrganizationSettingsController(service)
    const payload = { name: 'Tenant Correto', timezone: 'UTC' }

    await controller.updateSettings({ user: { orgId: 'org-authenticated' } }, payload)

    expect(service.updateOrganizationSettings).toHaveBeenCalledWith('org-authenticated', payload)
  })
})


describe('OrganizationSettingsController administrative summary', () => {
  it('deriva o tenant exclusivamente da sessão', async () => {
    const service = { getAdministrativeSummary: jest.fn().mockResolvedValue({ sections: [] }) } as any
    const controller = new OrganizationSettingsController(service)
    await controller.getAdministrativeSummary({ user: { orgId: 'org-authenticated' } })
    expect(service.getAdministrativeSummary).toHaveBeenCalledWith('org-authenticated')
  })
})
