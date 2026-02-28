import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import crypto from 'crypto'
import dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const hash = crypto.createHash('sha256').update('Test@1234').digest('hex')
const USERS = [
  { name: 'Oliva Perera',     email: 'oliva.perera@testdimo.com',      role: 'INITIATOR' },
  { name: 'Grace Perera',     email: 'grace.perera@testdimo.com',      role: 'BUM' },
  { name: 'Madurika Sama',    email: 'madurika.sama@testdimo.com',     role: 'FBP' },
  { name: 'Dimo CEO',         email: 'ceo@testdimo.com',               role: 'CEO' },
  { name: 'Mangala Wick',     email: 'mangala.wick@testdimo.com',      role: 'CLUSTER_HEAD' },
  { name: 'Sandalie Gomes',   email: 'sandalie.gomes@testdimo.com',    role: 'LEGAL_OFFICER' },
  { name: 'Dinali Guru',      email: 'dinali.guru@testdimo.com',       role: 'LEGAL_GM' },
  { name: 'Special Approver', email: 'special.approver@testdimo.com',  role: 'SPECIAL_APPROVER' },
  { name: 'Finance Team',     email: 'finance.team@testdimo.com',      role: 'FINANCE' },
]
for (const u of USERS) {
  const user = await prisma.user.upsert({
    where: { email: u.email },
    update: { name: u.name, role: u.role, isActive: true },
    create: { name: u.name, email: u.email, password: hash, role: u.role, isActive: true },
  })
  console.log('✅', user.role.padEnd(20), user.email)
}
await prisma.$disconnect()
await pool.end()
