-- Per-user preference rules (skills, roles, experience, notify threshold).

-- Attach existing singleton rule(s) to the legacy owner, keep one row.
ALTER TABLE "Rule" ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "Rule" SET "userId" = 'legacy_default_user'
WHERE "userId" IS NULL;

DELETE FROM "Rule" a
USING "Rule" b
WHERE a."userId" = b."userId"
  AND a."id" <> b."id"
  AND a."updatedAt" < b."updatedAt";

ALTER TABLE "Rule" ALTER COLUMN "userId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Rule_userId_key" ON "Rule"("userId");

ALTER TABLE "Rule" DROP CONSTRAINT IF EXISTS "Rule_userId_fkey";
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop unused global preference columns.
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "name";
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "countries";
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "cities";
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "excludedRoles";
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "companies";
ALTER TABLE "Rule" DROP COLUMN IF EXISTS "enabled";
