-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" INTEGER NOT NULL DEFAULT 0,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlayerLink" (
    "userId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPlayerLink_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clanId" TEXT,
    "position" TEXT,
    "note" TEXT,
    "renewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourcePlayerId" TEXT,
    "nexonOuid" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "markBgUrl" TEXT,
    "markFrontUrl" TEXT,
    "masterPlayerId" TEXT,
    "notice" TEXT,
    "establishedAt" DATE,
    "renewedAt" TIMESTAMP(3),
    "blockInvitation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceClanId" TEXT,

    CONSTRAINT "Clan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMap" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" TEXT,
    "divisionCount" INTEGER NOT NULL DEFAULT 1,
    "status" INTEGER NOT NULL DEFAULT 1,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceLeagueId" TEXT,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMap" (
    "leagueId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,

    CONSTRAINT "LeagueMap_pkey" PRIMARY KEY ("leagueId","mapId")
);

-- CreateTable
CREATE TABLE "LeaguePlayerLimit" (
    "leagueId" TEXT NOT NULL,
    "playerCount" INTEGER NOT NULL,

    CONSTRAINT "LeaguePlayerLimit_pkey" PRIMARY KEY ("leagueId","playerCount")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueClan" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "division" INTEGER NOT NULL DEFAULT 1,
    "win" INTEGER NOT NULL DEFAULT 0,
    "lose" INTEGER NOT NULL DEFAULT 0,
    "placement" BOOLEAN NOT NULL DEFAULT true,
    "placementPlayed" INTEGER NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleteRequestedAt" TIMESTAMP(3),
    "deletesAt" TIMESTAMP(3),
    "expelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceLeagueClanId" TEXT,

    CONSTRAINT "LeagueClan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaguePlayer" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "clanId" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "baseRating" INTEGER NOT NULL DEFAULT 1500,
    "win" INTEGER NOT NULL DEFAULT 0,
    "lose" INTEGER NOT NULL DEFAULT 0,
    "kill" INTEGER NOT NULL DEFAULT 0,
    "death" INTEGER NOT NULL DEFAULT 0,
    "assist" INTEGER NOT NULL DEFAULT 0,
    "headshot" INTEGER NOT NULL DEFAULT 0,
    "mvpCount" INTEGER NOT NULL DEFAULT 0,
    "placement" BOOLEAN NOT NULL DEFAULT true,
    "placementPlayed" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceLeaguePlayerId" TEXT,

    CONSTRAINT "LeaguePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaguePlayerWeaponStat" (
    "leaguePlayerId" TEXT NOT NULL,
    "weapon" INTEGER NOT NULL,
    "ratingDelta" INTEGER NOT NULL DEFAULT 0,
    "win" INTEGER NOT NULL DEFAULT 0,
    "lose" INTEGER NOT NULL DEFAULT 0,
    "kill" INTEGER NOT NULL DEFAULT 0,
    "death" INTEGER NOT NULL DEFAULT 0,
    "assist" INTEGER NOT NULL DEFAULT 0,
    "headshot" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaguePlayerWeaponStat_pkey" PRIMARY KEY ("leaguePlayerId","weapon")
);

-- CreateTable
CREATE TABLE "LeaguePlayerSeason" (
    "id" TEXT NOT NULL,
    "leaguePlayerId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "rank" INTEGER,
    "rankCount" INTEGER,
    "rating" INTEGER NOT NULL,
    "win" INTEGER NOT NULL DEFAULT 0,
    "lose" INTEGER NOT NULL DEFAULT 0,
    "kill" INTEGER NOT NULL DEFAULT 0,
    "death" INTEGER NOT NULL DEFAULT 0,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaguePlayerSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueClanSeason" (
    "id" TEXT NOT NULL,
    "leagueClanId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "rank" INTEGER,
    "rankCount" INTEGER,
    "rating" INTEGER NOT NULL,
    "division" INTEGER NOT NULL DEFAULT 1,
    "win" INTEGER NOT NULL DEFAULT 0,
    "lose" INTEGER NOT NULL DEFAULT 0,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueClanSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueInvitation" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "division" INTEGER NOT NULL DEFAULT 1,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "LeagueInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT,
    "mapId" TEXT NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "playTime" INTEGER NOT NULL,
    "blueFirst" BOOLEAN NOT NULL DEFAULT false,
    "winnerSide" TEXT NOT NULL,
    "mvpPlayerId" TEXT,
    "redLeagueClanId" TEXT NOT NULL,
    "blueLeagueClanId" TEXT NOT NULL,
    "redDivisionAtMatch" INTEGER NOT NULL,
    "blueDivisionAtMatch" INTEGER NOT NULL,
    "redRatingBefore" INTEGER,
    "blueRatingBefore" INTEGER,
    "redPlacement" BOOLEAN NOT NULL DEFAULT false,
    "bluePlacement" BOOLEAN NOT NULL DEFAULT false,
    "redRatingUpdate" INTEGER,
    "blueRatingUpdate" INTEGER,
    "origin" TEXT NOT NULL DEFAULT 'sacloud',
    "sourceMatchId" TEXT,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPlayerStat" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "kill" INTEGER NOT NULL,
    "death" INTEGER NOT NULL,
    "assist" INTEGER NOT NULL,
    "headshot" INTEGER,
    "damage" INTEGER,
    "weapon" INTEGER NOT NULL,
    "dropout" BOOLEAN NOT NULL DEFAULT false,
    "mvp" BOOLEAN NOT NULL DEFAULT false,
    "ratingBefore" INTEGER,
    "ratingUpdate" INTEGER,
    "ratingAfter" INTEGER,
    "playerDivisionAtMatch" INTEGER NOT NULL,
    "opponentDivisionAtMatch" INTEGER NOT NULL,
    "opponentAvgRating" INTEGER,
    "kUsed" DOUBLE PRECISION,
    "multiplierUsed" DOUBLE PRECISION,
    "formulaVersion" TEXT,
    "isPlacement" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MatchPlayerStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankSnapshot" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "division" INTEGER,
    "seasonNumber" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "RankSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardCategory" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notice" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BoardCategory_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "anonAlias" TEXT,
    "anonPasswordHash" TEXT,
    "discloseType" INTEGER NOT NULL DEFAULT 0,
    "writerApp" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "dislikeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdited" TIMESTAMP(3),

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "anonAlias" TEXT,
    "anonPasswordHash" TEXT,
    "discloseType" INTEGER NOT NULL DEFAULT 0,
    "writerApp" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "dislikeCount" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEdited" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "userId" TEXT,
    "byteSize" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawImport" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "requestParams" JSONB,
    "httpStatus" INTEGER,
    "raw" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "migrationVersion" TEXT NOT NULL,
    "normalizedAt" TIMESTAMP(3),

    CONSTRAINT "RawImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMapping" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cursor" TEXT,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "expected" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "migrationVersion" TEXT NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFailure" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "sourceId" TEXT,
    "reason" TEXT NOT NULL,
    "detail" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationCheck" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "actual" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "note" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "migrationVersion" TEXT NOT NULL,

    CONSTRAINT "MigrationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingConfig" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT,
    "divisionKey" TEXT NOT NULL,
    "expectedScoreDivisor" DOUBLE PRECISION NOT NULL DEFAULT 3400,
    "loseK" DOUBLE PRECISION NOT NULL,
    "winMultiplier" DOUBLE PRECISION NOT NULL,
    "crossDivisionMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "formulaVersion" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_nickname_key" ON "User"("nickname");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlayerLink_playerId_key" ON "UserPlayerLink"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_kind_idx" ON "AuthToken"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Player_name_idx" ON "Player"("name");

-- CreateIndex
CREATE INDEX "Player_clanId_idx" ON "Player"("clanId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_sourcePlayerId_key" ON "Player"("sourcePlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_nexonOuid_key" ON "Player"("nexonOuid");

-- CreateIndex
CREATE UNIQUE INDEX "Clan_slug_key" ON "Clan"("slug");

-- CreateIndex
CREATE INDEX "Clan_name_idx" ON "Clan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Clan_sourceClanId_key" ON "Clan"("sourceClanId");

-- CreateIndex
CREATE UNIQUE INDEX "GameMap_name_key" ON "GameMap"("name");

-- CreateIndex
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

-- CreateIndex
CREATE INDEX "League_official_createdAt_idx" ON "League"("official", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "League_sourceLeagueId_key" ON "League"("sourceLeagueId");

-- CreateIndex
CREATE INDEX "Season_leagueId_number_idx" ON "Season"("leagueId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Season_leagueId_number_key" ON "Season"("leagueId", "number");

-- CreateIndex
CREATE INDEX "LeagueClan_leagueId_division_rating_idx" ON "LeagueClan"("leagueId", "division", "rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LeagueClan_leagueId_clanId_key" ON "LeagueClan"("leagueId", "clanId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueClan_sourceLeagueClanId_key" ON "LeagueClan"("sourceLeagueClanId");

-- CreateIndex
CREATE INDEX "LeaguePlayer_leagueId_rating_idx" ON "LeaguePlayer"("leagueId", "rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LeaguePlayer_leagueId_playerId_key" ON "LeaguePlayer"("leagueId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaguePlayer_sourceLeaguePlayerId_key" ON "LeaguePlayer"("sourceLeaguePlayerId");

-- CreateIndex
CREATE INDEX "LeaguePlayerWeaponStat_weapon_ratingDelta_idx" ON "LeaguePlayerWeaponStat"("weapon", "ratingDelta" DESC);

-- CreateIndex
CREATE INDEX "LeaguePlayerSeason_seasonId_rating_idx" ON "LeaguePlayerSeason"("seasonId", "rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LeaguePlayerSeason_leaguePlayerId_seasonId_key" ON "LeaguePlayerSeason"("leaguePlayerId", "seasonId");

-- CreateIndex
CREATE INDEX "LeagueClanSeason_seasonId_division_rating_idx" ON "LeagueClanSeason"("seasonId", "division", "rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "LeagueClanSeason_leagueClanId_seasonId_key" ON "LeagueClanSeason"("leagueClanId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueInvitation_token_key" ON "LeagueInvitation"("token");

-- CreateIndex
CREATE INDEX "LeagueInvitation_leagueId_createdAt_idx" ON "LeagueInvitation"("leagueId", "createdAt");

-- CreateIndex
CREATE INDEX "Match_leagueId_startAt_idx" ON "Match"("leagueId", "startAt" DESC);

-- CreateIndex
CREATE INDEX "Match_redLeagueClanId_startAt_idx" ON "Match"("redLeagueClanId", "startAt" DESC);

-- CreateIndex
CREATE INDEX "Match_blueLeagueClanId_startAt_idx" ON "Match"("blueLeagueClanId", "startAt" DESC);

-- CreateIndex
CREATE INDEX "Match_seasonId_idx" ON "Match"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_origin_sourceMatchId_key" ON "Match"("origin", "sourceMatchId");

-- CreateIndex
CREATE INDEX "MatchPlayerStat_playerId_matchId_idx" ON "MatchPlayerStat"("playerId", "matchId");

-- CreateIndex
CREATE INDEX "MatchPlayerStat_matchId_side_idx" ON "MatchPlayerStat"("matchId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayerStat_matchId_playerId_key" ON "MatchPlayerStat"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "RankSnapshot_generatedAt_idx" ON "RankSnapshot"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RankSnapshot_leagueId_kind_division_seasonNumber_key" ON "RankSnapshot"("leagueId", "kind", "division", "seasonNumber");

-- CreateIndex
CREATE INDEX "BoardCategory_order_idx" ON "BoardCategory"("order");

-- CreateIndex
CREATE INDEX "Board_categorySlug_createdAt_idx" ON "Board"("categorySlug", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Board_createdAt_idx" ON "Board"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Board_likeCount_createdAt_idx" ON "Board"("likeCount" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Comment_boardId_createdAt_idx" ON "Comment"("boardId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Vote_targetType_targetId_idx" ON "Vote"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_targetType_targetId_voterKey_key" ON "Vote"("targetType", "targetId", "voterKey");

-- CreateIndex
CREATE INDEX "Upload_ownerKey_idx" ON "Upload"("ownerKey");

-- CreateIndex
CREATE INDEX "RawImport_source_endpoint_fetchedAt_idx" ON "RawImport"("source", "endpoint", "fetchedAt");

-- CreateIndex
CREATE INDEX "RawImport_normalizedAt_idx" ON "RawImport"("normalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawImport_source_endpoint_sourceId_migrationVersion_key" ON "RawImport"("source", "endpoint", "sourceId", "migrationVersion");

-- CreateIndex
CREATE INDEX "SourceMapping_source_entityType_localId_idx" ON "SourceMapping"("source", "entityType", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceMapping_source_entityType_sourceId_key" ON "SourceMapping"("source", "entityType", "sourceId");

-- CreateIndex
CREATE INDEX "ImportJob_status_nextRetryAt_idx" ON "ImportJob"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_source_jobKey_migrationVersion_key" ON "ImportJob"("source", "jobKey", "migrationVersion");

-- CreateIndex
CREATE INDEX "ImportFailure_source_jobKey_idx" ON "ImportFailure"("source", "jobKey");

-- CreateIndex
CREATE INDEX "ImportFailure_resolvedAt_idx" ON "ImportFailure"("resolvedAt");

-- CreateIndex
CREATE INDEX "MigrationCheck_migrationVersion_passed_idx" ON "MigrationCheck"("migrationVersion", "passed");

-- CreateIndex
CREATE INDEX "MigrationCheck_name_idx" ON "MigrationCheck"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RatingConfig_leagueId_divisionKey_formulaVersion_key" ON "RatingConfig"("leagueId", "divisionKey", "formulaVersion");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "RateLimit_windowEnd_idx" ON "RateLimit"("windowEnd");

-- AddForeignKey
ALTER TABLE "UserPlayerLink" ADD CONSTRAINT "UserPlayerLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlayerLink" ADD CONSTRAINT "UserPlayerLink_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clan" ADD CONSTRAINT "Clan_masterPlayerId_fkey" FOREIGN KEY ("masterPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMap" ADD CONSTRAINT "LeagueMap_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMap" ADD CONSTRAINT "LeagueMap_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "GameMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePlayerLimit" ADD CONSTRAINT "LeaguePlayerLimit_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueClan" ADD CONSTRAINT "LeagueClan_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueClan" ADD CONSTRAINT "LeagueClan_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePlayer" ADD CONSTRAINT "LeaguePlayer_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePlayer" ADD CONSTRAINT "LeaguePlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePlayerWeaponStat" ADD CONSTRAINT "LeaguePlayerWeaponStat_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "LeaguePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePlayerSeason" ADD CONSTRAINT "LeaguePlayerSeason_leaguePlayerId_fkey" FOREIGN KEY ("leaguePlayerId") REFERENCES "LeaguePlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaguePlayerSeason" ADD CONSTRAINT "LeaguePlayerSeason_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueClanSeason" ADD CONSTRAINT "LeagueClanSeason_leagueClanId_fkey" FOREIGN KEY ("leagueClanId") REFERENCES "LeagueClan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueClanSeason" ADD CONSTRAINT "LeagueClanSeason_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueInvitation" ADD CONSTRAINT "LeagueInvitation_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueInvitation" ADD CONSTRAINT "LeagueInvitation_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "GameMap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_redLeagueClanId_fkey" FOREIGN KEY ("redLeagueClanId") REFERENCES "LeagueClan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_blueLeagueClanId_fkey" FOREIGN KEY ("blueLeagueClanId") REFERENCES "LeagueClan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_mvpPlayerId_fkey" FOREIGN KEY ("mvpPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayerStat" ADD CONSTRAINT "MatchPlayerStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayerStat" ADD CONSTRAINT "MatchPlayerStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankSnapshot" ADD CONSTRAINT "RankSnapshot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_categorySlug_fkey" FOREIGN KEY ("categorySlug") REFERENCES "BoardCategory"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingConfig" ADD CONSTRAINT "RatingConfig_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
