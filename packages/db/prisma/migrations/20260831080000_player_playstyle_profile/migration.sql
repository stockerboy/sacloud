-- 선수의 **플레이스타일 바** 재료 — 진영별 집계 (사양 8절 · D-211).
--
--     블루 = 수비   안전함   ↔  변칙적
--     레드 = 공격   느린전개 ↔  빠른전개
--
-- 원본(3rd.supply)에 없는 값이다. 사용자 지시로 만든 신규 지표이고
-- `CLAUDE.md` 3장 3번(임의 기능 추가 금지)의 명시적 예외다 — 육각형과 같은 취급이다.
--
-- ── 왜 `PlayerRoundProfile` 에 칸을 더하지 않았나
--   저 표는 육각형(세이브·소수싸움·매치의 사나이)의 그릇이고 **진영을 보지 않는다.**
--   여기 값들은 전부 진영으로 갈라 센 것이라 최소 표본도 판정 시점도 다르다.
--   한 표에 섞으면 `builderVersion` 하나가 성격이 다른 두 집계를 함께 묶게 된다.
--
-- ── 분자와 분모를 따로 담는다 (D-106)
--   비율을 미리 계산해 넣지 않는다. 진영을 모르는 라운드는 분모에서도 빠지므로,
--   표본이 얼마인지를 함께 봐야 값의 무게를 안다. 최소치에 못 미치면 화면은
--   `측정중` 이고 **가운데(`정석`)로 채우지 않는다.**
--
-- ── 좌표는 합·제곱합으로만 남긴다
--   분산이 `E[x²] − E[x]²` 로 나오므로 네 값이면 충분하고, 경기를 이어 붙일 때
--   그냥 더하면 된다. 좌표를 통째로 들고 있을 이유가 없다.

CREATE TABLE "PlayerPlaystyleProfile" (
    "id" TEXT NOT NULL,
    "userNexonSn" TEXT NOT NULL,
    "playerId" TEXT,
    "matches" INTEGER NOT NULL DEFAULT 0,

    "defenseRounds" INTEGER NOT NULL DEFAULT 0,
    "defenseOpening" INTEGER NOT NULL DEFAULT 0,
    "defenseDelaySum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defenseDelayN" INTEGER NOT NULL DEFAULT 0,
    "defensePosX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defensePosY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defensePosX2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defensePosY2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defensePosN" INTEGER NOT NULL DEFAULT 0,

    "attackRounds" INTEGER NOT NULL DEFAULT 0,
    "attackOpening" INTEGER NOT NULL DEFAULT 0,
    "attackDelaySum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attackDelayN" INTEGER NOT NULL DEFAULT 0,
    "attackPosX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attackPosY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attackPosX2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attackPosY2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attackPosN" INTEGER NOT NULL DEFAULT 0,

    "builderVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPlaystyleProfile_pkey" PRIMARY KEY ("id")
);

-- 규칙이 바뀌면 새 줄이 생기고 옛 줄은 남는다 — 그래서 키에 `builderVersion` 이 들어간다
CREATE UNIQUE INDEX "PlayerPlaystyleProfile_userNexonSn_builderVersion_key"
    ON "PlayerPlaystyleProfile"("userNexonSn", "builderVersion");

CREATE INDEX "PlayerPlaystyleProfile_playerId_idx"
    ON "PlayerPlaystyleProfile"("playerId");

-- 선수가 지워져도 집계는 남긴다 (`SET NULL`) — 원문에서 다시 만들 수 있어야 한다
ALTER TABLE "PlayerPlaystyleProfile"
    ADD CONSTRAINT "PlayerPlaystyleProfile_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
