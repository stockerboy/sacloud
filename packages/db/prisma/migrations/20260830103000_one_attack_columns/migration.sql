-- 라플수의 원어택 성공률 재료 (D-196).
--
-- **추가만 한다.** 기존 표·값은 건드리지 않는다. 여러 번 돌려도 안전하다.

ALTER TABLE "PlayerRoundProfile"
  ADD COLUMN IF NOT EXISTS "oneAttackKills"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "oneAttackSameKills" INTEGER NOT NULL DEFAULT 0;
