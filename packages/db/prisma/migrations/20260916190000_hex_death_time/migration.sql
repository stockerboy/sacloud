-- ★개인 육각 4번 축의 새 재료 — 평균 사망 시간★ (2026-09-16 사장님)
--
--   > «개인랭킹에서 선짤 > 이것도 축하나만 바꾸자 / 이거 평균사망시간 1분27초
--   >  이런식으로 / 이 시간이 1분10초 이런식으로 더 늦게 죽었을수록 축이 더 높게끔»
--
--   deathSeconds  라운드 시작부터 내가 죽기까지의 초, 경기 전체 합
--   deathCount    위 합에 들어간 죽음의 수
--
--   평균 = deathSeconds / deathCount.
--
--   ★라운드 시작 기준이다★ — 경기 시작 기준으로 재면 뒤 라운드일수록 커져서
--   «오래 살았다» 와 «늦은 라운드였다» 가 섞인다.
--
--   ⚠ 끝까지 산 라운드는 안 들어간다 (죽은 줄이 없다). 그래서 이 값은
--     «죽을 때는 언제 죽었나» 이지 «얼마나 오래 사나» 가 아니다.
--
--   ★기본값 0 이라 옛 줄은 그대로 살아 있다.★ 재집계가 채운다.
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "deathSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchPlayerHex" ADD COLUMN IF NOT EXISTS "deathCount"   INTEGER NOT NULL DEFAULT 0;
