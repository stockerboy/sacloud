-- D-149: 무기별 전적을 실제로 분리 집계한다.
--
-- games          : 그 무기로 뛴 경기 전부 (KDA 를 모르는 경기 포함)
-- knownStatGames : 그중 K/D/A 를 아는 경기. 킬·데스·어시의 **분모**다
--
-- 둘을 나누는 이유 — 3rd.supply 는 무기를 주고 넥슨은 KDA 를 준다.
-- 한쪽만 있는 참가자가 있으므로 "몇 판 뛰었나" 와 "몇 판의 기록을 아나" 가 다르다.
-- 모르는 경기를 0킬로 세면 평균이 거짓이 된다.
ALTER TABLE "LeaguePlayerWeaponStat" ADD COLUMN "games" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaguePlayerWeaponStat" ADD COLUMN "knownStatGames" INTEGER NOT NULL DEFAULT 0;

-- 최근 20경기 평균 본클랜원 수. compositionScore 를 만든 **입력값**이다.
-- 화면에서 다시 계산하지 않고 이 값을 그대로 보여 준다 (D-149).
ALTER TABLE "LeagueClan" ADD COLUMN "compositionMembers" DOUBLE PRECISION NOT NULL DEFAULT 0;
