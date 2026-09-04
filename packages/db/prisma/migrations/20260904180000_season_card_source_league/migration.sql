-- ★지난시즌 카드가 어느 리그에서 왔는지 한 칸으로 남긴다★ (2026-09-04 · Part 1)
--
-- 추가만 한다. DROP 도 UPDATE 도 없다. 이미 있으면 건너뛴다.
-- 기존 행은 NULL 이 된다 — 지금 이 표는 0행이라 채울 것이 없다 (실측 2026-09-04).
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "sourceLeagueSlug" TEXT;
ALTER TABLE "LeaguePlayerSeason" ADD COLUMN IF NOT EXISTS "sourceFetchedAt" TIMESTAMPTZ(3);
