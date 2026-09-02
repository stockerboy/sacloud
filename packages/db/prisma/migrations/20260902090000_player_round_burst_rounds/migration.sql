-- 연속킬 분모를 **사용자가 고른 (c) 로** 바꾼다 (육각형 5번 축 · D-260 후속 · 2026-09-02)
--
-- 사용자가 후보 셋 중 (c) 를 골랐다:
--   (a) 전체 킬 중 몇 %가 연속킬이었나          ← 첫 판(`20260902000000_player_round_burst`)
--   (b) 라운드당 연속킬 횟수
--   (c) 연속킬을 한 번이라도 낸 라운드 비율      ← ★확정★
--
-- (c) 를 만들려면 「연쇄가 한 번이라도 있었던 라운드 수」가 필요한데 그 칸이 없었다.
-- `burstMultiKillRounds` 는 **시간과 무관하게** 2킬 이상인 라운드라 다른 지표다 —
-- 두 값의 순위상관이 0.419 로 실측됐다. 대신 쓸 수 없어 칸을 새로 만든다.
--
--   burstRounds      그 라운드에 2초 이하 연쇄가 한 번이라도 있었던 라운드 수 (새 분자)
--                    ⚠ 한 라운드에 연쇄가 여러 번이어도 **1 만 오른다**
--   burstRoundsWide  같은 값을 5초 창으로 본 것. 지금은 안 쓴다 — 창을 바꿔도 재집계가 없게
--
-- 분모는 이미 있는 `burstKillRounds` 를 쓴다.
--
-- ⚠ 옛 해석 (a) 의 칸(`burstChained` · `burstKills`)은 **그대로 둔다.**
--    되돌아갈 때 재집계가 필요 없어야 한다 (`CLAUDE.md` 10-4).
--
-- 둘 다 `DEFAULT 0` 인 **더하기만 하는 변경**이라 기존 행을 건드리지 않는다.
-- 옛 행은 이 칸이 0 이고, 화면은 표본 문턱에 걸려 그 축을 `측정중` 으로 그린다 —
-- 0% 로 그리지 않는다 (D-106).
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "burstRounds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "burstRoundsWide" INTEGER NOT NULL DEFAULT 0;

-- 되돌리기
--   ALTER TABLE "PlayerRoundProfile" DROP COLUMN "burstRounds", DROP COLUMN "burstRoundsWide";
