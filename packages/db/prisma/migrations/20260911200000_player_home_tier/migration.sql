-- ★내 구간★ — 그 선수가 가장 많이 뛴 티어 (2026-09-11 · 사장님)
--
-- 사장님: «클랜 소속에 따라 티어 점수를 받는 게 아니라 자기가 가장 많이 플레이한 구간에 따라
--          티어가중치를 받는 거야 (…) 개인랭킹 전체/astra/challenger1/challenger2 이렇게 선택해서
--          볼 수 있게끔 해. 전체는 모든 리거들 순위, 아스트라는 아스트라 선수들만»
--
-- `tier1Games/tier2Games/tier3Games` 로도 알 수 있지만, 목록 질의가 ★칸끼리 비교★ 를 해야 해서
-- Prisma where 로는 못 거른다. 30분 집계가 미리 접어 이 칸에 넣는다.
--
-- ★추가만 한다. DROP 도 UPDATE 도 없다.★ 비어 있으면(null) 옛 줄이고, 잡이 한 번 돌면 채워진다.

ALTER TABLE "LeaguePlayerHex" ADD COLUMN IF NOT EXISTS "homeTier" INTEGER;

-- 구간별 목록을 점수 순으로 훑는다
CREATE INDEX IF NOT EXISTS "LeaguePlayerHex_homeTier_score_idx"
  ON "LeaguePlayerHex" ("homeTier", "score" DESC);
