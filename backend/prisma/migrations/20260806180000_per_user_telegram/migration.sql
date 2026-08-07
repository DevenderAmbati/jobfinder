-- Per-user Telegram linking + notification recipient tracking.
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramLinkToken" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");
CREATE UNIQUE INDEX "User_telegramLinkToken_key" ON "User"("telegramLinkToken");

ALTER TABLE "NotificationLog" ADD COLUMN "userId" TEXT;

CREATE INDEX "NotificationLog_userId_jobId_idx" ON "NotificationLog"("userId", "jobId");

ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
