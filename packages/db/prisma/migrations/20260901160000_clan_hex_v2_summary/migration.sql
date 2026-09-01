-- 클랜 육각형 **V2 의 접어 둔 사본** — 클랜 하나에 한 행 (D-238 후속).
--
-- ── 왜 만드나. **운영을 500 으로 만든 것이 이 자리다**
--    클랜 페이지의 육각형은 「같은 리그 안에서 몇 등인가」(백분위 · D-235 Q8)를 그린다.
--    그 등수를 매기려면 **같은 리그의 모든 클랜 값**이 필요한데, 지금까지는 그걸
--    `MatchClanHexV2` 를 리그 통째로 읽어서 그 자리에서 접어 만들었다.
--
--    ```
--    열산 6,230행 · DPL 3,062행 · tally 가 행마다 약 1.1KB
--      → 한 요청이 7MB 짜리 JSON 을 풀러 너머로 끌어온다
--      → /api/leagues/supply/clans/lpcrew/show 가 10.6초 → 500 (2026-09-01 실측)
--    ```
--
--    이 표는 그 접기를 **미리 해 둔 것**이다. 읽는 양이 「리그의 경기 행 수」에서
--    「리그의 클랜 수」로 바뀐다 — 6,230행이 103행이 된다.
--
-- ── ⚠ **D-235 는 «표를 둘로 나누지 않는다» 고 정했다. 이건 그 결정의 예외다**
--    뒤집는 것이 아니라 **예외를 두는 것**이므로, 왜 예외인지와 어긋났을 때 어떻게
--    아는지를 여기 적어 둔다.
--
--    왜 예외인가 — D-235 가 걱정한 것은 «둘이 어긋날 자리» 다. 그 걱정은 옳다.
--    그런데 그 원칙을 지킨 결과가 **화면이 아예 안 뜨는 것**이었다 (D-238). 값이 맞아도
--    안 보이면 없는 것과 같다. 그래서 원재료는 그대로 두고 **사본**을 하나 더 둔다.
--
--    ⛔ **`MatchClanHexV2` 가 진실의 출처다. 이 표는 사본이다.**
--       원재료를 지우거나 바꾸지 않는다. 이 표가 통째로 사라져도 잡을 한 번 돌리면
--       똑같이 복원된다. 반대는 성립하지 않는다.
--
--    어긋나면 어떻게 아나 — 두 가지 장치가 있다.
--      ① `formulaVersion` — 계약(`CLAN_HEX_V2_CONFIG.formulaVersion`)과 다른 행은
--         화면이 **아예 안 읽는다.** 해석이 바뀌면 옛 요약은 자동으로 «없는 것» 이 되고
--         화면은 `측정중` 으로 떨어진다. 틀린 값을 그리는 것보다 낫다
--      ② **재생성으로 대조한다** — `nexon clan-hex-v2-summary --rebuild` 는 원재료에서
--         다시 접는다. 결과가 다르면 어긋난 것이고, 언제나 원재료 쪽이 옳다
--
-- ── 왜 `tally` 를 통째로 두고 여섯 숫자를 두지 않나
--    비율을 저장하면 5라운드 경기가 18라운드 경기와 같은 무게를 갖는다 (D-235 Q8).
--    그리고 **세는 규칙은 계약 한 곳에만 있어야 한다** — 여기 여섯 칸을 만들면 나누는
--    규칙이 SQL 로 새어 나간다. 그래서 접힌 것도 **분자/분모**(`ClanHexTally`)다.
--    화면은 이 tally 를 `buildClanHexV2Raw` 에 그대로 넣는다. 지금 질의가 리그 전체를
--    접어서 만들던 것과 **같은 값**이 나온다 (합산은 결합법칙이 성립한다).
--
-- ── 옛 판도 원재료도 건드리지 않는다
--    `MatchClanHexV2`(D-235) · `ClanRoundProfile`(D-201) 둘 다 그대로 산다.
--    **DROP 도 UPDATE 도 없다. 추가만 한다.**

CREATE TABLE IF NOT EXISTS "ClanHexV2Summary" (
    "id"             TEXT NOT NULL,
    -- 클랜 하나에 한 행이다. 판(formulaVersion)이 바뀌면 이 행을 **덮는다** —
    -- 판마다 행을 쌓지 않는다. 옛 판의 원재료는 `MatchClanHexV2` 에 그대로 남아 있다
    "leagueClanId"   TEXT NOT NULL,
    -- 리그 백분위의 모집단을 고르는 키. `leagueClan` 을 조인하지 않고 바로 거른다
    "leagueId"       TEXT NOT NULL,
    -- 이 값으로 접었다는 표시. 계약과 다르면 화면이 안 읽는다 (위 ①)
    "formulaVersion" TEXT NOT NULL,
    -- `sumClanHexTallies` 의 결과 통째. **비율이 아니라 분자/분모다**
    "tally"          JSONB NOT NULL,
    -- 접는 데 쓴 경기 행 수. `buildClanHexV2Raw` 의 `matches` 로 그대로 들어간다
    "matches"        INTEGER NOT NULL DEFAULT 0,
    -- 접힌 tally 기준으로 `null` 이 아닌 축 수 (0~6). 대조용이다
    "axesMeasured"   INTEGER NOT NULL DEFAULT 0,
    "builtAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClanHexV2Summary_pkey" PRIMARY KEY ("id")
);

-- 클랜 하나에 한 행. 다시 돌려도 덮어쓰기가 되게 하는 멱등의 근거다
CREATE UNIQUE INDEX IF NOT EXISTS "ClanHexV2Summary_leagueClanId_key"
    ON "ClanHexV2Summary" ("leagueClanId");

-- 화면이 읽는 유일한 경로: 「이 리그 · 이 판」 의 요약 전부
CREATE INDEX IF NOT EXISTS "ClanHexV2Summary_leagueId_formulaVersion_idx"
    ON "ClanHexV2Summary" ("leagueId", "formulaVersion");

-- 재생성: 옛 판으로 접힌 행만 골라 다시 만든다
CREATE INDEX IF NOT EXISTS "ClanHexV2Summary_formulaVersion_builtAt_idx"
    ON "ClanHexV2Summary" ("formulaVersion", "builtAt");

-- 외래키는 `IF NOT EXISTS` 가 없다. 다시 돌려도 안 죽게 존재를 직접 본다
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ClanHexV2Summary_leagueClanId_fkey'
    ) THEN
        ALTER TABLE "ClanHexV2Summary"
            ADD CONSTRAINT "ClanHexV2Summary_leagueClanId_fkey"
            FOREIGN KEY ("leagueClanId") REFERENCES "LeagueClan"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ClanHexV2Summary_leagueId_fkey'
    ) THEN
        ALTER TABLE "ClanHexV2Summary"
            ADD CONSTRAINT "ClanHexV2Summary_leagueId_fkey"
            FOREIGN KEY ("leagueId") REFERENCES "League"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
