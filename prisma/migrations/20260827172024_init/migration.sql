-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ANALISTA', 'ESCOLA');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('ERROR', 'WARNING');

-- CreateEnum
CREATE TYPE "LearningLevel" AS ENUM ('ADEQUADO', 'INTERMEDIARIO', 'DEFASAGEM');

-- CreateEnum
CREATE TYPE "AnalyticalBand" AS ENUM ('FRAGILIDADE', 'ATENCAO', 'SATISFATORIO');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('IMPORT_CONFIRM', 'IMPORT_DELETE', 'IMPORT_FILE_PURGE', 'SETTINGS_CHANGE', 'REPROCESS', 'STUDENT_CREATE', 'STUDENT_UPDATE', 'STUDENT_LINK', 'STUDENT_UNLINK', 'USER_CREATE', 'USER_UPDATE', 'USER_NOMINAL_PERMISSION_CHANGE', 'REPORT_EXPORT', 'ENTITY_FORCE_DELETE');

-- CreateEnum
CREATE TYPE "ResolutionKind" AS ENUM ('CODE', 'ASSISTED', 'NEW', 'UNRESOLVED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "canAccessNominalData" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_school" (
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "user_school_pkey" PRIMARY KEY ("userId","schoolId")
);

-- CreateTable
CREATE TABLE "school" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rede" TEXT NOT NULL,
    "municipio" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "ciclo" TEXT NOT NULL,
    "componenteCurricular" TEXT NOT NULL,
    "dataAplicacao" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "externalCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "anoEscolar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_skill" (
    "assessmentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "referenceItems" INTEGER NOT NULL,
    "referenceItemsTiebreak" BOOLEAN NOT NULL DEFAULT false,
    "recalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_skill_pkey" PRIMARY KEY ("assessmentId","skillId")
);

-- CreateTable
CREATE TABLE "student" (
    "id" TEXT NOT NULL,
    "uniqueCode" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "codigoExterno" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_student_result" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "avaliado" BOOLEAN NOT NULL,
    "nivelOriginal" TEXT NOT NULL,
    "nivelNormalizado" "LearningLevel",
    "acertosTotais" INTEGER,
    "itensTotais" INTEGER,
    "percentualGeral" DECIMAL(7,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_student_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_skill_result" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "valorOriginal" TEXT,
    "acertos" INTEGER,
    "itensPossiveis" INTEGER,
    "percentual" DECIMAL(7,4),

    CONSTRAINT "student_skill_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT,
    "fileRetainedUntil" TIMESTAMP(3) NOT NULL,
    "filePurgedAt" TIMESTAMP(3),
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "userId" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "evaluatedRows" INTEGER NOT NULL DEFAULT 0,
    "notEvaluatedRows" INTEGER NOT NULL DEFAULT 0,
    "classCount" INTEGER NOT NULL DEFAULT 0,
    "skillCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "parsedData" JSONB NOT NULL,
    "resolvedStudentId" TEXT,
    "resolutionKind" "ResolutionKind" NOT NULL DEFAULT 'UNRESOLVED',
    "blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "import_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_issue" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "column" TEXT,
    "code" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "originalValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytical_settings" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fragilidadeMax" DECIMAL(5,2) NOT NULL,
    "atencaoMax" DECIMAL(5,2) NOT NULL,
    "baixoRendimento" "LearningLevel"[],
    "abaixoDoAdequadoHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "analytical_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "userId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "schoolId" TEXT,
    "assessmentId" TEXT,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "metadata" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "user_school_schoolId_idx" ON "user_school"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "school_code_key" ON "school"("code");

-- CreateIndex
CREATE UNIQUE INDEX "class_schoolId_externalCode_key" ON "class"("schoolId", "externalCode");

-- CreateIndex
CREATE UNIQUE INDEX "skill_shortCode_key" ON "skill"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "student_uniqueCode_key" ON "student"("uniqueCode");

-- CreateIndex
CREATE INDEX "student_schoolId_classId_idx" ON "student"("schoolId", "classId");

-- CreateIndex
CREATE INDEX "student_schoolId_nomeNormalizado_idx" ON "student"("schoolId", "nomeNormalizado");

-- CreateIndex
CREATE INDEX "assessment_student_result_assessmentId_schoolId_classId_idx" ON "assessment_student_result"("assessmentId", "schoolId", "classId");

-- CreateIndex
CREATE INDEX "assessment_student_result_assessmentId_avaliado_idx" ON "assessment_student_result"("assessmentId", "avaliado");

-- CreateIndex
CREATE INDEX "assessment_student_result_assessmentId_nivelNormalizado_idx" ON "assessment_student_result"("assessmentId", "nivelNormalizado");

-- CreateIndex
CREATE INDEX "assessment_student_result_importId_idx" ON "assessment_student_result"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_student_result_assessmentId_studentId_key" ON "assessment_student_result"("assessmentId", "studentId");

-- CreateIndex
CREATE INDEX "student_skill_result_skillId_idx" ON "student_skill_result"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "student_skill_result_resultId_skillId_key" ON "student_skill_result"("resultId", "skillId");

-- CreateIndex
CREATE INDEX "import_assessmentId_schoolId_fileHash_idx" ON "import"("assessmentId", "schoolId", "fileHash");

-- CreateIndex
CREATE INDEX "import_assessmentId_schoolId_idx" ON "import"("assessmentId", "schoolId");

-- CreateIndex
CREATE INDEX "import_status_idx" ON "import"("status");

-- CreateIndex
CREATE INDEX "import_row_importId_blocked_idx" ON "import_row"("importId", "blocked");

-- CreateIndex
CREATE UNIQUE INDEX "import_row_importId_rowNumber_key" ON "import_row"("importId", "rowNumber");

-- CreateIndex
CREATE INDEX "import_issue_importId_severity_idx" ON "import_issue"("importId", "severity");

-- CreateIndex
CREATE INDEX "import_issue_importId_code_idx" ON "import_issue"("importId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "analytical_settings_version_key" ON "analytical_settings"("version");

-- CreateIndex
CREATE INDEX "analytical_settings_effectiveFrom_idx" ON "analytical_settings"("effectiveFrom");

-- CreateIndex
CREATE INDEX "audit_log_occurredAt_idx" ON "audit_log"("occurredAt");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- CreateIndex
CREATE INDEX "audit_log_schoolId_idx" ON "audit_log"("schoolId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_school" ADD CONSTRAINT "user_school_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_school" ADD CONSTRAINT "user_school_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_skill" ADD CONSTRAINT "assessment_skill_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_skill" ADD CONSTRAINT "assessment_skill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_student_result" ADD CONSTRAINT "assessment_student_result_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_student_result" ADD CONSTRAINT "assessment_student_result_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_student_result" ADD CONSTRAINT "assessment_student_result_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_student_result" ADD CONSTRAINT "assessment_student_result_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_student_result" ADD CONSTRAINT "assessment_student_result_importId_fkey" FOREIGN KEY ("importId") REFERENCES "import"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skill_result" ADD CONSTRAINT "student_skill_result_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "assessment_student_result"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skill_result" ADD CONSTRAINT "student_skill_result_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import" ADD CONSTRAINT "import_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import" ADD CONSTRAINT "import_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "school"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import" ADD CONSTRAINT "import_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_importId_fkey" FOREIGN KEY ("importId") REFERENCES "import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_issue" ADD CONSTRAINT "import_issue_importId_fkey" FOREIGN KEY ("importId") REFERENCES "import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytical_settings" ADD CONSTRAINT "analytical_settings_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
