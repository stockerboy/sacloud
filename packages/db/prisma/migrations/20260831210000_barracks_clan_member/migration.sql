-- 병영수첩 클랜원 명단 관측 (D-219)
--   원문에 선수별 소속 클랜이 없어서 이 표가 필요하다.
--   관측이므로 observedAt 을 반드시 함께 둔다 — "지금" 이 아니라 "그때 본" 명단이다.
CREATE TABLE "BarracksClanMember" (
    "id" TEXT NOT NULL,
    "clanSlug" TEXT NOT NULL,
    "clanName" TEXT,
    "strUsn" TEXT NOT NULL,
    "userNexonSn" TEXT NOT NULL,
    "userNick" TEXT,
    "clanLevel" TEXT,
    "clanExp" TEXT,
    "connFlag" INTEGER NOT NULL DEFAULT 0,
    "punishFlag" INTEGER NOT NULL DEFAULT 0,
    "authFlag" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarracksClanMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BarracksClanMember_clanSlug_strUsn_observedAt_key"
    ON "BarracksClanMember"("clanSlug", "strUsn", "observedAt");
CREATE INDEX "BarracksClanMember_clanSlug_observedAt_idx"
    ON "BarracksClanMember"("clanSlug", "observedAt");
CREATE INDEX "BarracksClanMember_strUsn_idx" ON "BarracksClanMember"("strUsn");
CREATE INDEX "BarracksClanMember_userNexonSn_idx" ON "BarracksClanMember"("userNexonSn");
