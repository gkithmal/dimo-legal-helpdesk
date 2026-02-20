import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const forms = [
  { id:1,  name:'Contract Review Form',                       instructions:'Please provide all required documents before submission.\n1. Ensure all company documents are certified.\n2. Board resolution must be dated within 3 months.\n3. All NIC copies must be attested.',
    docs:[
      {label:'Certificate of Incorporation',type:'Company'},
      {label:'Form 1 (Company Registration)',type:'Company'},
      {label:'Articles of Association',type:'Company'},
      {label:'Board Resolution',type:'Company'},
      {label:'VAT Registration Certificate',type:'Company'},
      {label:'Partnership Agreement',type:'Partnership'},
      {label:'Business Registration Certificate',type:'Partnership'},
      {label:'NIC copies of all Partners',type:'Partnership'},
      {label:'NIC copy',type:'Individual'},
      {label:'Proof of Address',type:'Individual'},
      {label:'Form 15 (latest form)',type:'Common'},
      {label:'Form 13 (latest form if applicable)',type:'Common'},
      {label:'Form 20 (latest form if applicable)',type:'Common'},
    ]},
  { id:2,  name:'Lease Agreement',                            instructions:'Instructions for Lease Agreement — to be configured.',                        docs:[{label:'Certificate of Incorporation',type:'Company'}]},
  { id:3,  name:'Instruction For Litigation',                 instructions:'Instructions for Instruction For Litigation — to be configured.',              docs:[{label:'Certificate of Incorporation',type:'Company'}]},
  { id:4,  name:'Vehicle Rent Agreement',                     instructions:'Instructions for Vehicle Rent Agreement — to be configured.',                  docs:[{label:'Certificate of Incorporation',type:'Company'}]},
  { id:5,  name:'Request for Power of Attorney',              instructions:'Instructions for Request for Power of Attorney — to be configured.',            docs:[{label:'Certificate of Incorporation',type:'Company'}]},
  { id:6,  name:'Registration of a Trademark',                instructions:'Instructions for Registration of a Trademark — to be configured.',             docs:[{label:'Certificate of Incorporation',type:'Company'}]},
  { id:7,  name:'Termination of agreements/lease agreements', instructions:'Instructions for Termination of agreements — to be configured.',               docs:[{label:'Certificate of Incorporation',type:'Company'}]},
  { id:8,  name:'Handing over of the leased premises',        instructions:'Instructions for Handing over of leased premises — to be configured.',         docs:[{label:'Certificate of Incorporation',type:'Company'}]},
  { id:9,  name:'Approval for Purchasing of a Premises',      instructions:'Instructions for Approval for Purchasing Premises — to be configured.',        docs:[{label:'Certificate of Incorporation',type:'Company'}]},
  { id:10, name:'Instruction to Issue Letter of Demand',      instructions:'Instructions for Letter of Demand — to be configured.',                        docs:[{label:'Certificate of Incorporation',type:'Company'}]},
]

async function main() {
  for (const f of forms) {
    const existing = await prisma.formConfig.findUnique({ where: { formId: f.id } })
    if (existing) { console.log(`⏭  Form ${f.id} already exists`); continue; }
    await prisma.formConfig.create({
      data: {
        formId: f.id,
        formName: f.name,
        instructions: f.instructions,
        docs: { create: f.docs.map((d, i) => ({ label: d.label, type: d.type, sortOrder: i })) },
      },
    })
    console.log(`✅ Seeded Form ${f.id}: ${f.name}`)
  }
  await prisma.$disconnect()
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
