-- DropIndex
DROP INDEX "User_nickname_key";

-- CreateIndex
CREATE INDEX "User_nickname_idx" ON "User"("nickname");
