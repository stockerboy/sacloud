-- AlterTable
ALTER TABLE "NexonMatchParticipant" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'match_detail';

-- CreateTable
CREATE TABLE "NexonMatchObservation" (
    "id" TEXT NOT NULL,
    "nexonMatchId" TEXT NOT NULL,
    "ouid" TEXT NOT NULL,
    "userName" TEXT,
    "matchResult" TEXT,
    "outcome" TEXT,
    "kill" INTEGER,
    "death" INTEGER,
    "assist" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'player_match_list',
    "rawImportId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NexonMatchObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NexonPollState" (
    "id" TEXT NOT NULL,
    "ouid" TEXT NOT NULL,
    "playerId" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'hot',
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastPolledAt" TIMESTAMP(3),
    "lastSuccessfulPollAt" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNewMatchAt" TIMESTAMP(3),
    "consecutiveEmptyPolls" INTEGER NOT NULL DEFAULT 0,
    "recentNewMatchCount" INTEGER NOT NULL DEFAULT 0,
    "manualRefreshRequestedAt" TIMESTAMP(3),
    "lastPollStatus" TEXT,
    "lastError" TEXT,
    "totalPolls" INTEGER NOT NULL DEFAULT 0,
    "totalNewMatches" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexonPollState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NexonPollRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "playersPolled" INTEGER NOT NULL DEFAULT 0,
    "matchListRequests" INTEGER NOT NULL DEFAULT 0,
    "uniqueNewMatchIds" INTEGER NOT NULL DEFAULT 0,
    "duplicateMatchIds" INTEGER NOT NULL DEFAULT 0,
    "matchDetailRequests" INTEGER NOT NULL DEFAULT 0,
    "detailSkippedByDedupe" INTEGER NOT NULL DEFAULT 0,
    "emptyPolls" INTEGER NOT NULL DEFAULT 0,
    "rateLimitedCount" INTEGER NOT NULL DEFAULT 0,
    "failedPolls" INTEGER NOT NULL DEFAULT 0,
    "activePlayersPolled" INTEGER NOT NULL DEFAULT 0,
    "inactivePlayersPolled" INTEGER NOT NULL DEFAULT 0,
    "requestsForActive" INTEGER NOT NULL DEFAULT 0,
    "requestsForInactive" INTEGER NOT NULL DEFAULT 0,
    "migrationVersion" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "NexonPollRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NexonMatchObservation_ouid_idx" ON "NexonMatchObservation"("ouid");

-- CreateIndex
CREATE UNIQUE INDEX "NexonMatchObservation_nexonMatchId_ouid_key" ON "NexonMatchObservation"("nexonMatchId", "ouid");

-- CreateIndex
CREATE UNIQUE INDEX "NexonPollState_ouid_key" ON "NexonPollState"("ouid");

-- CreateIndex
CREATE INDEX "NexonPollState_nextPollAt_idx" ON "NexonPollState"("nextPollAt");

-- CreateIndex
CREATE INDEX "NexonPollState_tier_nextPollAt_idx" ON "NexonPollState"("tier", "nextPollAt");

-- CreateIndex
CREATE INDEX "NexonPollState_manualRefreshRequestedAt_idx" ON "NexonPollState"("manualRefreshRequestedAt");

-- CreateIndex
CREATE INDEX "NexonPollState_playerId_idx" ON "NexonPollState"("playerId");

-- CreateIndex
CREATE INDEX "NexonPollRun_startedAt_idx" ON "NexonPollRun"("startedAt");

-- AddForeignKey
ALTER TABLE "NexonMatchObservation" ADD CONSTRAINT "NexonMatchObservation_nexonMatchId_fkey" FOREIGN KEY ("nexonMatchId") REFERENCES "NexonMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

