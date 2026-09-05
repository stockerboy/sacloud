-- ★같은 경기가 두 줄일 때 하나만 남긴다 — 지우지 않고 표시만 붙인다★ (2026-09-05)
--
-- 추가만 한다. DROP 도 UPDATE 도 없다. 기존 행은 전부 NULL = 「살아 있는 줄」이다.
-- ⚠ 과거(기준시각 이전)에는 안 쓴다 — 그때는 한 경기가 여러 리그에 있는 것이 정상이었다.
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMPTZ(3);
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "supersededBy" TEXT;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "supersededReason" TEXT;

-- 숨긴 줄만 빨리 찾을 수 있게. 자물쇠는 다음 마이그레이션이 건다
CREATE INDEX IF NOT EXISTS "Match_supersededAt_idx" ON "Match"("supersededAt");
