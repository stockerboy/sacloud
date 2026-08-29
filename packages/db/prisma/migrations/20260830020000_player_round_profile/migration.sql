-- 선수의 라운드 복원 집계 (D-194).
--
-- 육각형 세 축(세이브 · 매치의 사나이 · 소수싸움)과 우리 MVP 가 이 값을 쓴다.
-- PlayerPositionProfile(D-174)과 같은 자리에 같은 방식으로 둔다.
--
-- **추가만 한다.** 기존 표·값은 건드리지 않는다.
-- 여러 번 돌려도 안전하도록 전부 IF NOT EXISTS 다 (forward-only).

CREATE TABLE IF NOT EXISTS "PlayerRoundProfile" (
  "id"             TEXT NOT NULL,
  "userNexonSn"    TEXT NOT NULL,
  "playerId"       TEXT,
  "matches"        INTEGER NOT NULL DEFAULT 0,
  "alone"          INTEGER NOT NULL DEFAULT 0,
  "aloneWon"       INTEGER NOT NULL DEFAULT 0,
  "outnumbered"    INTEGER NOT NULL DEFAULT 0,
  "outnumberedWon" INTEGER NOT NULL DEFAULT 0,
  "matchMan"       INTEGER NOT NULL DEFAULT 0,
  "longMatches"    INTEGER NOT NULL DEFAULT 0,
  "builderVersion" TEXT NOT NULL,
  "computedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlayerRoundProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerRoundProfile_userNexonSn_builderVersion_key"
  ON "PlayerRoundProfile" ("userNexonSn", "builderVersion");
CREATE INDEX IF NOT EXISTS "PlayerRoundProfile_playerId_idx"
  ON "PlayerRoundProfile" ("playerId");

-- 선수가 지워져도 집계는 남긴다 (SetNull). 원문을 버리지 않는다는 원칙과 같다
DO $$
BEGIN
  ALTER TABLE "PlayerRoundProfile"
    ADD CONSTRAINT "PlayerRoundProfile_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
