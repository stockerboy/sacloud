-- ★육각 3번·5번 축의 새 재료★ (2026-09-15 사장님)
--
--   evenKills    «우위를 만든 킬» — 딴 그 순간 우리가 상대보다 많지 않았던 킬
--                  → 3번 축 «게임영향력». 사장님: «킬을 가장 많이했다고 무조건
--                    걔가 잘한것처럼 되는 그 구조가 싫은거야»
--   tradeKills   동료가 죽고 5초 안에 그 킬러를 되잡은 횟수  ┐
--   mateDeaths   그 라운드에 죽은 내 동료 수                 ┘ → 5번 축 «교환율»
--
-- 옛 줄은 0 이고, `player-hex-v1.5` 로 다시 세면 채워진다.
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "evenKills" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "tradeKills" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "mateDeaths" INTEGER NOT NULL DEFAULT 0;
