-- 신원 관측 이력 (D-220)
--   닉·클랜이 **바뀐 순간**을 남긴다. 폴링할 때마다가 아니라 달라졌을 때만 한 줄 붙인다.
--   `NexonIdentity.userName` 은 지금 값 하나뿐이라 "언제 바뀌었나" 를 담지 못한다.
CREATE TABLE "NexonIdentityObservation" (
    "id" TEXT NOT NULL,
    "ouid" TEXT NOT NULL,
    "userName" TEXT,
    "clanName" TEXT,
    "changed" TEXT NOT NULL,
    "prevUserName" TEXT,
    "prevClanName" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NexonIdentityObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NexonIdentityObservation_ouid_observedAt_idx"
    ON "NexonIdentityObservation"("ouid", "observedAt");
CREATE INDEX "NexonIdentityObservation_observedAt_idx"
    ON "NexonIdentityObservation"("observedAt");
