-- ★깃발★ — 하루(17:00~03:00)의 1·2·3등 (2026-09-15 사장님)
--   «막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고
--    그 깃발을 개인기록에 깃발 5개 이런식으로 표시해주면 좋겠어»
--
-- (leagueId, dayKey, rank) 가 자물쇠다 — 마감 잡을 몇 번 돌려도 깃발은 하나뿐이다.
CREATE TABLE "LeagueFlag" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "clanId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "games" INTEGER NOT NULL,
    "win" INTEGER NOT NULL,
    "lose" INTEGER NOT NULL,
    "kdRate" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "plantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueFlag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeagueFlag_leagueId_dayKey_rank_key" ON "LeagueFlag"("leagueId", "dayKey", "rank");
CREATE INDEX "LeagueFlag_playerId_rank_idx" ON "LeagueFlag"("playerId", "rank");
CREATE INDEX "LeagueFlag_leagueId_dayKey_idx" ON "LeagueFlag"("leagueId", "dayKey");

ALTER TABLE "LeagueFlag" ADD CONSTRAINT "LeagueFlag_leagueId_fkey"
  FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueFlag" ADD CONSTRAINT "LeagueFlag_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeagueFlag" ADD CONSTRAINT "LeagueFlag_clanId_fkey"
  FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
