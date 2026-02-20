const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');
require('dotenv').config();

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

function hashPassword(password) {
  return createHash('sha256').update(password).digest('hex');
}

const users = [
  { email: 'oliva.perera@testdimo.com',    name: 'Oliva Perera',           role: 'INITIATOR',    department: 'Operations' },
  { email: 'grace.perera@testdimo.com',    name: 'Grace Perera',           role: 'BUM',           department: 'Business Unit' },
  { email: 'madurika.sama@testdimo.com',   name: 'Madurika Samarasekera',  role: 'FBP',           department: 'Finance' },
  { email: 'mangala.wick@testdimo.com',    name: 'Mangala Wickramasinghe', role: 'CLUSTER_HEAD',  department: 'Cluster' },
  { email: 'sandalie.gomes@testdimo.com',  name: 'Sandalie Gomes',         role: 'LEGAL_OFFICER', department: 'Legal' },
  { email: 'dinali.guru@testdimo.com',     name: 'Dinali Gurusinghe',      role: 'LEGAL_GM',      department: 'Legal' },
];

async function main() {
  for (const u of users) {
    await prisma.user.upsert({
      where:  { email: u.email },
      update: { password: hashPassword('Test@1234'), name: u.name, role: u.role, department: u.department },
      create: { ...u, password: hashPassword('Test@1234') },
    });
    console.log('✓ ' + u.role.padEnd(15) + ' ' + u.email);
  }
  console.log('\nAll users seeded. Password for all: Test@1234');
}

main().catch(console.error).finally(() => prisma.$disconnect());
