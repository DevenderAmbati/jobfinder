-- AlterTable
ALTER TABLE "Application" ADD COLUMN "appliedAt" TIMESTAMP(3);

-- Backfill: treat last update as apply time for anything already past Bookmarked
UPDATE "Application"
SET "appliedAt" = "updatedAt"
WHERE "status" <> 'SAVED' AND "appliedAt" IS NULL;

-- CreateIndex
CREATE INDEX "Application_userId_appliedAt_idx" ON "Application"("userId", "appliedAt");
