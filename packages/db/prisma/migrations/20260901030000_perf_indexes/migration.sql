-- 성능 인덱스 (D-227). **추가만 한다** — DROP 도 UPDATE 도 없다.
--
-- 근거는 로컬 실측이다 (`Match` 386,146행 / 295MB).
--
-- ① Match(startAt DESC)
--    관리자 경기 목록이 `ORDER BY startAt DESC LIMIT 50` 인데 `startAt` 단독 인덱스가
--    없어서 **전표 병렬 seq scan** 을 했다. `(leagueId, startAt)` 과
--    `(redLeagueClanId, startAt)` 은 있는데 선두 칼럼이 달라 못 쓴다.
--    실측 1,104 ms → 3 ms. 크기 약 8MB.
CREATE INDEX IF NOT EXISTS "Match_startAt_idx" ON "Match" ("startAt" DESC);

-- ② Match(origin)
--    `origin='nexon'` 은 386,146건 중 **136건**이라 선택도가 매우 좋다.
--    관리자 요약이 origin 으로 세는 질의를 여러 개 던진다.
--    실측 216~419 ms → 2~4 ms. 크기 약 8MB.
CREATE INDEX IF NOT EXISTS "Match_origin_idx" ON "Match" (origin);

-- ⚠ 여기 없는 것 — `MatchPlayerStat(playerId, matchId) INCLUDE (weapon)`
--    클랜 상세를 2,130 ms → 295 ms 로 만드는 **가장 큰 인덱스**지만 넣지 않았다.
--    228MB 짜리라 만드는 동안 디스크가 그만큼 더 필요한데, **운영 디스크 여유를
--    확인하지 않았다.** 기존 인덱스(298MB)를 지우면 순감이지만, 만들고 지우는
--    사이에 순간 피크가 온다.
--    운영 여유를 확인한 뒤 `CREATE INDEX CONCURRENTLY` 로 따로 만든다 —
--    마이그레이션은 트랜잭션 안에서 돌아 `CONCURRENTLY` 를 쓸 수 없다.
