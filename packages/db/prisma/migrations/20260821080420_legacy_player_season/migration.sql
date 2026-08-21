-- CreateTable
CREATE TABLE "LegacyPlayerSeason" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '3rd.supply',
    "sourcePlayerId" TEXT,
    "nickname" TEXT NOT NULL,
    "leagueSlug" TEXT,
    "season" INTEGER NOT NULL,
    "division" INTEGER,
    "clanName" TEXT,
    "wins" INTEGER,
    "losses" INTEGER,
    "winRate" DOUBLE PRECISION,
    "kills" INTEGER,
    "deaths" INTEGER,
    "kd" DOUBLE PRECISION,
    "finalRating" INTEGER,
    "finalRank" INTEGER,
    "rankCount" INTEGER,
    "sourceUrl" TEXT,
    "rawSnapshot" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "LegacyPlayerSeason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPlayerSeason_dedupeKey_key" ON "LegacyPlayerSeason"("dedupeKey");

-- CreateIndex
CREATE INDEX "LegacyPlayerSeason_nickname_idx" ON "LegacyPlayerSeason"("nickname");

-- CreateIndex
CREATE INDEX "LegacyPlayerSeason_sourcePlayerId_idx" ON "LegacyPlayerSeason"("sourcePlayerId");

-- CreateIndex
CREATE INDEX "LegacyPlayerSeason_leagueSlug_season_idx" ON "LegacyPlayerSeason"("leagueSlug", "season");
