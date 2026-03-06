const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const { createHash } = require('crypto');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}

const users = [
  { email: 'oliva.perera@testdimo.com',     name: 'Oliva Perera',           role: 'INITIATOR',        department: 'Operations' },
  { email: 'grace.perera@testdimo.com',     name: 'Grace Perera',           role: 'BUM',              department: 'Business Unit' },
  { email: 'madurika.sama@testdimo.com',    name: 'Madurika Samarasekera',  role: 'FBP',              department: 'Finance' },
  { email: 'mangala.wick@testdimo.com',     name: 'Mangala Wickramasinghe', role: 'CLUSTER_HEAD',     department: 'Cluster' },
  { email: 'sandalie.gomes@testdimo.com',      name: 'Sandalie Gomes',         role: 'LEGAL_OFFICER',    department: 'Legal', formIds: JSON.stringify([1,2,3,4,6,7,10]) },
  { email: 'damayanthi.muhandiram@testdimo.com', name: 'Damayanthi Muhandiram',  role: 'LEGAL_OFFICER',    department: 'Legal', formIds: JSON.stringify([1,2,3,4,6,7,10]) },
  { email: 'dinali.guru@testdimo.com',      name: 'Dinali Gurusinghe',      role: 'LEGAL_GM',         department: 'Legal' },
  { email: 'special.approver@testdimo.com', name: 'Special Approver',       role: 'SPECIAL_APPROVER', department: 'Legal' },
  { email: 'general.manager@testdimo.com',   name: 'General Manager',         role: 'GENERAL_MANAGER',  department: 'Management' },
  { email: 'ceo@testdimo.com',               name: 'CEO',                     role: 'CEO',               department: 'Executive' },
  { email: 'court.officer@testdimo.com',     name: 'Court Officer',           role: 'COURT_OFFICER',     department: 'Legal' },
  { email: 'finance.team@testdimo.com',      name: 'Finance Team',            role: 'FINANCE',           department: 'Finance' },
  { email: 'cluster.director@testdimo.com',  name: 'Cluster Director',        role: 'CLUSTER_DIRECTOR',  department: 'Operations' },
  { email: 'gmc.member@testdimo.com',        name: 'GMC Member',              role: 'GMC_MEMBER',        department: 'Management' },
  { email: 'facility.manager@testdimo.com',  name: 'Facility Manager',        role: 'FACILITY_MANAGER',  department: 'Facilities' },
];

async function main() {
  for (const u of users) {
    await prisma.user.upsert({
      where:  { email: u.email },
      update: { password: hashPassword('Test@1234'), name: u.name, role: u.role, department: u.department, ...(u.formIds !== undefined && { formIds: u.formIds }) },
      create: { ...u, password: hashPassword('Test@1234') },
    });
    console.log('✓ ' + u.role.padEnd(18) + ' ' + u.email);
  }
  console.log('\nAll users seeded. Password for all: Test@1234');
}

main().catch(console.error).finally(() => prisma.$disconnect());
