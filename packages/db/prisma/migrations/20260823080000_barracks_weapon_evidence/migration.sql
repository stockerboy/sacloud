-- CreateTable
CREATE TABLE "BarracksRawImport" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'nexon_barracks',
    "endpoint" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "clanNo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "errorCode" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BarracksRawImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchWeaponEvidence" (
    "id" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "userNexonSn" TEXT NOT NULL,
    "nickname" TEXT,
    "playerId" TEXT,
    "rifleKills" INTEGER NOT NULL,
    "sniperKills" INTEGER NOT NULL,
    "arHits" INTEGER,
    "srHits" INTEGER,
    "classification" TEXT NOT NULL,
    "classificationReason" TEXT NOT NULL,
    "classifierVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'nexon_barracks',
    "rawId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchWeaponEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BarracksRawImport_matchKey_idx" ON "BarracksRawImport"("matchKey");

-- CreateIndex
CREATE INDEX "BarracksRawImport_fetchedAt_idx" ON "BarracksRawImport"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BarracksRawImport_matchKey_clanNo_payloadHash_key" ON "BarracksRawImport"("matchKey", "clanNo", "payloadHash");

-- CreateIndex
CREATE INDEX "MatchWeaponEvidence_matchKey_idx" ON "MatchWeaponEvidence"("matchKey");

-- CreateIndex
CREATE INDEX "MatchWeaponEvidence_playerId_idx" ON "MatchWeaponEvidence"("playerId");

-- CreateIndex
CREATE INDEX "MatchWeaponEvidence_classification_idx" ON "MatchWeaponEvidence"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "MatchWeaponEvidence_matchKey_userNexonSn_key" ON "MatchWeaponEvidence"("matchKey", "userNexonSn");

-- AddForeignKey
ALTER TABLE "MatchWeaponEvidence" ADD CONSTRAINT "MatchWeaponEvidence_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

