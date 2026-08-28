-- D-155 — 같은 경기를 **여러 리그에 기록**할 수 있게 한다.
--
-- 왜 바꾸는가
--   클랜은 리그를 겸한다. e2stro- 와 The|vub 가 둘 다 공식리그·열산리그 소속이면
--   그 경기는 양쪽 리그에 다 찍혀야 한다. 그런데 `unique(origin, sourceMatchId)` 이
--   한 경기를 한 리그에만 묶어서, 먼저 들어간 리그에만 남고 나머지는 버려졌다.
--   실측 — 공식리그 1,828건 · 열산리그 28건이 `exists_in_other_league` 로 스킵됐다.
--
--   리그마다 값이 다르다. 부리그·클랜 래더·증감은 리그별이라 한 행을 공유할 수 없다.
--   그래서 리그마다 행을 둔다. `id` 는 리그별로 다르게 만들고(`<matchId>@<leagueSlug>`),
--   실제 경기 번호는 `sourceMatchId` 에 그대로 남는다 — 원본 대조 키를 잃지 않는다.
--
-- 안전성
--   기존 행은 **하나도 바뀌지 않는다.** 제약을 좁히는 것이 아니라 **넓히는** 것이라
--   지금 들어 있는 데이터는 새 제약도 그대로 만족한다.
--   되돌리려면 인덱스만 되돌리면 된다. 데이터 손실이 없다.

DROP INDEX IF EXISTS "Match_origin_sourceMatchId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Match_leagueId_origin_sourceMatchId_key"
  ON "Match" ("leagueId", "origin", "sourceMatchId");

-- 원본 경기 번호로 "이 경기가 어느 리그들에 있나" 를 찾는 일이 잦아진다.
-- 리그 간 대조와 중복 판정에 쓴다.
CREATE INDEX IF NOT EXISTS "Match_sourceMatchId_idx" ON "Match" ("sourceMatchId");
