-- 병영수첩 클랜 번호 ↔ 우리 클랜 (D-200).
--
-- **추가만 한다.** 기존 표·값은 건드리지 않는다. 여러 번 돌려도 안전하다.

CREATE TABLE IF NOT EXISTS "BarracksClanNumber" (
  "clanNo"   TEXT NOT NULL,
  "clanId"   TEXT NOT NULL,
  "source"   TEXT NOT NULL DEFAULT 'roster',
  "votes"    INTEGER NOT NULL DEFAULT 1,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BarracksClanNumber_pkey" PRIMARY KEY ("clanNo")
);

CREATE INDEX IF NOT EXISTS "BarracksClanNumber_clanId_idx" ON "BarracksClanNumber" ("clanId");

DO $$
BEGIN
  ALTER TABLE "BarracksClanNumber"
    ADD CONSTRAINT "BarracksClanNumber_clanId_fkey"
    FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
