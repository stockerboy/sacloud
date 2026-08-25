-- D-148: 참가자 명단은 3rd.supply 로 복원하되 KDA 는 모르면 null 로 둔다.
-- NOT NULL 을 푸는 것뿐이다. 기존 값을 지우거나 바꾸지 않는다 (additive-safe).
ALTER TABLE "MatchPlayerStat" ALTER COLUMN "kill" DROP NOT NULL;
ALTER TABLE "MatchPlayerStat" ALTER COLUMN "death" DROP NOT NULL;
ALTER TABLE "MatchPlayerStat" ALTER COLUMN "assist" DROP NOT NULL;
