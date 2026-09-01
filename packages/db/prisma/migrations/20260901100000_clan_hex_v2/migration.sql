-- 클랜 육각형 **V2** 의 저장소 (D-217 사양 · D-235 결정).
--
-- ── 한 줄로 말하면
--    「경기 한 건 × 클랜 한 곳」 의 **분자/분모 원재료**를 담는다. 비율은 담지 않는다.
--
-- ── 왜 표를 하나만 만드나
--    사용자 원문이 둘을 함께 시켰다 — «매 판마다 경기상세에» 와 «전부 모아 평균 내 클랜페이지에».
--    경기 단위로 두면 **둘 다 여기서 나온다.** 클랜 값은 이 행들의 합이다.
--    클랜용 표를 따로 두면 둘이 어긋날 자리가 생긴다. 합은 언제나 맞다.
--
-- ── 왜 tally 가 JSONB 인가
--    축의 해석이 아직 흔들린다 (D-235 의 Q1·Q5·Q7·Q8 은 **우리가 정한 값**이지 사용자가
--    확인해 준 값이 아니다). 35칸으로 펴면 해석 하나 바뀔 때마다 마이그레이션이 따라온다.
--    행은 1만 개 남짓(배틀로그 있는 경기 5,026 × 양 팀)이라 합산은 JS 로 충분하다.
--
-- ── 옛 판을 건드리지 않는다
--    `ClanRoundProfile`(D-201)은 그대로 산다. **DROP 도 UPDATE 도 없다.** 추가만 한다.

CREATE TABLE IF NOT EXISTS "MatchClanHexV2" (
    "id"             TEXT NOT NULL,
    "matchId"        TEXT NOT NULL,
    "leagueClanId"   TEXT NOT NULL,
    "clanNo"         TEXT,
    "teamNo"         TEXT NOT NULL,
    "foeTeamNo"      TEXT,
    "rounds"         INTEGER NOT NULL DEFAULT 0,
    "sidedRounds"    INTEGER NOT NULL DEFAULT 0,
    "redRounds"      INTEGER NOT NULL DEFAULT 0,
    "foeSnipers"     INTEGER NOT NULL DEFAULT 0,
    "axesMeasured"   INTEGER NOT NULL DEFAULT 0,
    "tally"          JSONB NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "builtAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchClanHexV2_pkey" PRIMARY KEY ("id")
);

-- 한 경기에서 한 클랜은 한 행뿐이다. 다시 돌려도 덮어쓰기가 되게 하는 멱등의 근거다
CREATE UNIQUE INDEX IF NOT EXISTS "MatchClanHexV2_matchId_leagueClanId_key"
    ON "MatchClanHexV2" ("matchId", "leagueClanId");

-- 클랜 페이지: 그 클랜 행을 전부 긁어 합한다
CREATE INDEX IF NOT EXISTS "MatchClanHexV2_leagueClanId_formulaVersion_idx"
    ON "MatchClanHexV2" ("leagueClanId", "formulaVersion");

-- 재집계: 옛 판으로 만든 행만 골라 다시 만든다
CREATE INDEX IF NOT EXISTS "MatchClanHexV2_formulaVersion_builtAt_idx"
    ON "MatchClanHexV2" ("formulaVersion", "builtAt");

ALTER TABLE "MatchClanHexV2"
    ADD CONSTRAINT "MatchClanHexV2_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchClanHexV2"
    ADD CONSTRAINT "MatchClanHexV2_leagueClanId_fkey"
    FOREIGN KEY ("leagueClanId") REFERENCES "LeagueClan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
