# 클랜 배경색 테마 가이드 (Claude Code 용)

`handoff/ClanDetailV3.tsx` 를 구현할 때 **가장 헷갈리는 부분**만 따로 정리했습니다.
나머지(레이아웃·수치 색상 규칙)는 파일 안 주석에 다 들어 있습니다.

---

## 1. 개념 한 줄 요약

> 클랜 상세 페이지의 배경·엣지·워터마크는 **하드코딩된 파랑이 아니라, 그 클랜의 클랜마크(엠블럼 이미지)에서 뽑은 색**으로 칠한다.

igloo(북극곰 + 빙하)는 얼음 하늘색, veritas(금빛 문양)는 골드. 클랜이 바뀌면 페이지 색조도 바뀝니다.

---

## 2. ClanTheme — 색 4개 + 텍스트색

```ts
type ClanTheme = {
  light: string;  // 마크에서 가장 밝은 색   (igloo #e6f7f7 / veritas #fff0c6)
  main:  string;  // 마크의 대표색           (igloo #81d3ef / veritas #ffd970)
  deep:  string;  // 마크의 짙은 색           (igloo #3cb0d2 / veritas #c99a2e)
  edge:  string;  // 카드 상단 2px 액센트     (main 보다 한 톤 밝게)
  ink:   string;  // 클랜명 텍스트 색
  rgb:   string;  // rgba() 조합용 "r,g,b"
};
```

**색을 얻는 방법 (택1)**

1. **상수 테이블** (현재 방식, 가장 안전)
   클랜별로 위 5개 값을 손으로 정해 둡니다. 42개 클랜이면 42줄.
2. **업로드 시 서버가 추출**
   클랜마크 업로드 시 대표색을 뽑아 DB에 저장 → API 로 내려줌.
   추출 로직 예: 중앙 원 영역만 샘플링 → 채도 상위 픽셀의 중간값을 `main`,
   명도 상위 10%를 `light`, 명도 하위 30%를 `deep`.
   ※ 이 작업은 **이번 UI 범위가 아닙니다.** 지금은 상수로 두세요.

**알파 표기 주의**
파일에서 `${theme.main}29` 처럼 8자리 hex(#RRGGBBAA)를 씁니다. 뒤 2자리가 알파입니다.
`1a`≈10%, `29`≈16%, `3d`≈24%, `42`≈26%, `57`≈34%, `6b`≈42%, `8c`≈55%.

---

## 3. 테마가 적용되는 5곳

| # | 위치 | 컴포넌트 / 스타일 | 무엇을 칠하나 |
|---|---|---|---|
| **A** | 성향 분석 카드 **본문 배경** | `<ClanBackdrop theme mark />` | 위쪽 `light` → 아래쪽 `deep` 그라데이션 2겹 + `clip-path` 능선(빙산) + 마크 워터마크(opacity .13) |
| **B** | 클랜 카드 **상단 엣지** | `borderTop: 2px solid theme.edge` | 카드 최상단 라인 |
| **C** | **SET SCORE 헤더 배경 분할** | 상대전적 섹션 | 좌측 `61.9%` 폭은 우리 테마, 우측 `38.1%` 폭은 상대 테마. 경계에 흰 세로 하이라이트 1px, 양쪽에 각 클랜 마크 워터마크(opacity .15) |
| **D** | **세트 승률 막대** | 같은 섹션 하단 | 좌/우 각각 클랜 테마 그라데이션 + `edge` 상단 라인, 전체 `border-radius:999px; overflow:hidden` |
| **E** | 엠블럼 링 · 클랜명 · 버튼 | 클랜 띠 | `box-shadow: 0 0 0 1px edge, 0 0 20px main`, 클랜명 `color: ink` + `text-shadow: main`, 공식/전적갱신 버튼 보더·배경도 `main` 알파 |

**상대전적 차트(H2HChart)** 도 같은 원칙입니다 — 상대 클랜 선·엔드 마커 링을 `oppTheme` 색으로 칠합니다.
우리 클랜 선은 리그 기본 파랑(#5b8dff)을 씁니다.

---

## 4. 다른 클랜으로 바꾸려면

`ClanDetailV3()` 안에서 세 줄만 바꿉니다.

```tsx
const theme = IGLOO;                          // → 그 클랜의 ClanTheme
const oppTheme = VERITAS;                     // → 상대 클랜의 ClanTheme
const mark = '/assets/clans/igloo-fit.png';   // → 그 클랜 마크 경로
```

실서비스에서는 `theme` 을 props/API 로 받게 만드세요:

```tsx
export default function ClanDetailV3({ theme, oppTheme, mark }: { theme: ClanTheme; oppTheme: ClanTheme; mark: string }) { … }
```

---

## 5. 마크 이미지 주의사항 ⚠️

- 원본 마크 PNG 는 **배지 원 바깥에 어두운 여백**이 있습니다(5px 정도).
  그대로 원형 div 에 넣으면 원 안에 빈 테두리가 보입니다.
- 그래서 배지 원 경계를 잘라낸 `igloo-fit.png` 를 씁니다. 다른 클랜 마크도 같은 전처리가 필요합니다.
  (배경색과 거리 임계값으로 bbox 를 찾아 정사각 크롭 → 리사이즈)
- 원형 표시는 `background-size: 100% 100%` + `border-radius:50%` 로 합니다.
  `cover` 를 쓰면 마크 테두리가 잘립니다.

---

## 6. 함께 지켜야 하는 규칙

- **수치 색상**: `statColor(v)` — 39.9↓ 빨강 / 40~49.9 하양 / 50~54.9 초록 / 55~59.9 갈색 / 60~64.9 파랑 / 65~100 노랑. 래더 점수는 규칙 밖(흰색).
- **등수·닉네임 색상**: `rankColor(rank)` — 1~3위 빨강 / 4~20위 노랑 / 21~40위 파랑 / 41~100위 초록 / 101위~ 하양.
- **ASTRA 는 무조건 영롱하게** — `ASTRA_STYLE`(홀로그램 그라데이션 + 글로우 + 5.5s 시머). **CHALLENGER 는 그보다 약하게** 단색 브론즈(`CHAL_STYLE`).
- **MVP 는 뱃지가 아니라 행 배경**으로 표시(골드 그라데이션 + 좌측 3px 엣지 + MVP 워터마크). 진 팀에는 MVP 를 표시하지 않습니다.
- **SNIPER 워터마크**는 스나이퍼 선수 행 왼쪽(34%), MVP 워터마크는 오른쪽(64%) — 서로 겹치지 않게 고정된 위치입니다.
- **폰트**: Chakra Petch(영문·숫자) + Noto Sans KR(한글). 수치 굵기는 600 이상.
- **라운딩**: 카드 10px / 블록 8px / 버튼·드롭다운 7px / 칩 5px / 공식 배지·승률 막대 999px.

---

## 7. 레이아웃 함정 (실제로 깨졌던 것들)

1. **IPL 로고를 `position:absolute` 로 두지 마세요.** 폭을 차지하지 않아 좌우 텍스트와 겹칩니다.
   클랜 띠는 `display:grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)` 3분할입니다.
2. **육각형 SVG 는 `viewBox`(300×262)와 표시 크기(300px)를 1:1로 유지**하세요.
   축소하면 내부 텍스트도 같이 줄어들어 8px 이하가 됩니다. 그래서 `flex:0 0 300px` 이고,
   폭이 부족하면 카드 본문이 `flex-wrap:wrap` 으로 위아래로 쌓입니다.
3. 카드에 `overflow:hidden`(라운딩용)이 걸려 있으니 **그리드 트랙 합이 컨테이너를 넘으면 잘립니다.**
   축소가 필요한 트랙은 반드시 `minmax(0,…)` + 자식에 `min-width:0`.
4. 엠블럼 나열 스트립은 `flex-wrap:nowrap` + 엠블럼 영역만 `flex:0 1 auto; min-width:0; overflow:hidden`,
   우측 캡션은 `margin-left:auto`.

---

## 8. 파일

| 경로 | 설명 |
|---|---|
| `handoff/ClanDetailV3.tsx` | 클랜 상세 v3 단일 파일 컴포넌트 |
| `assets/clans/*.png` | 클랜마크 (원 크롭된 `igloo-fit.png` 포함) → `public/assets/clans/` 로 복사 |
| `Clan Detail v3.dc.html` | 승인된 디자인 원본(레퍼런스) |

**백엔드 금지**: API / DB / Collector / 랭킹·시즌 계산은 만들지 마세요. Mock 데이터와 로컬 state 까지만입니다.
