-- 클랜 **마스터 인증** — 인게임 스크린샷 1장을 사람이 심사한다 (2026-09-01 · D-253)
--
-- ⚠ 이 파일은 **운영 DB 에 적용되지 않았다.** 적용은 사람이 한다.
-- 기존 데이터를 건드리지 않는 **순수 추가**다. 되돌리기는 맨 아래 주석 참조.

-- 1) 신청
CREATE TABLE "ClanMasterClaim" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "clanId"          TEXT NOT NULL,
    -- 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked'
    "status"          TEXT NOT NULL DEFAULT 'pending',
    -- 신청자가 관리자에게 남긴 한 줄
    "note"            TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt"       TIMESTAMP(3),
    -- 처리자. 계정이 지워져도 이력은 남기려고 FK 를 걸지 않는다 (PlayerLinkClaim 과 같다)
    "decidedByUserId" TEXT,
    "decidedByEmail"  TEXT,
    -- 거부 사유. 신청자 화면이 그대로 보여 준다
    "decisionNote"    TEXT,
    CONSTRAINT "ClanMasterClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClanMasterClaim_userId_clanId_key" ON "ClanMasterClaim" ("userId", "clanId");
CREATE INDEX "ClanMasterClaim_status_createdAt_idx"     ON "ClanMasterClaim" ("status", "createdAt");
CREATE INDEX "ClanMasterClaim_clanId_status_idx"        ON "ClanMasterClaim" ("clanId", "status");

ALTER TABLE "ClanMasterClaim"
  ADD CONSTRAINT "ClanMasterClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClanMasterClaim"
  ADD CONSTRAINT "ClanMasterClaim_clanId_fkey"
  FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ⚠ 부분 유니크 인덱스. **Prisma 스키마로는 표현할 수 없어 손으로 넣는다.**
--
--   클랜 하나에 승인된 마스터는 **하나뿐**이다.
--   승인은 사람이 사진을 보고 하는 판정이라 실수할 수 있다. 애플리케이션 검사만 두면
--   두 관리자가 동시에 서로 다른 신청을 승인했을 때 **둘 다 통과한다.**
--   최종 보증은 여기다 — DB 가 한쪽을 떨어뜨린다.
CREATE UNIQUE INDEX "ClanMasterClaim_approved_clan_key"
  ON "ClanMasterClaim" ("clanId")
  WHERE "status" = 'approved';

-- 2) 스크린샷 원본 바이트
--
--   ⚠ 오브젝트 스토리지가 아직 없다. 기존 `/api/uploads` 는 운영에서 스스로를 막는다(D-147).
--   그래서 가장 작은 해법으로 바이트를 그대로 넣는다. 상한은 계약이 3MB 로 건다.
--   표를 나눈 이유는 `findMany()` 한 번이 수십 MB 를 끌어오는 사고를 **구조적으로** 막기 위해서다.
CREATE TABLE "ClanMasterClaimImage" (
    "claimId"   TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "byteSize"  INTEGER NOT NULL,
    "data"      BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClanMasterClaimImage_pkey" PRIMARY KEY ("claimId")
);

ALTER TABLE "ClanMasterClaimImage"
  ADD CONSTRAINT "ClanMasterClaimImage_claimId_fkey"
  FOREIGN KEY ("claimId") REFERENCES "ClanMasterClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 되돌리기
--   DROP TABLE "ClanMasterClaimImage";
--   DROP TABLE "ClanMasterClaim";
