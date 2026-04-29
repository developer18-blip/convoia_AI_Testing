-- Memory Layer V2: UserFact + UserConversationSummary tables
-- See docs/features/memory-layer-redesign.md for architecture.
-- Pure additions; no destructive operations on existing tables.

-- CreateEnum
CREATE TYPE "FactCategory" AS ENUM ('WORK', 'PERSONAL', 'TOP_OF_MIND', 'HISTORY');

-- CreateEnum
CREATE TYPE "FactSource" AS ENUM ('EXTRACTED', 'USER_ADDED', 'MIGRATED');

-- CreateTable
CREATE TABLE "UserFact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "FactCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "source" "FactSource" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sourceConvoId" TEXT,
    "sourceMessageId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "supersededBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "UserFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConversationSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "factIds" TEXT[],
    "messageCount" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserConversationSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFact_userId_category_active_idx" ON "UserFact"("userId", "category", "active");

-- CreateIndex
CREATE INDEX "UserFact_userId_supersededBy_idx" ON "UserFact"("userId", "supersededBy");

-- CreateIndex
CREATE INDEX "UserFact_userId_lastUsedAt_idx" ON "UserFact"("userId", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserConversationSummary_conversationId_key" ON "UserConversationSummary"("conversationId");

-- CreateIndex
CREATE INDEX "UserConversationSummary_userId_processedAt_idx" ON "UserConversationSummary"("userId", "processedAt");

-- AddForeignKey
ALTER TABLE "UserFact" ADD CONSTRAINT "UserFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserConversationSummary" ADD CONSTRAINT "UserConversationSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
