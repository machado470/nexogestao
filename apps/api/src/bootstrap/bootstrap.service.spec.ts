import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { BootstrapService } from './bootstrap.service'

describe('BootstrapService', () => {
  const originalBootstrapSecret =
    process.env.BOOTSTRAP_SECRET
  const originalNodeEnv =
    process.env.NODE_ENV

  afterEach(() => {
    jest.restoreAllMocks()

    if (originalBootstrapSecret === undefined) {
      delete process.env.BOOTSTRAP_SECRET
    } else {
      process.env.BOOTSTRAP_SECRET =
        originalBootstrapSecret
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV =
        originalNodeEnv
    }
  })

  function setup() {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ locked: 1 }]),
      user: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      person: {
        create: jest.fn(),
      },
    }

    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (transaction: typeof tx) => unknown,
        ) => callback(tx),
      ),
    }

    const subscriptions = {
      createTrialSubscription: jest.fn(),
    }

    const service = new BootstrapService(
      prisma as any,
      subscriptions as any,
    )

    return {
      service,
      prisma,
      subscriptions,
      tx,
    }
  }

  const validInput = {
    orgName: 'Nexo Teste',
    adminName: 'Admin Teste',
    email: 'admin@example.com',
    password: 'Senha123',
    organizationId: 'org-1',
  }

  it('exige a mesma senha mínima de 8 caracteres do cadastro normal', async () => {
    const { service, prisma } = setup()

    await expect(
      service.createFirstAdmin({
        ...validInput,
        password: '1234567',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('exige bootstrap secret desde o primeiro admin em produção', async () => {
    const { service, tx } = setup()

    process.env.NODE_ENV = 'production'
    delete process.env.BOOTSTRAP_SECRET

    tx.user.count.mockResolvedValue(0)

    await expect(
      service.createFirstAdmin(validInput),
    ).rejects.toBeInstanceOf(ForbiddenException)

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(tx.user.count).toHaveBeenCalledTimes(1)
    expect(tx.user.create).not.toHaveBeenCalled()
  })

  it('adquire advisory lock antes de decidir se bootstrap público ainda é permitido', async () => {
    const { service, tx } = setup()

    process.env.BOOTSTRAP_SECRET =
      'bootstrap-secret'

    tx.user.count.mockResolvedValue(1)

    await expect(
      service.createFirstAdmin(validInput),
    ).rejects.toBeInstanceOf(ForbiddenException)

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(tx.user.count).toHaveBeenCalledTimes(1)

    expect(
      tx.$queryRaw.mock.invocationCallOrder[0],
    ).toBeLessThan(
      tx.user.count.mock.invocationCallOrder[0],
    )
  })

  it('marca o primeiro admin administrativo como e-mail verificado', async () => {
    const { service, tx } = setup()

    const org = {
      id: 'org-1',
      name: 'Nexo Teste',
      slug: 'nexo-teste',
      requiresOnboarding: false,
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      createdAt: new Date(),
    }

    tx.organization.findUnique.mockResolvedValue(org)
    tx.user.findFirst.mockResolvedValue(null)

    tx.user.create.mockResolvedValue({
      id: 'user-1',
    })

    tx.person.create.mockResolvedValue({
      id: 'person-1',
    })

    const result =
      await service.createFirstAdmin(validInput)

    expect(result).toEqual({
      success: true,
      orgId: 'org-1',
      userId: 'user-1',
      personId: 'person-1',
    })

    expect(tx.user.create).toHaveBeenCalledTimes(1)

    const createData =
      tx.user.create.mock.calls[0][0].data

    expect(
      createData.emailVerifiedAt,
    ).toBeInstanceOf(Date)

    expect(createData).toMatchObject({
      email: 'admin@example.com',
      role: 'ADMIN',
      active: true,
      orgId: 'org-1',
    })
  })
})
