import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function hashPassword(password: string) {
  return bcrypt.hashSync(password, 12);
}

async function main() {
  const users = [
    { email: 'oliva.perera@testdimo.com',    name: 'Oliva Perera',           role: 'INITIATOR',    department: 'Operations' },
    { email: 'grace.perera@testdimo.com',    name: 'Grace Perera',           role: 'BUM',           department: 'Business Unit' },
    { email: 'madurika.sama@testdimo.com',   name: 'Madurika Samarasekera',  role: 'FBP',           department: 'Finance' },
    { email: 'mangala.wick@testdimo.com',    name: 'Mangala Wickramasinghe', role: 'CLUSTER_HEAD',  department: 'Cluster' },
    { email: 'sandalie.gomes@testdimo.com',  name: 'Sandalie Gomes',         role: 'LEGAL_OFFICER', department: 'Legal' },
    { email: 'dinali.guru@testdimo.com',     name: 'Dinali Gurusinghe',      role: 'LEGAL_GM',         department: 'Legal' },
    { email: 'ceo@testdimo.com',             name: 'Dimo CEO',               role: 'CEO',              department: 'Executive' },
    { email: 'special.approver@testdimo.com', name: 'Special Approver',        role: 'SPECIAL_APPROVER', department: 'Legal' },
    { email: 'finance.team@testdimo.com',     name: 'Finance Team',            role: 'FINANCE',          department: 'Finance' },
    { email: 'court.officer@testdimo.com',    name: 'Ruwan Fernando',          role: 'COURT_OFFICER',    department: 'Legal' },
    { email: 'rakhita.perera@dimolanka.com',  name: 'Rakhita Perera',          role: 'CLUSTER_DIRECTOR', department: 'Cluster' },
    { email: 'cluster.director@testdimo.com', name: 'Rakhita Perera',          role: 'CLUSTER_DIRECTOR', department: 'Cluster' },
    { email: 'mangala.wickramasinghe@dimolanka.com', name: 'Mangala Wickramasinghe', role: 'GMC_MEMBER', department: 'GMC' },
    { email: 'gmc.member@testdimo.com',       name: 'Mangala Wickramasinghe',  role: 'GMC_MEMBER',       department: 'GMC' },
    { email: 'prabath.vidanage@dimolanka.com', name: 'Prabath Vidanage',       role: 'FACILITY_MANAGER', department: 'Facilities' },
    { email: 'facility.manager@testdimo.com', name: 'Prabath Vidanage',        role: 'FACILITY_MANAGER', department: 'Facilities' },
    { email: 'damayanthi.muhandiram@testdimo.com', name: 'Damayanthi Muhandiram', role: 'LEGAL_OFFICER', department: 'Legal' },
    { email: 'general.manager@testdimo.com',  name: 'General Manager',         role: 'GENERAL_MANAGER',  department: 'Executive' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where:  { email: u.email },
      update: { password: hashPassword('Test@1234'), name: u.name, role: u.role, department: u.department },
      create: { ...u, password: hashPassword('Test@1234') },
    });
    console.log(`✓ ${u.role.padEnd(15)} ${u.email}`);
  }
  console.log('\nAll users seeded. Password for all: Test@1234');
}

main().catch(console.error).finally(() => prisma.$disconnect());