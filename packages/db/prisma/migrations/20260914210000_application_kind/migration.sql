-- ★신청서 양식이 바뀌었다★ (2026-09-14 저녁 · 사장님이 새 양식을 적어 주셨다)
--
--   클랜명(명단있는 클랜은 자동완성) 검색하기
--   안나오는 클랜은 여기에 따로 적기 — 클랜명 / 클랜병영수첩
--   관리자와 연락 가능한 카톡ID or Discord ID
--   IPL > LLM 전환등록 / LLM 신규등록 / YSL 신규등록 / IPL 신규등록
--
-- ★칸을 더하기만 한다.★ 기존 칸은 하나도 안 지운다 — 이미 들어온 신청서가 쓰고 있다.
-- `clanUrl` 만 NULL 을 받게 푼다: 명단에서 고른 클랜은 주소를 안 받기 때문이다
-- (우리가 이미 아는 값을 또 적게 하지 않는다).

ALTER TABLE "LeagueApplication" ADD COLUMN IF NOT EXISTS "kind"        TEXT;
ALTER TABLE "LeagueApplication" ADD COLUMN IF NOT EXISTS "clanSlug"    TEXT;
ALTER TABLE "LeagueApplication" ADD COLUMN IF NOT EXISTS "contactKind" TEXT;
ALTER TABLE "LeagueApplication" ADD COLUMN IF NOT EXISTS "contactId"   TEXT;

ALTER TABLE "LeagueApplication" ALTER COLUMN "clanUrl" DROP NOT NULL;
-- 멤버 다섯도 선택이 됐다 (새 양식에서 빠졌다). 옛 줄은 그대로 들고 있다
ALTER TABLE "LeagueApplication" ALTER COLUMN "members" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "LeagueApplication_kind_idx" ON "LeagueApplication" ("kind");
