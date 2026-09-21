-- ★★파생 리그(C1)는 「같은 경기 하나만」 인덱스에서 뺀다★★ (2026-09-21)
--
-- ── 왜
--   `Match_new_sourceMatchId_key` 는 ★중복 투영을 막는 장치★ 다 —
--   같은 실제 경기가 두 번 담기지 않게 `sourceMatchId` 를 전체에서 유일하게 만든다.
--
--   그런데 C1 은 ★IPL 경기를 일부러 베껴 담는 리그★ 다. 중복이 아니라 파생이다.
--   그 인덱스에 걸려서 `sourceMatchId` 에 `c1-` 접두를 붙였고,
--   ★그 값이 그대로 화면으로 나가 계약(18자리 숫자)을 깨뜨렸다★ —
--   경기 목록이 통째로 «불러오지 못했습니다» 가 됐다 (2026-09-21 사장님이 보심).
--
-- ── 무엇을 바꾸나
--   조건에 `origin <> 'sacloud'` 를 더한다. 우리가 직접 만든(파생) 경기만 빠진다.
--   ★넥슨·미러에서 들어오는 경기의 중복 방지는 한 글자도 안 바뀐다.★
--
--   그러면 C1 도 기존 규칙을 그대로 쓸 수 있다 —
--     id            2609...@c1          (리그마다 다른 행 · 내부용)
--     sourceMatchId 2609...             (원본 경기 번호 · 밖으로 나가는 값)
--   이것이 미러가 2026-06 부터 쓰던 방식이다 (`supplyMatchRowId`).

DROP INDEX IF EXISTS "Match_new_sourceMatchId_key";

CREATE UNIQUE INDEX "Match_new_sourceMatchId_key"
    ON "Match" ("sourceMatchId")
 WHERE "startAt" >= '2026-09-02 22:00:00'::timestamp
   AND "sourceMatchId" IS NOT NULL
   AND "supersededAt" IS NULL
   AND "origin" <> 'sacloud';
