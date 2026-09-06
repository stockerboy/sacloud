-- ★옛 실행이 새 결과를 덮지 못하게 한다★ (2026-09-06 · Part 9 · 사장님 승인)
--
--   Part 8 에서 실제로 났다 — 내 커밋보다 먼저 시작한 GitHub Actions 회차가
--   나중에 끝나면서 옛 코드의 결과로 새 결과를 덮었다 (열산 389 → 445).
--   쓰기 직전에 이 값을 보고, 내 시작시각보다 뒤면 쓰지 않는다.
--
-- ⚠ 수집기 임대(barracks-collect)는 이 칸을 쓰지 않는다. NULL 로 남고 동작이 안 바뀐다.
ALTER TABLE "CollectorLease" ADD COLUMN IF NOT EXISTS "lastAppliedStartedAt" TIMESTAMPTZ(3);
