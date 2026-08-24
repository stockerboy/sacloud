-- 현재 소속과 경기 당시 소속의 분리 (D-130 · D-131). 추가 전용이다.
-- 기존 행은 전부 NULL 로 남고, 백필은 별도 명령이 근거를 보고 채운다.

-- 소속 관측의 출처. `joinedAt` 은 그대로 두고 "언제 관측했는가"를 따로 남긴다
ALTER TABLE "LeagueRosterMembership" ADD COLUMN "observedAt" TIMESTAMP(3);
ALTER TABLE "LeagueRosterMembership" ADD COLUMN "confidence" TEXT;
ALTER TABLE "LeagueRosterMembership" ADD COLUMN "sourceRef" TEXT;

-- 경기 당시 소속 스냅샷. 현재 소속을 join 해 과거 화면을 그리지 않기 위한 것이다
ALTER TABLE "MatchPlayerStat" ADD COLUMN "matchTimeClanName" TEXT;
ALTER TABLE "MatchPlayerStat" ADD COLUMN "matchTimeLeagueClanId" TEXT;
ALTER TABLE "MatchPlayerStat" ADD COLUMN "matchTimeClanSlug" TEXT;
ALTER TABLE "MatchPlayerStat" ADD COLUMN "matchTimeClanMarkBgUrl" TEXT;
ALTER TABLE "MatchPlayerStat" ADD COLUMN "matchTimeClanMarkFrontUrl" TEXT;
ALTER TABLE "MatchPlayerStat" ADD COLUMN "matchTimeClanSource" TEXT;
ALTER TABLE "MatchPlayerStat" ADD COLUMN "matchTimeClanObservedAt" TIMESTAMP(3);
ALTER TABLE "MatchPlayerStat" ADD COLUMN "matchTimeClanConfidence" TEXT;

CREATE INDEX "MatchPlayerStat_matchTimeLeagueClanId_idx" ON "MatchPlayerStat"("matchTimeLeagueClanId");
