-- ★리그 참가 신청★ (2026-09-14 · 사장님)
--
-- 사장님: «참가신청은 IPL SPL 둘중에 하나 가능하고 / 신청방식은 내가 관리자 대시보드에서
--          볼 수 있게 해줘 / 신청양식은 클랜명 / 클랜병영 / 주요멤버 포지별 5명 병영 /
--          숏 이층 비리베 바리베 스나 / ★로그인 회원가입 없이★ 신청할 수 있게»
--          → 뒤에 «열산도 신청 양식에 넣어» 로 리그가 셋이 됐다.
--
-- ★표 하나를 새로 만들 뿐이다.★ 기존 표는 한 칸도 안 건드린다 — DROP 도 ALTER 도 없다.
--
-- 자물쇠는 계정이 아니라 (리그, 클랜명) 이다. 로그인이 없어서 누가 냈는지 모르기 때문이다.
-- 같은 클랜이 또 내면 새 줄을 만들지 않고 그 줄을 고친다 — 신청서는 하나다.

CREATE TABLE IF NOT EXISTS "LeagueApplication" (
  "id"         TEXT NOT NULL,
  "leagueSlug" TEXT NOT NULL,
  "clanName"   TEXT NOT NULL,
  "clanUrl"    TEXT NOT NULL,
  "members"    JSONB NOT NULL,
  "note"       TEXT,
  "status"     INTEGER NOT NULL DEFAULT 0,
  "adminNote"  TEXT,
  "handledAt"  TIMESTAMP(3),
  "handledBy"  TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeagueApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeagueApplication_leagueSlug_clanName_key"
  ON "LeagueApplication" ("leagueSlug", "clanName");
CREATE INDEX IF NOT EXISTS "LeagueApplication_status_createdAt_idx"
  ON "LeagueApplication" ("status", "createdAt");
