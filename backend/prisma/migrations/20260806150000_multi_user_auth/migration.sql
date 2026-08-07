-- Multi-user auth: shared jobs/companies, per-user resume + match scores.

-- 1. Users
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Default owner for existing singleton data (password: changeme — force reset via register of new users)
INSERT INTO "User" ("id", "email", "passwordHash", "name", "createdAt", "updatedAt")
VALUES (
  'legacy_default_user',
  'owner@localhost',
  '$2b$10$yOLAbH1ekbaVf4mp/kxlZupCghYNOK5wtexe5PVFOSlBY/jFLBFSC',
  'Owner',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- 2. JobMatch (copy scores off Job before dropping columns)
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "matchReasons" TEXT,
    "missingSkills" TEXT,
    "interviewDifficulty" TEXT,
    "salaryEstimate" TEXT,
    "recommendation" TEXT,
    "matchSource" "MatchSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

INSERT INTO "JobMatch" (
  "id", "userId", "jobId", "matchScore", "matchReasons", "missingSkills",
  "interviewDifficulty", "salaryEstimate", "recommendation", "matchSource",
  "createdAt", "updatedAt"
)
SELECT
  'jm_' || "id",
  'legacy_default_user',
  "id",
  "matchScore",
  "matchReasons",
  "missingSkills",
  "interviewDifficulty",
  "salaryEstimate",
  "recommendation",
  "matchSource",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Job"
WHERE "matchScore" IS NOT NULL;

CREATE UNIQUE INDEX "JobMatch_userId_jobId_key" ON "JobMatch"("userId", "jobId");
CREATE INDEX "JobMatch_userId_matchScore_idx" ON "JobMatch"("userId", "matchScore");

ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Drop match columns from shared Job
ALTER TABLE "Job" DROP COLUMN IF EXISTS "matchScore";
ALTER TABLE "Job" DROP COLUMN IF EXISTS "matchReasons";
ALTER TABLE "Job" DROP COLUMN IF EXISTS "missingSkills";
ALTER TABLE "Job" DROP COLUMN IF EXISTS "interviewDifficulty";
ALTER TABLE "Job" DROP COLUMN IF EXISTS "salaryEstimate";
ALTER TABLE "Job" DROP COLUMN IF EXISTS "recommendation";
ALTER TABLE "Job" DROP COLUMN IF EXISTS "matchSource";

-- 4. Resume → per user
ALTER TABLE "Resume" ADD COLUMN "userId" TEXT;

UPDATE "Resume" SET "userId" = 'legacy_default_user' WHERE "userId" IS NULL;

-- Keep only one resume for the legacy user if multiples exist
DELETE FROM "Resume"
WHERE "id" NOT IN (
  SELECT "id" FROM (
    SELECT "id" FROM "Resume" WHERE "userId" = 'legacy_default_user'
    ORDER BY "updatedAt" DESC LIMIT 1
  ) keep_one
) AND "userId" = 'legacy_default_user';

ALTER TABLE "Resume" ALTER COLUMN "userId" SET NOT NULL;
CREATE UNIQUE INDEX "Resume_userId_key" ON "Resume"("userId");
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Application → per user
ALTER TABLE "Application" ADD COLUMN "userId" TEXT;
UPDATE "Application" SET "userId" = 'legacy_default_user' WHERE "userId" IS NULL;
ALTER TABLE "Application" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Application" DROP CONSTRAINT IF EXISTS "Application_jobId_key";
DROP INDEX IF EXISTS "Application_jobId_key";

CREATE UNIQUE INDEX "Application_userId_jobId_key" ON "Application"("userId", "jobId");
CREATE INDEX "Application_userId_idx" ON "Application"("userId");
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
