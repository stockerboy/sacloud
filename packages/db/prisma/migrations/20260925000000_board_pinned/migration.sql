-- ★게시글 상단 고정★ (2026-09-25 사장님 「관리자 권한으로 아무글이나 상단 고정하고 내릴 수 있게」)
--
-- `notice`(공지 여부)와 별개의 글 단위 고정이다. null 이면 고정 아님.
-- 운영에는 `_prisma_migrations` 기록이 뒤처져 있어(2026-09-21 이후 손으로 적용)
-- 이 파일도 같은 SQL 을 VPS 에서 직접 흘려 적용했다 — 그래서 전부 IF NOT EXISTS 다.
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Board_pinnedAt_idx" ON "Board"("pinnedAt" DESC);
