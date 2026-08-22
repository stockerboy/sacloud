-- AlterTable
ALTER TABLE "LeagueClanSeason" ADD COLUMN     "clanNameAtSeason" TEXT,
ADD COLUMN     "legacyClanSlug" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "winRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN     "assist" INTEGER,
ADD COLUMN     "clanNameAtSeason" TEXT,
ADD COLUMN     "divisionAtSeason" INTEGER,
ADD COLUMN     "headshot" INTEGER,
ADD COLUMN     "kdRate" DOUBLE PRECISION,
ADD COLUMN     "killPerMatch" DOUBLE PRECISION,
ADD COLUMN     "legacyLeaguePlayerId" TEXT,
ADD COLUMN     "legacyPlayerId" TEXT,
ADD COLUMN     "mvpCount" INTEGER,
ADD COLUMN     "nicknameAtSeason" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "winRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "frozen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seasonType" TEXT NOT NULL DEFAULT 'official';

-- CreateIndex
CREATE INDEX "Season_leagueId_startedAt_idx" ON "Season"("leagueId", "startedAt");

