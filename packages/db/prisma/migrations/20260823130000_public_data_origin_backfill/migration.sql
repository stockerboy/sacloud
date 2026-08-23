-- 공개 데이터 출처 표식 — 백필 + 인덱스 (D-116).
--
-- 컬럼 자체는 `20260823040029_public_data_origin`이 이미 추가했다.
-- 여기서는 **기존 시드 행을 표시**하고 조회용 인덱스를 만든다.
--
-- 판별자: 시드가 만든 행은 **id가 순수 숫자**다. 원본 사이트의 숫자 ID를 흉내낸
-- 결정적 픽스처이기 때문이다 (`packages/mock/src/dataset.ts`).
-- 실제 데이터는 cuid · `NX-` · `SUPPLY-` · `E2E-` 처럼 숫자만으로 이루어지지 않는다.
-- 실측 대조: League 4/5 · Clan 60/68 · Player 920/943 · Board 400/401 이 숫자 ID였고
-- 그 수는 시드 건수와 정확히 일치한다.

UPDATE "League" SET "origin" = 'mock' WHERE "id" ~ '^[0-9]+$';
UPDATE "Clan"   SET "origin" = 'mock' WHERE "id" ~ '^[0-9]+$';
UPDATE "Player" SET "origin" = 'mock' WHERE "id" ~ '^[0-9]+$';
UPDATE "Board"  SET "origin" = 'mock' WHERE "id" ~ '^[0-9]+$';

-- 공개 조회가 항상 origin으로 거르므로 인덱스를 둔다
CREATE INDEX "League_origin_idx" ON "League"("origin");
CREATE INDEX "Clan_origin_idx"   ON "Clan"("origin");
CREATE INDEX "Player_origin_idx" ON "Player"("origin");
CREATE INDEX "Board_origin_createdAt_idx" ON "Board"("origin", "createdAt" DESC);
