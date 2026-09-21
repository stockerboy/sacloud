-- ★「그 클랜의 최근 몇 줄」 을 싸게 뽑는 색인★ (2026-09-21)
--
-- `subject` 색인만으로는 그 클랜의 모든 줄(최대 10,526줄)을 읽어 정렬해야 했다.
-- 그래서 마크를 경기 원문에서 읽는 잡이 매번 시간초과로 죽었고,
-- 죽으니까 우리 DB 를 베낀 도장만 남아 클랜마크가 영영 안 바뀌었다.
--
-- ⚠ 운영에는 2026-09-21 에 CONCURRENTLY 로 이미 만들어 두었다 (85초).
--   그래서 `IF NOT EXISTS` 다 — 다시 만들지 않는다.
CREATE INDEX IF NOT EXISTS "BarracksClanMatchRaw_subject_fetchedAt_idx"
  ON "BarracksClanMatchRaw" ("subject", "fetchedAt" DESC);
