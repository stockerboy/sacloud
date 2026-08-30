-- 클랜의 라운드 복원 집계 (SITE_SPEC_V2 5-5절).
--
-- 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포 · 클린시트(반코트)가 이 값을 쓴다.
-- PlayerRoundProfile(D-194)과 같은 자리에 같은 방식으로 둔다 — 다만 사람이 아니라
-- **LeagueClan** 이 키다. 같은 클랜이 리그를 겸하면 모집단이 리그마다 다르기 때문이다.
--
-- **추가만 한다.** 기존 표·값은 건드리지 않는다.
-- 여러 번 돌려도 안전하도록 전부 IF NOT EXISTS 다 (forward-only).

CREATE TABLE IF NOT EXISTS "ClanRoundProfile" (
  "id"                TEXT NOT NULL,
  "leagueClanId"      TEXT NOT NULL,
  "clanNo"            TEXT,

  "matches"           INTEGER NOT NULL DEFAULT 0,
  "sidedMatches"      INTEGER NOT NULL DEFAULT 0,

  "roundsTotal"       INTEGER NOT NULL DEFAULT 0,
  "roundsKnown"       INTEGER NOT NULL DEFAULT 0,

  "defenseRounds"     INTEGER NOT NULL DEFAULT 0,
  "defenseConceded"   INTEGER NOT NULL DEFAULT 0,

  "attackRounds"      INTEGER NOT NULL DEFAULT 0,
  "attackWon"         INTEGER NOT NULL DEFAULT 0,
  "attackSideRounds"  INTEGER NOT NULL DEFAULT 0,
  "plantRounds"       INTEGER NOT NULL DEFAULT 0,

  "organizedRounds"   INTEGER NOT NULL DEFAULT 0,
  "organizedHeld"     INTEGER NOT NULL DEFAULT 0,

  "burstRounds"       INTEGER NOT NULL DEFAULT 0,
  "bursts"            INTEGER NOT NULL DEFAULT 0,

  -- 중앙값은 **모르면 NULL 이다.** 0 초로 채우면 "가장 빠른 클랜" 이 된다 (D-106)
  "tempoSpanRounds"   INTEGER NOT NULL DEFAULT 0,
  "tempoSpanMedian"   DOUBLE PRECISION,
  "tempoGapRounds"    INTEGER NOT NULL DEFAULT 0,
  "tempoGapMedian"    DOUBLE PRECISION,

  "cleanSheetMatches" INTEGER NOT NULL DEFAULT 0,
  "cleanSheets"       INTEGER NOT NULL DEFAULT 0,

  "builderVersion"    TEXT NOT NULL,
  "computedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClanRoundProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClanRoundProfile_leagueClanId_builderVersion_key"
  ON "ClanRoundProfile" ("leagueClanId", "builderVersion");
CREATE INDEX IF NOT EXISTS "ClanRoundProfile_leagueClanId_idx"
  ON "ClanRoundProfile" ("leagueClanId");

-- 리그 참가가 사라지면 그 리그의 집계도 뜻을 잃는다 (Cascade).
-- 원문(BarracksBattleLogRaw)은 그대로 남아 있어 언제든 다시 만들 수 있다
DO $$
BEGIN
  ALTER TABLE "ClanRoundProfile"
    ADD CONSTRAINT "ClanRoundProfile_leagueClanId_fkey"
    FOREIGN KEY ("leagueClanId") REFERENCES "LeagueClan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
