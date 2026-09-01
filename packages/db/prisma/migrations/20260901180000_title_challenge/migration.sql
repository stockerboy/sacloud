-- 서든어택 계정 **소유권 증명** — 게임 칭호로 한다
--   설계: docs/TITLE_VERIFICATION_SPEC.md 4장
--   정정: 2026-09-01 — 1회용 문구가 아니라 **고정 칭호 `[용병]`** 으로 바뀌었다 (사용자 결정)
--
-- ⚠ 이 파일은 **운영 DB 에 적용되지 않았다.** 적용은 사람이 한다.
-- 되돌리기는 맨 아래 주석 참조. 기존 데이터를 건드리지 않는 **순수 추가**다.

-- 1) 칭호 인증 도전
CREATE TABLE "TitleChallenge" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "ouid"          TEXT NOT NULL,
    -- 신청 당시 넣은 닉네임. 증거로만 남긴다 — 판정 기준은 ouid 다 (D-220)
    "nickname"      TEXT,
    "expectedTitle" TEXT NOT NULL,
    -- 1회용 방식에서 쓰던 칸. 고정 칭호 방식에서는 항상 NULL 이다.
    -- **지우지 않는다** — 1회용으로 되돌릴 때 그대로 쓴다 (CLAUDE.md 10-4)
    "baselineTitle" TEXT,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "issuedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"     TIMESTAMP(3) NOT NULL,
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSeenTitle" TEXT,
    "verifiedAt"    TIMESTAMP(3),
    CONSTRAINT "TitleChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TitleChallenge_status_expiresAt_idx" ON "TitleChallenge" ("status", "expiresAt");
CREATE INDEX "TitleChallenge_userId_idx"           ON "TitleChallenge" ("userId");
CREATE INDEX "TitleChallenge_ouid_idx"             ON "TitleChallenge" ("ouid");

ALTER TABLE "TitleChallenge"
  ADD CONSTRAINT "TitleChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ⚠ 부분 유니크 인덱스 두 개. **Prisma 스키마로는 표현할 수 없어 손으로 넣는다.**

-- ① ouid 당 열린 도전은 하나뿐 — 여러 사람이 같은 계정에 도전을 걸어 두고
--    하나가 우연히 맞기를 기다리는 것을 막는다. 애플리케이션 검사만으로는 동시 요청에서 샌다.
--    만료된 pending 줄은 애플리케이션이 읽을 때 'expired' 로 닫으므로 영구 선점은 없다.
CREATE UNIQUE INDEX "TitleChallenge_open_ouid_key"
  ON "TitleChallenge" ("ouid")
  WHERE "status" = 'pending';

-- ② ouid 당 인증된 도전도 하나뿐 — **먼저 인증한 사람이 임자**다.
--    고정 칭호 방식의 알려진 약점(어쩌다 `[용병]` 을 단 남의 닉을 가로채는 것)을
--    「이미 인증된 계정은 다른 회원이 못 가져간다」로 줄이는 마지막 방어선이다.
CREATE UNIQUE INDEX "TitleChallenge_verified_ouid_key"
  ON "TitleChallenge" ("ouid")
  WHERE "status" = 'verified';

-- 2) 칭호 관측 — 이미 받아 놓고 버리던 값을 남긴다 (넥슨 추가 호출 0건)
ALTER TABLE "NexonIdentityObservation" ADD COLUMN "titleName"     TEXT;
ALTER TABLE "NexonIdentityObservation" ADD COLUMN "prevTitleName" TEXT;

-- 되돌리기
--   DROP TABLE "TitleChallenge";
--   ALTER TABLE "NexonIdentityObservation"
--     DROP COLUMN "titleName", DROP COLUMN "prevTitleName";
