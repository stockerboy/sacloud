-- 클랜 단위 **소수싸움** (SITE_SPEC_V2 5-5절 · 원문 `소수싸움:839회중 432회 승리 n%`).
--
-- 우리 생존자가 상대보다 적어진 순간이 있었던 라운드(분모)와 그중 이긴 라운드(분자)다.
-- 선수 축(PlayerRoundProfile.outnumbered · D-194)을 클랜별로 더한 값이 **아니다** —
-- 한 라운드에 우리 편이 둘 남으면 두 번 세어지고, 선수를 **현재 소속**으로 조인해야 해서
-- "경기 당시 소속" 원칙(CLAUDE.md 3-B 4번)에도 어긋난다. 클랜 기준으로 새로 판정한다.
--
-- 이 축만 **진영을 보지 않는다.** 그래서 교대를 못 본 경기에서도 세어지고,
-- 같은 표의 defenseRounds · attackRounds 보다 값이 훨씬 크다. 어긋난 것이 아니다.
--
-- 옛 줄(`clan-round-v1`)에는 0 이 채워지지만 **그 0 은 읽히지 않는다** — 판정이 늘었으므로
-- builderVersion 이 `clan-round-v2` 로 올라갔고, 화면은 새 버전만 읽는다 (D-106).
--
-- **칸만 더한다.** 기존 칸·값은 건드리지 않는다.
-- 여러 번 돌려도 안전하도록 IF NOT EXISTS 다 (forward-only).

ALTER TABLE "ClanRoundProfile"
  ADD COLUMN IF NOT EXISTS "outnumberedRounds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "outnumberedWon"    INTEGER NOT NULL DEFAULT 0;
