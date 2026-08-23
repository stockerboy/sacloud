-- 서든어택 계정 연동 신청 (D-121).
--
-- 넥슨 Open API에는 사용자가 계정 소유를 증명할 수단이 없다.
-- 자동 연결을 폐기하고 운영자 승인 구조로 바꾼다.

CREATE TABLE "PlayerLinkClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decidedByEmail" TEXT,
    "decisionNote" TEXT,

    CONSTRAINT "PlayerLinkClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerLinkClaim_userId_playerId_key" ON "PlayerLinkClaim"("userId", "playerId");
CREATE INDEX "PlayerLinkClaim_status_createdAt_idx" ON "PlayerLinkClaim"("status", "createdAt");
CREATE INDEX "PlayerLinkClaim_playerId_status_idx" ON "PlayerLinkClaim"("playerId", "status");

ALTER TABLE "PlayerLinkClaim" ADD CONSTRAINT "PlayerLinkClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerLinkClaim" ADD CONSTRAINT "PlayerLinkClaim_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
