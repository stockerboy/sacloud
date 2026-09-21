-- ★화면에 적히는 글 — 관리자가 사이트에서 고친다★ (2026-09-21 사장님)
--
-- 리그 안내문이 코드에 박혀 있어서 글자 하나 고치려면 배포를 해야 했다.
-- 이 표에 줄이 없으면 코드에 박힌 글이 그대로 나온다 — 비어 있어도 화면은 그대로다.
CREATE TABLE IF NOT EXISTS "SiteText" (
  "key"             TEXT PRIMARY KEY,
  "title"           TEXT,
  "body"            TEXT NOT NULL,
  "hidden"          BOOLEAN NOT NULL DEFAULT false,
  "updatedByUserId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SiteText_hidden_idx" ON "SiteText"("hidden");

DO $$ BEGIN
  ALTER TABLE "SiteText"
    ADD CONSTRAINT "SiteText_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
