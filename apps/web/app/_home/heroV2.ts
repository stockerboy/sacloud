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
