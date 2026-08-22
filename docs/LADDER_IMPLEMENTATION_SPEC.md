# LADDER_IMPLEMENTATION_SPEC.md — 래더 계산 구현 사양

Phase 9(레이팅·배치고사·시즌·랭킹) 착수 시 **이 문서를 먼저 읽고 그대로 적용한다.**

여기 적힌 값은 3rd.supply 역추적 조사 결과이며, **확정 / 유력 / 미확인** 을 반드시 구분한다.
미확인 항목을 임의로 확정하지 않는다 (`CLAUDE.md` 3장 7번).

- 최종 갱신: 2026-08-21 (사용자 제공 요구사항 반영)
- 관련 문서: `docs/IMPLEMENTATION_PLAN_1.md` Phase 9 · `docs/MIGRATION_GAPS.md`

---

## 0. 절대 원칙

1. **공식은 하나만 존재한다.** 스나이퍼용·라이플용 공식을 따로 만들지 않는다.
2. **weapon은 `rating_update` 계산에 영향을 주지 않는다.** 계산된 값을 무기별로 **기록만 분리**한다.
3. **kill / death / assist / MVP / damage / headshot / dropout / 연승·연패는 공식에 넣지 않는다.**
4. **래더 계산에 현재 division을 쓰지 않는다.** 반드시 **경기 당시 division 스냅샷**을 쓴다.
5. **과거(3rd.supply) 경기의 `rating_update`를 새 공식으로 재계산하지 않는다.** 원본값을 그대로 보존한다.
6. 상수를 코드에 하드코딩하지 않는다. `RatingConfig`로 분리해 설정만 바꿔도 되게 한다.

---

## 1. 공통 공식 구조

```
D  = 3400                      기대승률 분모 (expectedScoreDivisor)
Kw(R) = 36.6 - R / 200         승리 시 K
R  = 본인의 경기 직전 "통합" 개인 래더
Ro = 상대 팀 선수들의 경기 직전 "통합" 개인 래더 평균
```

- 공식 입력 `R`은 **항상 통합 래더**다. 무기별 래더를 입력으로 쓰지 않는다.
- **배치고사(placement) 경기의 `rating_update` = 0.**

---

## 2. division 조합별 설정

교차 division 보정은 **비대칭**이다. **div1 측만 감쇠되고 div2 측은 감쇠되지 않는다.**

| # | 상황 | `K_lose` | win multiplier |
|---|---|---|---|
| 1 | div1 vs div1 | 24 | 1.15 |
| 2 | div2 vs div2 | 30 | 1.00 |
| 3 | **div1 측**이 div2를 상대 | 24 × 0.6 | 1.15 × 0.6 |
| 4 | **div2 측**이 div1을 상대 | 30 | 1.00 |

---

## 3. 아직 미확인 — 임의로 확정하지 말 것

- **0.6의 정확한 내부 적용 위치** (K에 곱하는지, 최종 증감에 곱하는지, 양쪽 모두인지)
- 일부 과거 2v1 경기의 **division 데이터 오염** 문제
- **배치고사 종료 후 초기 래더** 정확 공식
- **시즌 전환 시 래더 처리 규칙** (이월 / 소프트 리셋 / 초기화 여부)
- 정확한 rounding 방식 (§6의 2단계 반올림 구조는 관측이지만 내부 순서는 미확정)

---

## 4. 경기 시점 division 스냅샷 — 필수

승격·강등 이후 과거 경기를 재계산하면 데이터가 오염된다. 각 경기에 **당시 division을 저장**한다.

```
player_division_at_match
opponent_division_at_match
```

---

## 5. 경기별로 저장할 계산 정보

재현성을 위해 최소 아래를 경기(참가자)별로 저장한다.

**필수**

```
rating_before
rating_update
rating_after
player_division_at_match
opponent_division_at_match
opponent_avg_rating
formula_version
```

**가능하면 추가**

```
k_used
multiplier_used
is_placement
weapon
dropout
```

래더 공식이 나중에 보정되어도 **당시 계산 결과를 재현할 수 있어야 한다.**

---

## 6. 무기별 분리 규칙

```
rating_update = f(R, Ro, division 조합)      ← weapon 무관, 공식 하나

weapon = sniper → sniper_rating_delta += rating_update
weapon = rifle  → rifle_rating_delta  += rating_update

통합 래더 = base_rating + sniper_rating_delta + rifle_rating_delta
```

**무기 분리가 통합 래더 값을 바꾸면 안 된다.**

화면 표기 — 통합 kill/death·통합 KD는 굳이 표시하지 않고 무기별로 각각 보여준다.
무기별 최소 표시 항목: `kills` `deaths` `KD%` `wins` `losses` `win%` `rating delta` `weapon rank`.

---

## 7. 구현 구조 — RatingConfig

```ts
interface RatingConfig {
  expectedScoreDivisor: number      // D = 3400
  loseK: number                     // div1: 24 / div2: 30
  winMultiplier: number             // div1: 1.15 / div2: 1.00
  crossDivisionMultiplier: number   // div1이 div2 상대일 때 0.6 (div2 측은 1.0)
  formulaVersion: string
}
```

리그·디비전 단위로 설정을 조회할 수 있어야 하며, 조사 결과가 갱신되면 **설정값만 바꾼다.**

---

## 8. 검증 — regression test 필수

코드 작성으로 끝내지 않는다. 역추적 조사 결과를 테스트로 고정한다.

**최소 검증 항목**

- `placement` → `rating_update === 0`
- div1 vs div1 동급 패배 → 약 **-12**
- div2 vs div2 동급 패배 → 약 **-15**
- div1 vs div2에서 **div1 측** → 약 **-7**
- div1 승리에서 **+11, +19가 나오지 않는** 2단계 반올림 구조
- weapon을 바꿔도 `rating_update`가 변하지 않음
- 같은 경기에서도 개인 래더가 다르면 서로 다른 `rating_update`가 나올 수 있음
- `sniper_rating_delta + rifle_rating_delta + base_rating === 통합 rating`

가능하면 **실제 3rd.supply historical sample을 픽스처로 저장**해 예측값과 실제 `rating_update`를
자동 비교하는 calibration harness를 만든다.

---

## 9. 과거 / 신규 분리

```
과거 경기 (3rd.supply 시즌 1~7)
  → 원본 rating_update 그대로 보존. 재계산 금지.

SACLOUD 신규 경기 (시즌 8~)
  → 이 문서의 공식으로 계산. formula_version 기록.
```

---

## 10. Checkpoint 규칙

래더·시즌 Checkpoint에 도달하면 **production 시즌 종료나 실제 시즌 변경을 수행하지 않는다.**
개발 환경에서 시뮬레이션한 검증 결과를 보고하고 **사용자 승인을 기다린다.**

---

## 11. 프로토타입 조사 결과 (2026-08-22)

§1·§2 구조를 그대로 계산하면 §8의 관측 앵커가 **전부 재현된다** (-12 / -15 / -7 / +11·+19 없음).
§3의 미확인 항목 중 **`0.6`의 적용 위치**는 세 해석 중 하나가 탈락하고 둘이 남았다.

- 결과·시뮬레이션·악용 분석: **`docs/LADDER_PROTOTYPE_REPORT.md`**
- 프로토타입 코드: `apps/worker/src/lab/` (**운영 코드 아님**)
- 회귀 테스트: `apps/worker/src/__tests__/ladderLab.test.ts`

**이 문서의 확정값은 바뀌지 않았다.** 조사 결과는 보고용이며,
공식 확정과 production 적용은 §10에 따라 **사용자 승인 사항**이다.

---

## 12. ⚠️ 이 문서의 일부는 **더 이상 적용되지 않는다** (2026-08-22)

사용자가 Phase 9 정책을 확정하면서, **원본 재현보다 새 SACLOUD의 래더 품질을 우선**하기로 했다.
아래 항목은 `docs/DECISIONS.md` D-057 ~ D-068이 **대체한다.**

| 이 문서의 내용 | 현재 상태 |
|---|---|
| §2 division 조합별 K·배수 (24/30 · 1.15/1.00 · 교차 0.6) | **폐기.** division을 공식에 넣지 않는다 (D-059) |
| §1 `D = 3400` | **800으로 변경** (D-060). 3400은 양학이 끝없이 이득이 된다 |
| §1 승리 배수 1.15 | **1.0으로 변경** (D-060). 경기마다 점수가 주입된다 |
| §3 "0.6의 적용 위치 미확인" | 보정 자체를 쓰지 않아 **차이가 나타나지 않는다**. `formulaVersion`으로만 남긴다 (D-058) |
| §8 회귀 항목(-12 / -15 / -7) | **과거 공식의 검증값**이다. 새 공식에는 적용하지 않는다 |

**여전히 유효한 것**

- §0-1 공식은 하나다 · §0-2 weapon은 계산에 영향을 주지 않는다
- §0-4 경기 시점 스냅샷을 쓴다 · §0-5 과거 기록을 재계산하지 않는다 · §0-6 상수를 설정으로 분리한다
- §5 경기별 계산 정보 저장 · §9 과거/신규 분리 · §10 Checkpoint 규칙

### 2026-08-22 audit에서 추가로 바뀐 것

| 항목 | 현재 |
|---|---|
| 시즌 전환 | **soft reset 폐기.** 새 시즌은 개인·클랜 전원 1500에서 시작 (D-064 개정) |
| 시즌 귀속 | **실제 경기 시각(`startAt`)** 기준. 수집 시각이 아니다 (D-078) |
| 시즌 전환 시점 | 운영자 액션으로만. 날짜로 자동 전환하지 않는다 (D-077) |
| 공식전 인정 | 양 팀 **본클랜원** 3명 이상. 용병은 못 채운다 (D-071) |
| 용병 | 개인 기록·개인 래더를 **정상적으로 받는다.** 원소속 클랜 래더는 불변 (D-073 · D-075) |
| 반복 대전 감쇠 | **기본값 꺼짐.** 멸망전을 벌하지 않는다 (D-070) |

### 2026-08-22 정책 동기화에서 또 바뀐 것 (최신)

| 항목 | 현재 |
|---|---|
| 공식 경기 인정 | **한쪽이라도** 본클랜원 3명 (OR). 양쪽 모두 요구하던 기준 폐기 (D-079) |
| 미달 경기 | **삭제하지 않는다.** 참고 기록으로 남기고 공식 통계에서만 뺀다 (D-080) |
| 클랜 래더 | 팀별 반영률 3명↑ 100% · 2명 70% · 1명 40% · 0명 0% (D-081) |
| 개인 래더 | 용병 포함 **전원 100%**. 차등 없음 (D-082) |
| 시즌 종료 | 최종 랭킹 스냅샷을 굳힌 뒤 점수 초기화 (D-085) |
| 승강 | 시즌 시작 시점에만. 1부 최하위 ↔ 2부 최상위 (D-086) |

현재 공식과 상수: `packages/rating/` · `docs/LADDER_TUNING_REPORT.md`
