-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "evidenceConfidence" TEXT,
ADD COLUMN     "participantCompleteness" TEXT;

-- AlterTable
ALTER TABLE "NexonMatch" ADD COLUMN     "clanAConfirmedCount" INTEGER,
ADD COLUMN     "clanBConfirmedCount" INTEGER,
ADD COLUMN     "detailParticipantCount" INTEGER,
ADD COLUMN     "observationParticipantCount" INTEGER,
ADD COLUMN     "participantCompleteness" TEXT,
ADD COLUMN     "reconstructionConfidence" TEXT;
