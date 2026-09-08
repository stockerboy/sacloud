-- ★「물어본 시각」과 「받은 시각」을 가른다★ (2026-09-08 · P0)
--
--   BarracksClanMatchRaw.fetchedAt 을 「마지막 요청」처럼 쓰다가 수집이 8시간 멈췄다.
--   그 값은 새 경기가 들어왔을 때만 생기므로, 죽은 클랜은 영원히 「한 번도 못 받음」이 되어
--   우선순위 맨 앞을 독점했다. 요청만 해도 갱신되는 칸이 필요하다.
--
-- ⚠ 기존 표·칸의 뜻은 하나도 안 바꾼다. 이 표는 ★새로 더하는 것★ 이다.
-- ⚠ 되돌리려면: DROP TABLE IF EXISTS "BarracksListRequest";
CREATE TABLE IF NOT EXISTS "BarracksListRequest" (
    "subject"     TEXT NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "okAt"        TIMESTAMPTZ(3),
    "newMatchAt"  TIMESTAMPTZ(3),
    "requests"    INTEGER NOT NULL DEFAULT 0,
    "failures"    INTEGER NOT NULL DEFAULT 0,
    "updatedAt"   TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "BarracksListRequest_pkey" PRIMARY KEY ("subject")
);
CREATE INDEX IF NOT EXISTS "BarracksListRequest_requestedAt_idx"
    ON "BarracksListRequest" ("requestedAt");
