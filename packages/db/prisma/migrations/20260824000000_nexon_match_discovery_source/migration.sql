-- 발견 경로 기록 (D-127). 추가만 하는 마이그레이션이다 — 기존 행은 NULL 로 남는다.
-- NULL = 넥슨 목록에서 발견, '3rd.supply' = 공식리그 스냅샷 seed.
ALTER TABLE "NexonMatch" ADD COLUMN "discoverySource" TEXT;
