-- ★개인 새 6축의 재료★ (2026-09-16 밤 사장님)
--   기회창출(openRounds) · 기회차단(foeOpenRounds·cutRounds) · 안전함(aliveRounds)
--   스나차이/라플차이(gapWinGames — 시즌 줄에만)
-- 옛 재료는 그대로 둔다 — 지우지 않는다.
ALTER TABLE "MatchPlayerHex"  ADD COLUMN IF NOT EXISTS "openRounds"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex"  ADD COLUMN IF NOT EXISTS "foeOpenRounds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex"  ADD COLUMN IF NOT EXISTS "cutRounds"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex"  ADD COLUMN IF NOT EXISTS "aliveRounds"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerHex" ADD COLUMN IF NOT EXISTS "openRounds"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerHex" ADD COLUMN IF NOT EXISTS "foeOpenRounds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerHex" ADD COLUMN IF NOT EXISTS "cutRounds"     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerHex" ADD COLUMN IF NOT EXISTS "aliveRounds"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerHex" ADD COLUMN IF NOT EXISTS "gapWinGames"   INTEGER NOT NULL DEFAULT 0;
