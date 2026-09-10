# SACLOUD 디자인 핸드오프 (선수 상세 · 클랜 상세)

## 들어있는 것

    ClanDetailV3.tsx          클랜 상세 페이지 컴포넌트 (단일 파일)
    PlayerDetailV3.tsx        선수 상세 페이지 컴포넌트 (단일 파일)
    CLAN_THEME_GUIDE.md       클랜 배경색 테마 설명서
    PLAYER_DETAIL_GUIDE.md    선수 상세 설명서
    rankColors.ts             색상 규칙 (등수 / 수치) — 두 페이지 공용
    assets/clans/*.png        클랜마크 (igloo-fit.png = 원 크롭본)

## 설치

1. 컴포넌트를 프로젝트로 복사
       ClanDetailV3.tsx   → components/clan/ClanDetailV3.tsx
       PlayerDetailV3.tsx → components/player/PlayerDetailV3.tsx
       rankColors.ts      → lib/rankColors.ts   (두 컴포넌트가 각자 내장하고 있으니, 공용화하려면 이 파일만 남기고 import 로 정리)

2. 마크 이미지를 public 으로 복사
       assets/clans/*.png → public/assets/clans/

   ⚠️ 원본 마크 PNG 는 배지 원 바깥에 5px 정도 어두운 여백이 있습니다.
      원형으로 표시하면 빈 테두리가 보이므로 **원 크롭본**(`igloo-fit.png`)을 쓰세요.
      다른 클랜 마크도 같은 전처리(배경색 거리 임계값으로 bbox 크롭 → 정사각 리사이즈)가 필요합니다.
      표시는 `background-size:100% 100%` + `border-radius:50%` (`cover` 는 테두리가 잘림).

3. 폰트 (layout.tsx)
       Chakra Petch  — 영문·숫자
       Noto Sans KR  — 한글
       수치 굵기는 600 이상

4. 로고 마크
       cloud-mark.png (3rd cloud 로고)는 이 번들에 없습니다.
       프로젝트 기존 에셋을 `public/assets/clans/cloud-mark.png` 로 넣거나 경로를 바꿔주세요.

## 범위

UI 만입니다. **API / DB / Collector / 랭킹·시즌 계산은 만들지 마세요.**
데이터는 각 컴포넌트 안의 Mock 상수와 로컬 state 까지입니다.

## 먼저 읽을 것

- 클랜 상세를 건드린다면 → `CLAN_THEME_GUIDE.md` (배경을 클랜마크 색으로 칠하는 방법 + 레이아웃 함정)
- 선수 상세를 건드린다면 → `PLAYER_DETAIL_GUIDE.md` (특성 6축 / 배지 규칙 / MVP 단일 원천 / 라운드 정합 공식)
