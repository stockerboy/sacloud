-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'sacloud';

-- AlterTable
ALTER TABLE "Clan" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'sacloud';

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'sacloud';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'sacloud';
