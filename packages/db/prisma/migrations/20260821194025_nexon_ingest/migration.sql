-- DropIndex
DROP INDEX "RawImport_source_endpoint_sourceId_migrationVersion_key";

-- AlterTable
ALTER TABLE "Match" ALTER COLUMN "endAt" DROP NOT NULL,
ALTER COLUMN "playTime" DROP NOT NULL,
ALTER COLUMN "blueFirst" DROP NOT NULL,
ALTER COLUMN "blueFirst" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MatchPlayerStat" ALTER COLUMN "weapon" DROP NOT NULL,
ALTER COLUMN "dropout" DROP NOT NULL,
ALTER COLUMN "dropout" DROP DEFAULT,
ALTER COLUMN "mvp" DROP NOT NULL,
ALTER COLUMN "mvp" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RawImport" ADD COLUMN     "contentHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fetchCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "firstFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "NexonIdentity" (
    "id" TEXT NOT NULL,
    "ouid" TEXT NOT NULL,
    "playerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "userName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3),
    "linkReason" TEXT,
    "linkedBy" TEXT,
    "supersededByOuid" TEXT,
    "supersededAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexonIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NexonNickname" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "nicknameLower" TEXT NOT NULL,
    "ouid" TEXT,
    "identityKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'nexon',
    "observations" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NexonNickname_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NexonIdentityCandidate" (
    "id" TEXT NOT NULL,
    "ouid" TEXT NOT NULL,
    "targetPlayerId" TEXT,
    "targetOuid" TEXT,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "status" TEXT NOT NULL DEFAULT 'open',
    "candidateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "note" TEXT,

    CONSTRAINT "NexonIdentityCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NexonMatch" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'nexon',
    "sourceMatchId" TEXT NOT NULL,
    "matchMode" TEXT,
    "matchType" TEXT,
    "dateMatch" TIMESTAMP(3),
    "matchMap" TEXT,
    "participantCount" INTEGER,
    "discoveredByOuid" TEXT,
    "listRawImportId" TEXT,
    "detailRawImportId" TEXT,
    "detailFetchedAt" TIMESTAMP(3),
    "validationStatus" TEXT NOT NULL DEFAULT 'pending',
    "validationIssues" JSONB,
    "projectionStatus" TEXT NOT NULL DEFAULT 'pending',
    "projectionReason" TEXT,
    "projectedMatchId" TEXT,
    "projectedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshDueAt" TIMESTAMP(3),
    "staleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexonMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NexonMatchParticipant" (
    "id" TEXT NOT NULL,
    "nexonMatchId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "teamId" TEXT,
    "matchResult" TEXT,
    "outcome" TEXT,
    "userName" TEXT,
    "seasonGrade" TEXT,
    "clanName" TEXT,
    "kill" INTEGER,
    "death" INTEGER,
    "assist" INTEGER,
    "headshot" INTEGER,
    "damage" DOUBLE PRECISION,
    "resolvedPlayerId" TEXT,
    "resolvedOuid" TEXT,
    "resolutionStatus" TEXT NOT NULL DEFAULT 'unresolved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NexonMatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NexonIdentity_ouid_key" ON "NexonIdentity"("ouid");

-- CreateIndex
CREATE INDEX "NexonIdentity_status_idx" ON "NexonIdentity"("status");

-- CreateIndex
CREATE INDEX "NexonIdentity_playerId_idx" ON "NexonIdentity"("playerId");

-- CreateIndex
CREATE INDEX "NexonIdentity_userName_idx" ON "NexonIdentity"("userName");

-- CreateIndex
CREATE INDEX "NexonNickname_ouid_idx" ON "NexonNickname"("ouid");

-- CreateIndex
CREATE INDEX "NexonNickname_nicknameLower_idx" ON "NexonNickname"("nicknameLower");

-- CreateIndex
CREATE UNIQUE INDEX "NexonNickname_nicknameLower_identityKey_key" ON "NexonNickname"("nicknameLower", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "NexonIdentityCandidate_candidateKey_key" ON "NexonIdentityCandidate"("candidateKey");

-- CreateIndex
CREATE INDEX "NexonIdentityCandidate_status_idx" ON "NexonIdentityCandidate"("status");

-- CreateIndex
CREATE INDEX "NexonIdentityCandidate_ouid_idx" ON "NexonIdentityCandidate"("ouid");

-- CreateIndex
CREATE INDEX "NexonIdentityCandidate_targetPlayerId_idx" ON "NexonIdentityCandidate"("targetPlayerId");

-- CreateIndex
CREATE INDEX "NexonMatch_projectionStatus_idx" ON "NexonMatch"("projectionStatus");

-- CreateIndex
CREATE INDEX "NexonMatch_validationStatus_idx" ON "NexonMatch"("validationStatus");

-- CreateIndex
CREATE INDEX "NexonMatch_refreshDueAt_idx" ON "NexonMatch"("refreshDueAt");

-- CreateIndex
CREATE INDEX "NexonMatch_dateMatch_idx" ON "NexonMatch"("dateMatch");

-- CreateIndex
CREATE INDEX "NexonMatch_matchType_idx" ON "NexonMatch"("matchType");

-- CreateIndex
CREATE UNIQUE INDEX "NexonMatch_source_sourceMatchId_key" ON "NexonMatch"("source", "sourceMatchId");

-- CreateIndex
CREATE INDEX "NexonMatchParticipant_userName_idx" ON "NexonMatchParticipant"("userName");

-- CreateIndex
CREATE INDEX "NexonMatchParticipant_clanName_idx" ON "NexonMatchParticipant"("clanName");

-- CreateIndex
CREATE INDEX "NexonMatchParticipant_resolvedPlayerId_idx" ON "NexonMatchParticipant"("resolvedPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "NexonMatchParticipant_nexonMatchId_slot_key" ON "NexonMatchParticipant"("nexonMatchId", "slot");

-- CreateIndex
CREATE INDEX "RawImport_source_endpoint_sourceId_idx" ON "RawImport"("source", "endpoint", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "RawImport_source_endpoint_sourceId_migrationVersion_content_key" ON "RawImport"("source", "endpoint", "sourceId", "migrationVersion", "contentHash");

-- AddForeignKey
ALTER TABLE "NexonIdentity" ADD CONSTRAINT "NexonIdentity_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NexonIdentityCandidate" ADD CONSTRAINT "NexonIdentityCandidate_ouid_fkey" FOREIGN KEY ("ouid") REFERENCES "NexonIdentity"("ouid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NexonIdentityCandidate" ADD CONSTRAINT "NexonIdentityCandidate_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NexonMatchParticipant" ADD CONSTRAINT "NexonMatchParticipant_nexonMatchId_fkey" FOREIGN KEY ("nexonMatchId") REFERENCES "NexonMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

