-- 연속킬 (육각형 5번 축 · D-260)
--   burstChained         직전 킬과의 간격이 2초 **이하**인 킬 수 (분자)
--   burstKills           라운드와 시각을 아는 그 선수의 총 킬 수 (분모)
--   burstChainedWide     창을 5초로 넓혔을 때의 분자. **지금 화면은 쓰지 않는다**
--   burstKillRounds      그 선수가 킬을 낸 라운드 수      ┐ 「라운드당 2명」 정의로
--   burstMultiKillRounds 그중 2킬 이상을 낸 라운드 수      ┘ 갈아탈 때의 재료
--
-- 뒤 셋은 지금 아무도 읽지 않는다. 그래도 함께 담는 이유는 정의를 바꿀 때
-- **집계를 다시 돌리지 않기 위해서**다 (`ClanRoundProfile` 의 되잡기 창 넷과 같은 뜻).
--
-- 전부 `DEFAULT 0` 인 **더하기만 하는 변경**이라 기존 행을 건드리지 않는다.
-- 옛 행(`round-v2`)은 이 칸들이 0 이고, 화면은 `TRAIT_MIN_BURST_KILLS` 문턱에 걸려
-- 그 축을 `측정중` 으로 그린다 — 0% 로 그리지 않는다 (D-106).
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "burstChained" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "burstKills" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "burstChainedWide" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "burstKillRounds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerRoundProfile" ADD COLUMN "burstMultiKillRounds" INTEGER NOT NULL DEFAULT 0;
