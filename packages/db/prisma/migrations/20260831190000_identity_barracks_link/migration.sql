-- 병영수첩 계정 ↔ ouid 다리 (D-221)
--   조회만으로 잇지 않는다. user/basic 으로 되돌려 확인한 것만 채운다.
ALTER TABLE "NexonIdentity" ADD COLUMN "barracksNexonSn" TEXT;
ALTER TABLE "NexonIdentity" ADD COLUMN "barracksUsn" TEXT;
ALTER TABLE "NexonIdentity" ADD COLUMN "barracksLinkNick" TEXT;
ALTER TABLE "NexonIdentity" ADD COLUMN "barracksLinkedAt" TIMESTAMP(3);

CREATE INDEX "NexonIdentity_barracksNexonSn_idx" ON "NexonIdentity"("barracksNexonSn");
CREATE INDEX "NexonIdentity_barracksUsn_idx" ON "NexonIdentity"("barracksUsn");
