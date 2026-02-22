-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "bumId" TEXT,
ADD COLUMN     "clusterHeadId" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "fbpId" TEXT,
ADD COLUMN     "isResubmission" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "formIds" TEXT;
