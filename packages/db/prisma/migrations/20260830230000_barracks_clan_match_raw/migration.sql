-- 병영수첩 클랜전 목록(`GetClanMatchList`) 원문 보존 — IPL 기록 이관.
--
-- **추가만 한다.** 기존 표·값은 건드리지 않는다.
-- 여러 번 돌려도 안전하도록 전부 IF NOT EXISTS 다 (forward-only).
--
-- 같은 경기가 **양쪽 클랜 목록에 다 나오므로** 조회 주체(subject)가 유일키에 들어간다.

CREATE TABLE IF NOT EXISTS "BarracksClanMatchRaw" (
  "id"          TEXT NOT NULL,
  "source"      TEXT NOT NULL DEFAULT 'nexon_barracks',
  "endpoint"    TEXT NOT NULL DEFAULT '/api/ClanHome/GetClanMatchList/',
  "matchKey"    TEXT NOT NULL,
  "subject"     TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'ok',
  "errorCode"   TEXT,
  "fetchedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fetchCount"  INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "BarracksClanMatchRaw_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BarracksClanMatchRaw_matchKey_subject_payloadHash_key"
  ON "BarracksClanMatchRaw" ("matchKey", "subject", "payloadHash");
CREATE INDEX IF NOT EXISTS "BarracksClanMatchRaw_matchKey_idx"
  ON "BarracksClanMatchRaw" ("matchKey");
CREATE INDEX IF NOT EXISTS "BarracksClanMatchRaw_subject_idx"
  ON "BarracksClanMatchRaw" ("subject");
CREATE INDEX IF NOT EXISTS "BarracksClanMatchRaw_fetchedAt_idx"
  ON "BarracksClanMatchRaw" ("fetchedAt");
