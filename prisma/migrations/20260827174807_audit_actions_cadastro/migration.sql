-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'SCHOOL_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'ASSESSMENT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'ASSESSMENT_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'CLASS_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'CLASS_UPDATE';
