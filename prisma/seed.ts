import { PrismaClient } from '@prisma/client'
import { seedDemoOrg } from './seed-demo-org'
import { seedPilot } from './seed-pilot'
import { assertSeedAllowed } from './seed-guard'

import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function env(name: string, fallback = ''): string {
  const v = (process.env[name] ?? '').trim()
  return v || fallback
}

async function ensureDefaultAdmin() {
  const org = await prisma.organization.upsert({
    where: { slug: 'default' },
    update: {
      name: 'NexoGestão',
      requiresOnboarding: false,
    },
    create: {
      name: 'NexoGestão',
      slug: 'default',
      requiresOnboarding: false,
    },
  })

  const email = 'admin@nexogestao.local'
  const name = env('DEMO_ADMIN_NAME', 'Admin')

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, person: { select: { id: true } } },
  })

  if (!existingUser) {
    const passwordHash = await bcrypt.hash('123456', 10)

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: 'ADMIN',
        active: true,
        emailVerifiedAt: new Date(),
        orgId: org.id,
      },
    })

    await prisma.person.create({
      data: {
        name,
        email,
        role: 'ADMIN',
        active: true,
        orgId: org.id,
        userId: user.id,
      },
    })
  } else {
    const passwordHash = await bcrypt.hash('123456', 10)
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        orgId: org.id,
        role: 'ADMIN',
        active: true,
        password: passwordHash,
        emailVerifiedAt: { set: new Date() },
      },
    })

    await prisma.person.upsert({
      where: { userId: existingUser.id },
      update: {
        orgId: org.id,
        name,
        email,
        role: 'ADMIN',
        active: true,
      },
      create: {
        name,
        email,
        role: 'ADMIN',
        active: true,
        orgId: org.id,
        userId: existingUser.id,
      },
    })
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      requiresOnboarding: false,
    },
  })

  return org
}

async function runDemoOrgSeed() {
  const org = await ensureDefaultAdmin()
  await seedDemoOrg(org.id)
  console.log('Seed demo-org finalizado')
}

async function runPilotSeed() {
  await seedPilot()
  console.log('Seed pilot finalizado')
}

async function runBasicSeed() {
  await ensureDefaultAdmin()
  console.log('Seed básico finalizado')
}

async function main() {
  const seedMode = env('SEED_MODE', 'pilot').toLowerCase()
  assertSeedAllowed()

  if (seedMode === 'demo' || seedMode === 'demo-org') {
    await runDemoOrgSeed()
    return
  }

  if (seedMode === 'basic') {
    await runBasicSeed()
    return
  }

  await runPilotSeed()
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
