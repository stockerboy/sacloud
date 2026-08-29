-- 병영수첩 BattleLog 원문(좌표 포함) + 포지션 판정 저장 (D-174).
--
-- **추가만 한다.** 기존 표·값은 건드리지 않는다.
-- 여러 번 돌려도 안전하도록 전부 IF NOT EXISTS 다 (forward-only).

CREATE TABLE IF NOT EXISTS "BarracksBattleLogRaw" (
  "id"          TEXT NOT NULL,
  "source"      TEXT NOT NULL DEFAULT 'nexon_barracks',
  "endpoint"    TEXT NOT NULL,
  "matchKey"    TEXT NOT NULL,
  "subject"     TEXT NOT NULL,
  "subjectKind" TEXT NOT NULL DEFAULT 'user',
  "payload"     JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'ok',
  "errorCode"   TEXT,
  "fetchedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fetchCount"  INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "BarracksBattleLogRaw_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BarracksBattleLogRaw_matchKey_subject_payloadHash_key"
  ON "BarracksBattleLogRaw" ("matchKey", "subject", "payloadHash");
CREATE INDEX IF NOT EXISTS "BarracksBattleLogRaw_matchKey_idx"
  ON "BarracksBattleLogRaw" ("matchKey");
CREATE INDEX IF NOT EXISTS "BarracksBattleLogRaw_subject_idx"
  ON "BarracksBattleLogRaw" ("subject");
CREATE INDEX IF NOT EXISTS "BarracksBattleLogRaw_fetchedAt_idx"
  ON "BarracksBattleLogRaw" ("fetchedAt");

CREATE TABLE IF NOT EXISTS "PlayerPositionProfile" (
  "id"                  TEXT NOT NULL,
  "userNexonSn"         TEXT NOT NULL,
  "playerId"            TEXT,
  "position"            TEXT,
  "score"               DOUBLE PRECISION NOT NULL DEFAULT 0,
  "margin"              DOUBLE PRECISION NOT NULL DEFAULT 0,
  "games"               INTEGER NOT NULL DEFAULT 0,
  "sniperGamesExcluded" INTEGER NOT NULL DEFAULT 0,
  "points"              INTEGER NOT NULL DEFAULT 0,
  "histogram"           JSONB NOT NULL,
  "classifierVersion"   TEXT NOT NULL,
  "computedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlayerPositionProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerPositionProfile_userNexonSn_classifierVersion_key"
  ON "PlayerPositionProfile" ("userNexonSn", "classifierVersion");
CREATE INDEX IF NOT EXISTS "PlayerPositionProfile_playerId_idx"
  ON "PlayerPositionProfile" ("playerId");
CREATE INDEX IF NOT EXISTS "PlayerPositionProfile_position_idx"
  ON "PlayerPositionProfile" ("position");

-- 선수가 지워지면 판정만 끊는다. 분포는 남긴다 (사람의 키는 userNexonSn 이다)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PlayerPositionProfile_playerId_fkey'
  ) THEN
    ALTER TABLE "PlayerPositionProfile"
      ADD CONSTRAINT "PlayerPositionProfile_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
