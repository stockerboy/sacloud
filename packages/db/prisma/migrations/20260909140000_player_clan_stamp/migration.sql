-- ★그 선수 본인의 소속을 도장 찍어 둘 자리★ (2026-09-09)
--
-- 배틀로그는 「이 팀으로 뛰었다」까지만 알려 준다. 그래서 용병이 남의 클랜 마크를
-- 달고 나왔다. 이 칸은 수집 시점의 본인 소속을 박아 두는 자리다.
-- 한 번 찍히면 다시 안 바꾼다 — 이적해도 과거 경기는 그대로다.
--
-- ★추가만 한다. DROP 도 UPDATE 도 없다.★
ALTER TABLE "MatchPlayerStat" ADD COLUMN IF NOT EXISTS "playerClanId" TEXT;
ALTER TABLE "MatchPlayerStat" ADD COLUMN IF NOT EXISTS "playerClanStampedAt" TIMESTAMP(3);

-- 클랜 행이 사라져도 기록을 지우지 않는다 — 도장만 비운다
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MatchPlayerStat_playerClanId_fkey') THEN
    ALTER TABLE "MatchPlayerStat"
      ADD CONSTRAINT "MatchPlayerStat_playerClanId_fkey"
      FOREIGN KEY ("playerClanId") REFERENCES "Clan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MatchPlayerStat_playerClanId_idx" ON "MatchPlayerStat"("playerClanId");
