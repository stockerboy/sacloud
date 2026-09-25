-- ★관리자 대리 클랜 글쓰기★ (2026-09-25 사장님 「관리자는 클랜 아무거나 선택해서 마음대로
--   글 쓸 수 있게 해줘 (…) 베리타스 고르고 쓰면 베리타스로 나오고(익명) 관리자 아닌것처럼」)
--
-- 값이 있으면 작성자의 실제 소속 대신 이 클랜을 익명 표시에 쓴다. 서버가 isAdmin 을
-- 확인한 뒤에만 채운다 — 클라이언트 입력을 그대로 믿지 않는다.
-- `_prisma_migrations` 기록이 운영에서 뒤처져 있어(2026-09-21 이후 손으로 적용) 이 파일도
-- VPS 에서 같은 SQL 을 직접 흘려 적용한다 — 그래서 IF NOT EXISTS 다.
ALTER TABLE "Board" ADD COLUMN IF NOT EXISTS "adminAsClanId" TEXT;
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "adminAsClanId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Board" ADD CONSTRAINT "Board_adminAsClanId_fkey"
    FOREIGN KEY ("adminAsClanId") REFERENCES "Clan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Comment" ADD CONSTRAINT "Comment_adminAsClanId_fkey"
    FOREIGN KEY ("adminAsClanId") REFERENCES "Clan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
