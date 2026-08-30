-- 전반 공수를 **경기마다** 담는 칸 (D-207).
--
-- 화면의 `선레드` / `선블루` 는 지금까지 우리 red/blue **슬롯 이름**으로 적혀 있었다.
-- 그런데 그 슬롯은 수집 시 `team_id` 오름차순으로 정한 내부 자리일 뿐이다
-- (`apps/worker/src/lib/projectionRule.ts` 의 `assignSides()` — 문서에도 "의미는 [미확인]").
--
-- 배틀로그 폭탄 근거(D-184)로 전반 공수를 판정해 대조한 결과:
--
--     Match.redClan 이 전반 **수비**였다   3,745 / 3,750 = 99.87%
--     Match.redClan 이 전반 **공격**이었다      5 / 3,750 =  0.13%
--
-- 즉 표기가 사실상 통째로 뒤집혀 있었다.
--
-- **슬롯은 뒤집지 않는다.** `redLeagueClanId` / `blueLeagueClanId` 는 래더·집계·기록
-- 전체가 쓰는 값이라, 배정을 뒤집으면 과거 기록의 의미가 흔들린다.
-- 대신 표기의 근거를 이 칸에 따로 담는다.
--
--   firstHalfAttackSide  "red" | "blue"  — 전반에 레드진영(공격)을 맡은 **슬롯**
--   firstSideEvidence    "barracks_bomb" — 그 판정의 근거
--
-- 둘 다 nullable 이고 **기본값이 없다.** 근거가 없는 경기는 비워 두고,
-- 화면은 아무 라벨도 적지 않는다 (D-106). `team_id` 순서를 후퇴값으로 쓰지 않는다.
--
-- 옛 칸 `blueFirst` 는 **폐기**다 (뜻이 [미확인] 인 채였고 실제 값은 mock 난수뿐).
-- 열은 지우지 않는다 — 과거 행의 값을 없애지 않기 위해서다.
--
-- 칸만 더한다. 여러 번 돌려도 안전하도록 IF NOT EXISTS 다 (forward-only).

ALTER TABLE "Match"
  ADD COLUMN IF NOT EXISTS "firstHalfAttackSide" TEXT,
  ADD COLUMN IF NOT EXISTS "firstSideEvidence"   TEXT;
