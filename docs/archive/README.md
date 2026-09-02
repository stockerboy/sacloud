# archive — 지난 기록

**여기 있는 문서는 지우지 않았다. 다만 「지금 사실」이 아니다.**

2026-09-02 저녁, `docs/` 가 43개 · 2.5MB 였다. 새 세션이 읽으면 그것만으로
머리가 절반 찼고, 인계 문서가 5개라 어느 게 최신인지 파일명으로 알 수 없었다.
하나는 첫 줄이 「밤 문서의 정정」으로 시작한다 — 새로 온 사람은 **틀린 것부터** 읽었다.

그래서 **지금 쓰는 13개만 `docs/` 에 남기고 30개를 여기로 옮겼다.**

```
지금 읽을 것은 docs/STATE.md 하나다. 여기 있는 것과 어긋나면 STATE.md 가 이긴다.
```

---

## 왜 옮겼나 — 묶음별로

### 인계 기록 5개 + 야간 보고 2개
`HANDOFF_CURRENT` `HANDOFF_2026-09-01` `HANDOFF_2026-09-01_NIGHT`
`HANDOFF_2026-09-02` `HANDOFF_2026-09-02_EVENING` `NIGHT_REPORT_20260901`
`RENDER_AUDIT_20260901`

**`docs/STATE.md` 한 장이 이 일곱을 대신한다.** 그날의 사정을 알고 싶을 때만 연다.

### 이관 관련 4개 — **일 자체가 없어졌다**
`LEGACY_MIGRATION` `MIGRATION_GAPS` `SUPPLY_SNAPSHOT_IMPORT_AUDIT`
`SIDE_CLAN_MISMATCH_AUDIT`

2026-09-02 에 **세 리그 다 0부터** 가기로 정했다. 과거 기록을 옮기는 일이
통째로 사라졌다. 배틀로그 22,977건 수집도 같이 없어졌다.

### 화면 5개 밖으로 나간 기능 5개
`EGG_SYSTEM_SPEC` `GACHA_SHOP_SPEC` `CLAN_HEXAGON_V2_SPEC`
`TITLE_VERIFICATION_SPEC` `TIER_WEAPON_STATS_SPEC`

기능을 **지운 게 아니라 숨겼다.** 공개 뒤 데이터가 쌓이면 다시 꺼낸다.
그때 이 문서들이 그대로 있어야 한다 (`CLAUDE.md` 10-4).

### 결론 나기 전의 검토본 6개
`RATING_SIMULATION` `RATING_DESIGN_VERDICT` `RATING_TIMELINE` `RATING_D145_PROPOSAL`
`LADDER_TUNING_REPORT` `LADDER_PROTOTYPE_REPORT`

여기서 결론이 나왔고, 그 결론은 `docs/RATING_FINAL_SPEC.md` 와
`docs/LADDER_IMPLEMENTATION_SPEC.md` 에 있다. **확정본만 `docs/` 에 남겼다.**
「왜 그 값이 됐나」가 궁금할 때만 이쪽을 연다.

### 재현 시절 문서 3개
`3rd-supply-structure` `UI_PARITY_AUDIT` `IMPLEMENTATION_PLAN_1`

`3rd.supply` 를 그대로 따라 만들던 때의 기준 문서다. 2026-08-30(D-204)에
재현을 그만뒀고, 지금은 **대체**가 목표다. 원본과 나란히 비교하는 절차는 끝났다.

### 일 목록 · 체제 문서 3개
`TASK_LEDGER` `WORKLOG` `TEAM_PIPELINE` `POST_V1_REQUIREMENTS` `SITE_SPEC_V2`

`TASK_LEDGER` 는 78KB 인데 체크박스가 **0개**라 「몇 건 중 몇 건 끝」을 셀 수 없었다.
`TEAM_PIPELINE` 의 총괄팀/제작팀 체제는 2026-09-02 저녁에 **A(기획)/B(실행)** 로 바뀌었다.
지금 일 목록은 `docs/ORDERS.md` 하나다.

### 세션 기록
`session-ledger/`

---

## 다시 꺼내는 법

```
git mv docs/archive/파일.md docs/
```

옮겼을 뿐이라 내용은 한 글자도 안 바뀌었다. git 이력에도 전부 남아 있다.
