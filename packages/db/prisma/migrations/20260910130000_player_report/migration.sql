-- ★핵의심 신고★ (2026-09-10 · 사장님: "신고하기 기능 만들어 이건 로그인한 회원만 누를 수 있게")
-- 회원당 선수당 하루(KST) 한 번. 지우지 않는다 — 거둔 신고는 withdrawnAt 을 찍는다.
--
-- ★추가만 한다. DROP 도 UPDATE 도 없다.★
CREATE TABLE IF NOT EXISTS "PlayerReport" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'hack',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" TIMESTAMP(3),
  CONSTRAINT "PlayerReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerReport_playerId_userId_day_key" ON "PlayerReport"("playerId", "userId", "day");
CREATE INDEX IF NOT EXISTS "PlayerReport_playerId_withdrawnAt_idx" ON "PlayerReport"("playerId", "withdrawnAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlayerReport_playerId_fkey') THEN
    ALTER TABLE "PlayerReport" ADD CONSTRAINT "PlayerReport_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PlayerReport_userId_fkey') THEN
    ALTER TABLE "PlayerReport" ADD CONSTRAINT "PlayerReport_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
