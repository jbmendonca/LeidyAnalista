import { PrismaClient } from '@prisma/client'
import { isProduction } from '@/lib/env'

/**
 * Cliente Prisma singleton. Em desenvolvimento o hot reload recria módulos a
 * cada alteração; sem o singleton, cada recarga abriria um novo pool e o banco
 * esgotaria as conexões.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProduction ? ['error'] : ['error', 'warn'],
  })

if (!isProduction) {
  globalForPrisma.prisma = prisma
}

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
