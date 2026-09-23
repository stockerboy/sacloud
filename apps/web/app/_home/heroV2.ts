/**
 * ★★홈 히어로를 「코드 배경」으로 갈아끼우는 스위치★★ (2026-09-17 · 사장님 시안)
 *
 * ```
 *   true   ★지금★ — 코드 배경 + `Log_ / in SA CLOUD_` + 터미널 검색창
 *   false  2026-09-16 까지의 히어로 — 큰 로고(`MainLogo`) + 옛 검색창
 * ```
 *
 * ★옛 것을 한 줄도 안 지웠다★ (`CLAUDE.md` 1-4). 이 한 줄을 `false` 로 두면
 * 다음 셋이 전부 옛 모습으로 돌아간다 —
 *
 * ```
 *   apps/web/app/page.tsx            바탕이 `home-code` → `home-night`
 *   apps/web/app/_home/HomeSearch.tsx  `Log_` 제목 → 큰 로고 · 터미널 껍데기 → 옛 껍데기
 *   packages/ui/src/home/SearchBar.tsx `terminal` 을 안 넘기므로 옛 껍데기 그대로
 * ```
 *
 * ⚠ ★사이트 전체 배경(`sac-sky`)은 건드리지 않는다.★ 그건 사장님이 주신 그림이고
 *   스위치도 따로다 (`apps/web/app/layout.tsx` 의 `<body className="… sac-sky">`).
 */
export const HERO_V2: boolean = true

/**
 * ★★구름 홈★★ (2026-09-18 · 사장님이 새 로고를 주시면서)
 *
 * > 「메인홈배경도 깔끔하게 어두운 톤 배경에 이 로고만 올려줘
 * >  그리고 검색창을 다르게 다시 만들고 그 위를 (…) 고양이가 요염하게 걷다가
 * >  저 구름뒤로 쏙 숨어서 저렇게 보는걸로 해줘」
 *
 * ```
 *   true   ★지금★ — 어두운 바탕 + 새 로고 + 고양이 애니메이션 + 구름 검색창
 *                   + 리그 단추 셋(IPL · PL · 열산리그)
 *   false  2026-09-17 의 코드 배경 히어로 (`HERO_V2` 가 정하던 것)
 * ```
 *
 * ⚠ ★`HERO_V2` 보다 이 스위치가 먼저다.★ 이게 켜져 있으면 코드 배경은 안 그려진다.
 *   옛 것은 한 줄도 안 지웠다 (`CLAUDE.md` 1-4) — 이 한 줄만 `false` 로 두면
 *   2026-09-17 의 화면이 그대로 돌아온다.
 */
export const HERO_V3: boolean = true

/**
 * ★홈 히어로 그림★ (2026-09-23 밤 사장님: 「메인페이지 배경으로 이거 쓰자」 → 시안 A 「이걸로 하자」).
 * 사장님이 주신 그림(투구 뒤 병사들 · 파란 안개)을 ★히어로 칸에만★ 깔고 아래로 갈수록 남색으로 녹인다.
 * 파일 `/brand/home-hero.webp`(PC 1680) · `/brand/home-hero-m.webp`(폰 840). 규칙은 `supply-skin.css` 맨 끝.
 * false 면 순검정 히어로 그대로 (`CLAUDE.md` 1-4).
 */
export const HOME_HERO_ART: boolean = true
