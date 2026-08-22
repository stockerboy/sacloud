-- 무소속리그를 **별도 League 행**으로 운영하기 위한 구분 (D-107).
--
-- 개인 기록은 이미 LeaguePlayer(leagueId, playerId) 단위로 분리돼 있어 스키마를 다시 짜지 않는다.
-- 이 컬럼이 정하는 것은 공개 범위 하나다 — 무소속리그에서는 누적 kill/death/킬뎃을 화면에 내보내지 않는다.
-- 기존 리그는 전부 'official'로 남는다 (기본값).
ALTER TABLE "League" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'official';
