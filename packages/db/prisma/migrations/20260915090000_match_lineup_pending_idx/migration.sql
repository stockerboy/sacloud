-- ★라인업이 손볼 경기를 찾는 길★ (2026-09-15)
--
-- 이 인덱스가 없어서 라인업 잡이 DB 시간초과(57014)로 매번 죽었다.
-- 오늘 23번 돌아 완료된 회차가 0번이었고, 화면에 「기록 없음」이 줄줄이 떴다.
--
-- ★부분 인덱스★ 다 — 손볼 것이 있는 경기만 담는다. 끝난 경기는 안 들어와서 작게 유지된다.
CREATE INDEX IF NOT EXISTS "Match_lineup_pending_idx"
  ON "Match" ("leagueId", "startAt")
  WHERE "lineupStatus" IS NULL OR "lineupStatus" = 'incomplete';
