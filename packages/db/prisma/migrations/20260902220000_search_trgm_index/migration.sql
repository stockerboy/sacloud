-- 검색 인덱스 (O-009 · 2026-09-02). **추가만 한다** — DROP 도 UPDATE 도 없다.
--
-- ── 무엇이 문제였나 (로컬 실측 · 선수 23,562명 · Match 386,146행 DB)
--   자동완성이 `name ILIKE '%q%'` 라 **전표 순차 스캔**이었다. 5회 중앙값:
--     ts 6.1ms · xe 6.2ms · Jaehyun 6.6ms · (없는 말) 6.2ms   ← 전부 Seq Scan
--   `Player_name_idx` 는 이미 있었지만 B-tree 라 `%q%` 에는 못 쓴다.
--   홈이 검색창이 되면서(O-001) 이게 **모든 방문자의 첫 동작**이 됐고,
--   DB 자리는 5개뿐이다.
--
-- ── 고친 뒤 (같은 DB · 같은 질의)
--     Jaehyun 6.6ms → 0.06ms   ·   (없는 말) 6.2ms → 0.03ms   ← Bitmap Index Scan
--     3글자 tsA 0.41ms · 4글자 tsAr 0.05ms
--   ⚠ **2글자는 그대로 6.7ms 다.** pg_trgm 은 세 글자로 조각을 만들어서 두 글자
--     `%ts%` 로는 조각이 안 나온다. 그래서 코드가 **접두어(`ts%`)를 함께 던진다** —
--     접두어는 앞을 공백으로 메워 조각이 생기므로 두 글자에도 인덱스를 탄다(0.07ms).
--     `apps/web/lib/server/queries/search.ts` 의 `searchPlayers` 주석 참조.
--
-- ── 인덱스를 `lower(name)` 에 걸면 안 된다
--   처음에 `gin (lower(name) gin_trgm_ops)` 로 만들었더니 계획이 안 바뀌었다.
--   질의가 `name ILIKE ...` 라 식이 안 맞는다. **컬럼에 직접** 건다.
--
-- ── ★운영에서는 이 파일보다 먼저 CONCURRENTLY 로 만든다★
--   마이그레이션은 트랜잭션 안에서 돌아 `CREATE INDEX CONCURRENTLY` 를 쓸 수 없다
--   (`20260901030000_perf_indexes` 가 같은 이유로 큰 인덱스를 밖으로 뺐다).
--   운영 순서:
--     1) node scripts/search-index.mjs --confirm     ← CONCURRENTLY 로 만든다. 잠그지 않는다
--     2) node scripts/prod-migrate.mjs --confirm     ← 이 파일은 IF NOT EXISTS 라 건너뛴다
--   이 파일은 **새로 만드는 DB(로컬·CI)** 를 위한 것이다. 그때는 행이 없어 잠겨도 무해하다.
--
-- ── 되돌리기
--   DROP INDEX CONCURRENTLY IF EXISTS "Player_name_trgm_idx";
--   DROP INDEX CONCURRENTLY IF EXISTS "Clan_name_trgm_idx";
--   -- pg_trgm 은 두어도 된다. 지우려면 다른 게 안 쓰는지 먼저 본다:
--   -- DROP EXTENSION IF EXISTS pg_trgm;
--   인덱스를 지워도 검색은 그대로 돈다. 느려질 뿐이다.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 선수 이름 부분일치 (자동완성의 주 경로)
CREATE INDEX IF NOT EXISTS "Player_name_trgm_idx" ON "Player" USING gin (name gin_trgm_ops);

-- 클랜 이름 부분일치.
--   ⚠ 클랜은 903행뿐이라 **지금은 급하지 않다** (같은 질의 0.3ms · Seq Scan 이어도 싸다).
--   그래도 함께 만드는 이유는 클랜이 늘면 같은 문제가 오고, 903행짜리 인덱스는
--   만드는 값이 거의 없기 때문이다. 선수(23,562행)와 달리 **효과를 실측하지 않았다.**
CREATE INDEX IF NOT EXISTS "Clan_name_trgm_idx" ON "Clan" USING gin (name gin_trgm_ops);
