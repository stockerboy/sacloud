-- ★선수 육각형★ — 경기별 재료 + 리그 선수당 한 줄 (2026-09-10 · 사장님 확정)
--
-- 사장님: «개인랭킹 이걸로 확정이다 (…) 클랜은 그냥 원래하던대로 가고»
-- 화면은 LeaguePlayerHex 한 줄만 읽는다. MatchPlayerHex 는 잡의 재료다.
--
-- ★추가만 한다. DROP 도 UPDATE 도 없다.★
CREATE TABLE IF NOT EXISTS "MatchPlayerHex" (
  "matchId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "weapon" INTEGER,
  "rounds" INTEGER NOT NULL DEFAULT 0,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "firstKills" INTEGER NOT NULL DEFAULT 0,
  "burstRounds" INTEGER NOT NULL DEFAULT 0,
  "aloneRounds" INTEGER NOT NULL DEFAULT 0,
  "aloneWon" INTEGER NOT NULL DEFAULT 0,
  "outRounds" INTEGER NOT NULL DEFAULT 0,
  "outWon" INTEGER NOT NULL DEFAULT 0,
  "duelWon" INTEGER NOT NULL DEFAULT 0,
  "duelLost" INTEGER NOT NULL DEFAULT 0,
  "formulaVersion" TEXT NOT NULL,
  "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchPlayerHex_pkey" PRIMARY KEY ("matchId","playerId")
);
CREATE INDEX IF NOT EXISTS "MatchPlayerHex_playerId_idx" ON "MatchPlayerHex"("playerId");
CREATE INDEX IF NOT EXISTS "MatchPlayerHex_formulaVersion_builtAt_idx" ON "MatchPlayerHex"("formulaVersion", "builtAt");

CREATE TABLE IF NOT EXISTS "LeaguePlayerHex" (
  "leaguePlayerId" TEXT NOT NULL,
  "weapon" INTEGER,
  "games" INTEGER NOT NULL DEFAULT 0,
  "weaponGames" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "rounds" INTEGER NOT NULL DEFAULT 0,
  "save" DOUBLE PRECISION, "savePct" DOUBLE PRECISION, "saveRank" INTEGER, "saveTotal" INTEGER,
  "duel" DOUBLE PRECISION, "duelPct" DOUBLE PRECISION, "duelRank" INTEGER, "duelTotal" INTEGER,
  "carry" DOUBLE PRECISION, "carryPct" DOUBLE PRECISION, "carryRank" INTEGER, "carryTotal" INTEGER,
  "opening" DOUBLE PRECISION, "openingPct" DOUBLE PRECISION, "openingRank" INTEGER, "openingTotal" INTEGER,
  "burst" DOUBLE PRECISION, "burstPct" DOUBLE PRECISION, "burstRank" INTEGER, "burstTotal" INTEGER,
  "outnumbered" DOUBLE PRECISION, "outnumberedPct" DOUBLE PRECISION, "outnumberedRank" INTEGER, "outnumberedTotal" INTEGER,
  "winRate" DOUBLE PRECISION, "winRatePct" DOUBLE PRECISION, "winRateRank" INTEGER, "winRateTotal" INTEGER,
  "hex" DOUBLE PRECISION,
  "tierFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.367,
  "shrink" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "clanBonus" INTEGER NOT NULL DEFAULT 0,
  "score" INTEGER, "scoreRank" INTEGER, "scoreTotal" INTEGER,
  "duelWon" INTEGER NOT NULL DEFAULT 0, "duelLost" INTEGER NOT NULL DEFAULT 0,
  "aloneRounds" INTEGER NOT NULL DEFAULT 0, "aloneWon" INTEGER NOT NULL DEFAULT 0,
  "outRounds" INTEGER NOT NULL DEFAULT 0, "outWon" INTEGER NOT NULL DEFAULT 0,
  "firstKills" INTEGER NOT NULL DEFAULT 0, "burstRounds" INTEGER NOT NULL DEFAULT 0,
  "tier1Games" INTEGER NOT NULL DEFAULT 0, "tier2Games" INTEGER NOT NULL DEFAULT 0, "tier3Games" INTEGER NOT NULL DEFAULT 0,
  "formulaVersion" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaguePlayerHex_pkey" PRIMARY KEY ("leaguePlayerId")
);
CREATE INDEX IF NOT EXISTS "LeaguePlayerHex_weapon_scoreRank_idx" ON "LeaguePlayerHex"("weapon", "scoreRank");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchPlayerHex_matchId_fkey') THEN
    ALTER TABLE "MatchPlayerHex" ADD CONSTRAINT "MatchPlayerHex_matchId_fkey"
      FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchPlayerHex_playerId_fkey') THEN
    ALTER TABLE "MatchPlayerHex" ADD CONSTRAINT "MatchPlayerHex_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaguePlayerHex_leaguePlayerId_fkey') THEN
    ALTER TABLE "LeaguePlayerHex" ADD CONSTRAINT "LeaguePlayerHex_leaguePlayerId_fkey"
      FOREIGN KEY ("leaguePlayerId") REFERENCES "LeaguePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
