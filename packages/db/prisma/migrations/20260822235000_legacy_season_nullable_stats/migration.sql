-- 과거(3rd.supply) 시즌 카드는 시즌마다 제공 필드가 다르다.
-- 예: 시즌 4는 승률·킬뎃만 주고 승/패/킬/데스를 주지 않는다.
-- 0으로 채우면 화면에 `0승 0패 · 승률 56.9%` 라는 거짓 기록이 남는다 (D-106).
-- SACLOUD가 계산한 카드는 계속 값을 채운다. 여기서는 **없을 수 있게만** 만든다.
ALTER TABLE "LeaguePlayerSeason" ALTER COLUMN "rating" DROP NOT NULL,
ALTER COLUMN "win" DROP NOT NULL,
ALTER COLUMN "win" DROP DEFAULT,
ALTER COLUMN "lose" DROP NOT NULL,
ALTER COLUMN "lose" DROP DEFAULT,
ALTER COLUMN "kill" DROP NOT NULL,
ALTER COLUMN "kill" DROP DEFAULT,
ALTER COLUMN "death" DROP NOT NULL,
ALTER COLUMN "death" DROP DEFAULT;
