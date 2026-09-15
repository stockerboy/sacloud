-- ★캐리력 새 기준의 재료★ (2026-09-15 사장님: «캐리력은 라운드당 한 최대 킬 수»)
--
-- 두 칸을 더한다. 옛 줄은 0 으로 들어가고, `player-hex-v1.1` 로 다시 세면 채워진다.
--   maxRoundKills  그 창에서 한 라운드에 몰아친 최대 킬
--   maxRoundTimes  그 최고를 몇 라운드에서 냈나 (동점을 가르는 꼬리)
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "maxRoundKills" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "maxRoundTimes" INTEGER NOT NULL DEFAULT 0;
