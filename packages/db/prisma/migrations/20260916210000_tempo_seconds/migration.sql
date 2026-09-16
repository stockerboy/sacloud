-- ★게임템포★ — 라운드마다 「먼저 겪은 일」 까지의 초 (2026-09-16 사장님)
-- 옛 `deathSeconds`(죽은 라운드만)는 그대로 둔다 — 지우지 않는다.
ALTER TABLE "MatchPlayerHex"   ADD COLUMN IF NOT EXISTS "tempoSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex"   ADD COLUMN IF NOT EXISTS "tempoCount"   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerHex"  ADD COLUMN IF NOT EXISTS "tempoSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerHex"  ADD COLUMN IF NOT EXISTS "tempoCount"   INTEGER NOT NULL DEFAULT 0;
