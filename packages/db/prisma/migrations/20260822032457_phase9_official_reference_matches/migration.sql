-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "official" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "NexonMatch" ADD COLUMN     "official" BOOLEAN NOT NULL DEFAULT true;
