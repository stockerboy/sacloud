-- CreateTable
CREATE TABLE "LegacyCollectionJob" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '3rd.supply',
    "leagueSlug" TEXT NOT NULL DEFAULT 'supply',
    "status" TEXT NOT NULL DEFAULT 'running',
    "totalPlayers" INTEGER NOT NULL DEFAULT 0,
    "processedPlayers" INTEGER NOT NULL DEFAULT 0,
    "successPlayers" INTEGER NOT NULL DEFAULT 0,
    "failedPlayers" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "lastPlayerId" TEXT,
    "stopReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "LegacyCollectionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyCollectionPlayer" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourcePlayerId" TEXT NOT NULL,
    "nickname" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyCollectionPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyCollectionJob_status_startedAt_idx" ON "LegacyCollectionJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "LegacyCollectionPlayer_jobId_status_idx" ON "LegacyCollectionPlayer"("jobId", "status");

-- CreateIndex
CREATE INDEX "LegacyCollectionPlayer_sourcePlayerId_idx" ON "LegacyCollectionPlayer"("sourcePlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyCollectionPlayer_jobId_sourcePlayerId_key" ON "LegacyCollectionPlayer"("jobId", "sourcePlayerId");

-- AddForeignKey
ALTER TABLE "LegacyCollectionPlayer" ADD CONSTRAINT "LegacyCollectionPlayer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "LegacyCollectionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
