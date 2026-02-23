-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "f2BoardApproval" BOOLEAN DEFAULT false,
ADD COLUMN     "f2LegalFees" TEXT,
ADD COLUMN     "f2ReferenceNo" TEXT,
ADD COLUMN     "f2Remarks" TEXT,
ADD COLUMN     "f2StampDuty" TEXT;
