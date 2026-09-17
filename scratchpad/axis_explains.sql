-- ★여섯 축이 승패를 설명하는가★ (2026-09-17 사장님:
--   「소수싸움 세이브를 다이겼는데 겜을 왜진건지 납득이 안감」)
--
-- 경기마다 두 팀의 여섯 축을 견줘 ★이긴 팀이 몇 축을 이겼는지★ 세고,
-- 축을 n개 이긴 팀의 승률을 낸다. 지어내지 않고 실제 판으로만 센다.
--
-- ⚠ 「유리한 기회」는 경기 육각에만 있고 저장된 tally 에는 `blockChance` 재료로 들어 있다.
--   여기서는 저장된 여섯(클랜 육각)을 그대로 쓴다 — 기회차단이 넷째 자리다.
--   사장님이 보신 화면(경기 육각)과 넷째 축만 다르다. 그 차이는 결과에 같이 적는다.

WITH pair AS (
  SELECT
    m."id"                AS match_id,
    CASE WHEN m."winnerSide" = 'red' THEN m."redLeagueClanId" ELSE m."blueLeagueClanId" END AS winner,
    h."leagueClanId"       AS clan,
    h."tally"              AS tally
  FROM "Match" m
  JOIN "MatchClanHexV2" h ON h."matchId" = m."id"
  WHERE m."supersededAt" IS NULL
    AND m."startAt" >= TIMESTAMP '2026-07-01 00:00:00'
    AND m."winnerSide" IN ('red','blue')
),
-- 축마다 「우리 몫」을 뽑는다. 분모가 0이면 NULL — 0으로 찍지 않는다
val AS (
  SELECT
    match_id, winner, clan,
    CASE WHEN COALESCE((tally->'sniperDuel'->>'rounds')::float, 0) > 0
         THEN (tally->'sniperDuel'->>'won')::float / (tally->'sniperDuel'->>'rounds')::float END AS duel,
    CASE WHEN COALESCE((tally->'outnumbered'->>'rounds')::float, 0) > 0
         THEN (tally->'outnumbered'->>'won')::float / (tally->'outnumbered'->>'rounds')::float END AS few,
    CASE WHEN COALESCE((tally->'save'->>'chances')::float, 0) > 0
         THEN (tally->'save'->>'saved')::float / (tally->'save'->>'chances')::float END AS save,
    CASE WHEN COALESCE((tally->'blockChance'->>'foeOpenRounds')::float, 0) > 0
         THEN (tally->'blockChance'->>'cutRounds')::float / (tally->'blockChance'->>'foeOpenRounds')::float END AS block,
    CASE WHEN COALESCE(((tally->'gapScore'->>'ourSniper')::float + (tally->'gapScore'->>'foeSniper')::float), 0) > 0
         THEN (tally->'gapScore'->>'ourSniper')::float
              / ((tally->'gapScore'->>'ourSniper')::float + (tally->'gapScore'->>'foeSniper')::float) END AS snip,
    CASE WHEN COALESCE(((tally->'gapScore'->>'ourRifle')::float + (tally->'gapScore'->>'foeRifle')::float), 0) > 0
         THEN (tally->'gapScore'->>'ourRifle')::float
              / ((tally->'gapScore'->>'ourRifle')::float + (tally->'gapScore'->>'foeRifle')::float) END AS rifl
  FROM pair
),
-- 한 경기에 두 줄(양 팀)이 있어야 견줄 수 있다
two AS (
  SELECT a.match_id, a.winner, a.clan AS me, b.clan AS foe,
         a.duel  AS a_duel,  b.duel  AS b_duel,
         a.few   AS a_few,   b.few   AS b_few,
         a.save  AS a_save,  b.save  AS b_save,
         a.block AS a_block, b.block AS b_block,
         a.snip  AS a_snip,  b.snip  AS b_snip,
         a.rifl  AS a_rifl,  b.rifl  AS b_rifl
  FROM val a
  JOIN val b ON b.match_id = a.match_id AND b.clan <> a.clan
  WHERE a.clan = a.winner          -- 이긴 팀 기준 한 줄만
),
scored AS (
  SELECT
    match_id,
    (CASE WHEN a_duel  IS NOT NULL AND b_duel  IS NOT NULL AND a_duel  > b_duel  THEN 1 ELSE 0 END
   + CASE WHEN a_few   IS NOT NULL AND b_few   IS NOT NULL AND a_few   > b_few   THEN 1 ELSE 0 END
   + CASE WHEN a_save  IS NOT NULL AND b_save  IS NOT NULL AND a_save  > b_save  THEN 1 ELSE 0 END
   + CASE WHEN a_block IS NOT NULL AND b_block IS NOT NULL AND a_block > b_block THEN 1 ELSE 0 END
   + CASE WHEN a_snip  IS NOT NULL AND b_snip  IS NOT NULL AND a_snip  > b_snip  THEN 1 ELSE 0 END
   + CASE WHEN a_rifl  IS NOT NULL AND b_rifl  IS NOT NULL AND a_rifl  > b_rifl  THEN 1 ELSE 0 END) AS won_axes,
    (CASE WHEN a_duel  IS NOT NULL AND b_duel  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN a_few   IS NOT NULL AND b_few   IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN a_save  IS NOT NULL AND b_save  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN a_block IS NOT NULL AND b_block IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN a_snip  IS NOT NULL AND b_snip  IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN a_rifl  IS NOT NULL AND b_rifl  IS NOT NULL THEN 1 ELSE 0 END) AS cmp_axes
  FROM two
)
SELECT
  won_axes                                  AS "이긴팀이_이긴축수",
  COUNT(*)                                  AS "경기수",
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS "비율%"
FROM scored
WHERE cmp_axes = 6                           -- 여섯 축을 다 견줄 수 있는 판만
GROUP BY won_axes
ORDER BY won_axes;
