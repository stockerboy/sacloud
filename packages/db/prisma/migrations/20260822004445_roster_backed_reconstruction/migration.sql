-- AlterTable
ALTER TABLE "NexonMatch" ADD COLUMN     "reconstructedAt" TIMESTAMP(3),
ADD COLUMN     "reconstruction" JSONB;

-- AlterTable
ALTER TABLE "NexonPollState" ADD COLUMN     "priorityClass" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN     "propagatedAt" TIMESTAMP(3),
ADD COLUMN     "propagationReason" TEXT;

-- CreateTable
CREATE TABLE "LeagueRosterMembership" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueClanId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seasonId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueRosterMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeagueRosterMembership_playerId_joinedAt_idx" ON "LeagueRosterMembership"("playerId", "joinedAt");

-- CreateIndex
CREATE INDEX "LeagueRosterMembership_leagueId_joinedAt_idx" ON "LeagueRosterMembership"("leagueId", "joinedAt");

-- CreateIndex
CREATE INDEX "LeagueRosterMembership_leagueClanId_idx" ON "LeagueRosterMembership"("leagueClanId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueRosterMembership_leagueClanId_playerId_joinedAt_key" ON "LeagueRosterMembership"("leagueClanId", "playerId", "joinedAt");

-- CreateIndex
CREATE INDEX "NexonPollState_priorityClass_nextPollAt_idx" ON "NexonPollState"("priorityClass", "nextPollAt");

-- AddForeignKey
ALTER TABLE "LeagueRosterMembership" ADD CONSTRAINT "LeagueRosterMembership_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueRosterMembership" ADD CONSTRAINT "LeagueRosterMembership_leagueClanId_fkey" FOREIGN KEY ("leagueClanId") REFERENCES "LeagueClan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueRosterMembership" ADD CONSTRAINT "LeagueRosterMembership_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueRosterMembership" ADD CONSTRAINT "LeagueRosterMembership_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

