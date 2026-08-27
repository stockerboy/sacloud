-- D-153 — 원본(3rd.supply) 점수를 우리 계산과 **분리해서** 보관한다.
--
-- 왜 컬럼을 따로 두는가
--   기존 `ratingBefore` / `ratingUpdate` 는 **우리가 계산한** 값이다(D-145).
--   여기에 원본 점수를 덮어쓰면 어느 쪽 숫자인지 알 수 없게 되고, 한 번 섞이면
--   되돌릴 수 없다. `CLAUDE.md` 3-A 2번 — 기존 rating_update 를 추정 공식으로
--   덮어쓰지 않는다.
--
--   시즌7 베타 운영 화면은 아래 source 값을 쓴다. 우리 공식은 코드와 컬럼을
--   그대로 두되 화면에 적용하지 않는다.
--
-- 전부 NULL 허용이고 기본값이 없다 — **기존 행은 하나도 바뀌지 않는다.**
-- 되돌리려면 컬럼만 지우면 된다. 파괴적 변경이 아니다.

ALTER TABLE "MatchPlayerStat"
  ADD COLUMN IF NOT EXISTS "sourceRating" INTEGER,
  ADD COLUMN IF NOT EXISTS "sourceRatingDelta" INTEGER;

ALTER TABLE "Match"
  ADD COLUMN IF NOT EXISTS "redSourceRating" INTEGER,
  ADD COLUMN IF NOT EXISTS "blueSourceRating" INTEGER,
  ADD COLUMN IF NOT EXISTS "redSourceRatingUpdate" INTEGER,
  ADD COLUMN IF NOT EXISTS "blueSourceRatingUpdate" INTEGER;
