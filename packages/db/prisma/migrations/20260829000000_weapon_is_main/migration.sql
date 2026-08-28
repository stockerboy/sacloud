-- 무기 랭킹 모집단을 **주무기**로 좁힌다 (D-173).
--
-- 이게 없으면 라플수가 어쩌다 든 스나 몇 판으로 스나 랭킹에 들어온다.
-- 기록 자체(판수·킬데스·증감)는 주무기가 아니어도 그대로 남긴다.
--
-- 추가만 한다. 기존 값은 건드리지 않는다 (기본값 false).
ALTER TABLE "LeaguePlayerWeaponStat"
  ADD COLUMN IF NOT EXISTS "isMain" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "LeaguePlayerWeaponStat_weapon_isMain_ratingDelta_idx"
  ON "LeaguePlayerWeaponStat" ("weapon", "isMain", "ratingDelta" DESC);
