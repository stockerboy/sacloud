-- ★육각 3번·5번 축의 새 재료★ (2026-09-15 사장님)
--
--   evenKills    «우위를 만든 킬» — 딴 그 순간 우리가 상대보다 많지 않았던 킬
--                  → 3번 축 «게임영향력». 사장님: «킬을 가장 많이했다고 무조건
--                    걔가 잘한것처럼 되는 그 구조가 싫은거야»
--   firstDeaths  그 라운드의 첫 죽음을 당한 횟수
--                  → 5번 축 «안 짤림» (연속킬이 내려간 자리). 선짤과 짝이다
--
-- 옛 줄은 0 이고, `player-hex-v1.5` 로 다시 세면 채워진다.
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "evenKills" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "firstDeaths" INTEGER NOT NULL DEFAULT 0;
