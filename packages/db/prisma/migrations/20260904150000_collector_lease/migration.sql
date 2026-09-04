-- ★수집기 단일 실행 보장 — 임대(lease)★ (2026-09-04 · Pre-Part 0)
--
-- 추가만 한다. DROP 도 UPDATE 도 없다. 이미 있으면 건너뛴다.
--
-- ⚠ ★TIMESTAMPTZ 다 — 이 저장소의 다른 표는 시간대 없는 `TIMESTAMP` 을 쓴다.★
--   그러면 Date 를 넣고 다시 읽을 때 ★정확히 9시간 어깼난다★ (실측 2026-09-04):
--       넣은 값 03:04:05Z → DB 안 12:04:05 → 읽은 값 12:04:05Z
--   다른 표는 양쪽이 같이 어긋나서 서로 맞지만, ★자물쇠는 그러면 안 된다★ —
--   「지금 살아 있나」를 JS 가 판정해야 하고, 9시간 틀리면 ★죽은 임대를 살았다고 읽는다.★
--
CREATE TABLE IF NOT EXISTS "CollectorLease" (
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "command" TEXT,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "releasedAt" TIMESTAMPTZ(3),
    "renewCount" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CollectorLease_pkey" PRIMARY KEY ("name")
);

CREATE INDEX IF NOT EXISTS "CollectorLease_expiresAt_idx" ON "CollectorLease"("expiresAt");
