-- 스나수의 두 축 재료 — 스나싸움 · 작업 성공률 (D-195).
--
-- **추가만 한다.** 기존 표·값은 건드리지 않는다.
-- 여러 번 돌려도 안전하도록 전부 IF NOT EXISTS 다 (forward-only).

ALTER TABLE "PlayerRoundProfile"
  ADD COLUMN IF NOT EXISTS "snipeDuels"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "snipeDuelWins"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "workKills"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "workRifleKills" INTEGER NOT NULL DEFAULT 0;
