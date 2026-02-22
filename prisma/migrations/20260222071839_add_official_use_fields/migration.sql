-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "ouConsideration" TEXT,
ADD COLUMN     "ouDateOfExecution" TEXT,
ADD COLUMN     "ouDateOfExpiration" TEXT,
ADD COLUMN     "ouDirectorsExecuted1" TEXT,
ADD COLUMN     "ouDirectorsExecuted2" TEXT,
ADD COLUMN     "ouLegalRefNumber" TEXT,
ADD COLUMN     "ouLegalReviewCompleted" BOOLEAN DEFAULT false,
ADD COLUMN     "ouRegisteredBy" TEXT,
ADD COLUMN     "ouRegisteredDate" TEXT,
ADD COLUMN     "ouRemarks" TEXT,
ADD COLUMN     "ouReviewedBy" TEXT,
ADD COLUMN     "ouSavedAt" TIMESTAMP(3),
ADD COLUMN     "ouSignedSupplierCode" TEXT;
