-- ★시즌7 마감 카드가 쓰는 칸★ (2026-09-06 · Part 5 · 사장님 지시)
--
--   시즌7 = 우리가 보유한 3rd.supply 경기/참가기록을 기간 고정 후 직접 집계한 카드다.
--   원본 카드(시즌1~6)는 이 값을 주지 않으므로 ★그 행들은 전부 NULL 로 남는다★.
--   0 을 넣지 않는다 — «0킬 0데스» 는 거짓말이다.
--
-- ⚠ 기존 10,673행의 값은 ★한 칸도 건드리지 않는다★ (ADD COLUMN 뿐이다).
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "games"        INTEGER;
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "dropoutCount" INTEGER;
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "rifleGames"   INTEGER;
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "rifleKill"    INTEGER;
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "rifleDeath"   INTEGER;
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "sniperGames"  INTEGER;
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "sniperKill"   INTEGER;
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "sniperDeath"  INTEGER;
