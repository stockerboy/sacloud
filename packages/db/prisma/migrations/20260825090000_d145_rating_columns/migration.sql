-- D-145 레이팅 사양 반영 — **추가만 한다.** 기존 컬럼을 지우거나 타입을 바꾸지 않는다.
--
-- rating(Int) 은 그대로 두되 의미가 "표시 점수" 로 바뀐다 (랭킹 인덱스 그대로 쓴다).
-- 내부 Elo 는 실수로 따로 보관한다 — 경기마다 반올림하면 제로섬이 깨진다.

ALTER TABLE "LeaguePlayer" ADD COLUMN "internalRating" DOUBLE PRECISION NOT NULL DEFAULT 3000;
ALTER TABLE "LeaguePlayer" ADD COLUMN "activityPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayer" ADD COLUMN "lastRatedAt" TIMESTAMP(3);

ALTER TABLE "LeagueClan" ADD COLUMN "internalRating" DOUBLE PRECISION NOT NULL DEFAULT 3000;
ALTER TABLE "LeagueClan" ADD COLUMN "compositionScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "LeagueClan" ADD COLUMN "activityPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "LeagueClan" ADD COLUMN "lastRatedAt" TIMESTAMP(3);

-- 기본값 변경은 새로 만들어지는 행에만 영향을 준다. 기존 행의 값은 건드리지 않는다.
ALTER TABLE "LeaguePlayer" ALTER COLUMN "rating" SET DEFAULT 3000;
ALTER TABLE "LeaguePlayer" ALTER COLUMN "baseRating" SET DEFAULT 3000;
ALTER TABLE "LeagueClan" ALTER COLUMN "rating" SET DEFAULT 3000;
