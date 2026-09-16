-- ★크랙 성공★ — 칠한 구역 안 25초 첫 킬 (2026-09-16 사장님)
-- 옛 `firstKills`(구역을 안 보는 셈)는 그대로 둔다 — 지우지 않는다.
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "crackKills" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerHex" ADD COLUMN IF NOT EXISTS "crackKills" INTEGER NOT NULL DEFAULT 0;
