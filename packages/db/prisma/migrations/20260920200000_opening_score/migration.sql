-- ★선짤 점수★ (2026-09-20 사장님)
--
--   openingScore    그 경기에서 선짤로 번(잃은) 점수. `score` 에 이미 들어 있고
--                   이 칸은 «얼마가 선짤 몫인지» 를 따로 든다 — 화면의 «점수판» 이 쓴다.
--   openingRevenged 선짤당했지만 팀이 3초 안에 되잡아 «면제» 된 횟수 (설명용 · 점수 0)
--
-- ⚠ 2026-09-20 이전 경기는 0 이다 (사장님: 「오늘 경기부터 계산해」).
--   그래서 재계산이 필요 없다.
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "openingScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "openingRevenged" INTEGER NOT NULL DEFAULT 0;

-- ★후반이 시작하는 라운드★ (2026-09-20 사장님: 「전반1라운드 후반12라운드 이런식으로」)
--
--   이 값이 8 이면 «1~7이 전반, 8부터 후반» 이다.
--   규칙은 D-208 — 한 팀이 라운드 5승을 채운 다음 라운드부터 후반이다.
--   모르면 NULL 이고 화면은 「전반/후반」 을 안 적는다.
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "secondHalfFrom" INTEGER;
