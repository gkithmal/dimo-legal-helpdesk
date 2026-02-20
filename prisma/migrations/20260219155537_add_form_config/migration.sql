-- CreateTable
CREATE TABLE "form_configs" (
    "id" TEXT NOT NULL,
    "formId" INTEGER NOT NULL,
    "formName" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_config_docs" (
    "id" TEXT NOT NULL,
    "formConfigId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "form_config_docs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_configs_formId_key" ON "form_configs"("formId");

-- AddForeignKey
ALTER TABLE "form_config_docs" ADD CONSTRAINT "form_config_docs_formConfigId_fkey" FOREIGN KEY ("formConfigId") REFERENCES "form_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
