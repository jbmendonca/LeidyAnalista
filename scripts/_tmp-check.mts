import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const r = await Promise.all([
  p.skill.count(),
  p.analyticalSettings.count(),
  p.school.count(),
  p.user.count(),
  p.assessment.count(),
])
console.log(JSON.stringify(r))
await p.$disconnect()
