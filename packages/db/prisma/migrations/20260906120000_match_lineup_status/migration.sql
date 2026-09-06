-- ★라인업이 왜 없는지를 Match 에 적는다★ (2026-09-06 · Part 4 · 사장님 지시)
--
--   «라인업이 완전하지 않으면 lineup_status = incomplete 로 남김»
--   «보이는 일부 인원만 가지고 4대4/5대5/6대6으로 임의 판단 금지»
--
-- ⚠ ★기존 행에는 아무 값도 넣지 않는다.★ 전부 NULL 로 시작한다 —
--   NULL 은 «아직 안 봤다» 는 뜻이고, ★모르는 것을 아는 척하지 않는다★.
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "lineupStatus"     TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "lineupSkipReason" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "lineupSeen"       INTEGER;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "lineupCheckedAt"  TIMESTAMPTZ(3);

-- 「라인업 못 만든 경기」를 리그별로 세는 질의가 매 판 돈다
CREATE INDEX IF NOT EXISTS "Match_lineupStatus_idx" ON "Match" ("lineupStatus");
