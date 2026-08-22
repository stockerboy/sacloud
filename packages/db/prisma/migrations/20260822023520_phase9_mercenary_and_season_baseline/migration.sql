/*
  Warnings:

  - You are about to drop the column `clanAConfirmedCount` on the `NexonMatch` table. All the data in the column will be lost.
  - You are about to drop the column `clanBConfirmedCount` on the `NexonMatch` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MatchPlayerStat" ADD COLUMN     "participantRole" TEXT NOT NULL DEFAULT 'member',
ADD COLUMN     "rosterLeagueClanId" TEXT;

-- AlterTable
ALTER TABLE "NexonMatch" DROP COLUMN "clanAConfirmedCount",
DROP COLUMN "clanBConfirmedCount",
ADD COLUMN     "loserConfirmed" INTEGER,
ADD COLUMN     "loserMembersConfirmed" INTEGER,
ADD COLUMN     "loserMercenariesConfirmed" INTEGER,
ADD COLUMN     "winnerConfirmed" INTEGER,
ADD COLUMN     "winnerMembersConfirmed" INTEGER,
ADD COLUMN     "winnerMercenariesConfirmed" INTEGER;
