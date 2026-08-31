-- 기회창출 (육각형 4번 축 · D-214)
--   openingKills  라운드의 첫 킬을 낸 라운드 수
--   openingRounds 첫 킬을 가릴 수 있었던 라운드 수 (분모)
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "openingKills" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "openingRounds" INTEGER NOT NULL DEFAULT 0;
