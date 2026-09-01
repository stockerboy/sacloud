-- 회원가입을 「아이디 + 비밀번호」로 바꾼다 (2026-09-01 · D-252)
--
--  · username 을 추가한다. 소문자로 정규화해 저장하므로 유일 인덱스 하나로 충분하다
--  · email 은 선택 입력이 됐다 — 메일 발송이 없어서 가입에 요구할 수 없다.
--    기존 계정의 값은 그대로 두고 NOT NULL 만 푼다 (데이터를 지우지 않는다)

ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
