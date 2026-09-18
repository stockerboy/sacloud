CREATE INDEX CONCURRENTLY IF NOT EXISTS "BarracksClanMatchRaw_status_matchKey_idx"
  ON "BarracksClanMatchRaw" ("status", "matchKey");
