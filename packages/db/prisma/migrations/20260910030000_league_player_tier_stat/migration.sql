-- ★티어별 성적★ — 선수가 그 티어를 상대했을 때의 기록 (2026-09-10)
--
-- 사장님: «티어별 승률과 킬뎃을 따로 기록해서 ui에 나타낼거니까 미리준비해두면 좋다»
-- 순위 계산에는 안 쓴다. 보여 주기 전용이고, 매번 통째로 다시 쓴다.
--
-- ★추가만 한다. DROP 도 UPDATE 도 없다.★
CREATE TABLE IF NOT EXISTS "LeaguePlayerTierStat" (
  "leaguePlayerId" TEXT NOT NULL,
  "tier" INTEGER NOT NULL,
  "games" INTEGER NOT NULL DEFAULT 0,
  "win" INTEGER NOT NULL DEFAULT 0,
  "lose" INTEGER NOT NULL DEFAULT 0,
  "knownGames" INTEGER NOT NULL DEFAULT 0,
  "kill" INTEGER NOT NULL DEFAULT 0,
  "death" INTEGER NOT NULL DEFAULT 0,
  "rifleGames" INTEGER NOT NULL DEFAULT 0,
  "rifleKill" INTEGER NOT NULL DEFAULT 0,
  "rifleDeath" INTEGER NOT NULL DEFAULT 0,
  "sniperGames" INTEGER NOT NULL DEFAULT 0,
  "sniperKill" INTEGER NOT NULL DEFAULT 0,
  "sniperDeath" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaguePlayerTierStat_pkey" PRIMARY KEY ("leaguePlayerId","tier")
);

CREATE INDEX IF NOT EXISTS "LeaguePlayerTierStat_tier_idx" ON "LeaguePlayerTierStat"("tier");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeaguePlayerTierStat_leaguePlayerId_fkey') THEN
    ALTER TABLE "LeaguePlayerTierStat"
      ADD CONSTRAINT "LeaguePlayerTierStat_leaguePlayerId_fkey"
      FOREIGN KEY ("leaguePlayerId") REFERENCES "LeaguePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
