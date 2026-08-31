-- 「알」이 깨진 기록 (docs/EGG_SYSTEM_SPEC.md)
--   깨진 상태를 매번 계산하면 «누가 언제 왜 깼는지» 가 사라진다.
--   특히 관리자 강제(admin)와 본인 인증(verified)은 뜻이 다르므로 구분해 남긴다.
CREATE TABLE IF NOT EXISTS "EggBreak" (
    "id" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "brokenByUserId" TEXT,
    "note" TEXT,
    "brokenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EggBreak_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EggBreak_targetKind_targetId_key" ON "EggBreak"("targetKind", "targetId");
CREATE INDEX IF NOT EXISTS "EggBreak_targetKind_idx" ON "EggBreak"("targetKind");
CREATE INDEX IF NOT EXISTS "EggBreak_brokenAt_idx" ON "EggBreak"("brokenAt");
