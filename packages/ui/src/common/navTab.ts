/**
 * 흰 배경 위 탭 한 칸 (원본 `.nav-item` / `.nav-active`).
 *
 * 리그홈 탭(`리그정보`/`리그소개`)과 프로필 탭(`기록실`/`클랜원`/`지난시즌`)이
 * 원본에서 **같은 클래스**를 쓴다. 두 곳에 따로 적어 두면 한쪽만 고쳐져 갈라지므로
 * 여기 한 곳에 둔다.
 *
 * 2026-08-27 실측 (`getComputedStyle`)
 * - 활성: 글자·아래 테두리 `rgb(99,102,241)` · 테두리 4px · 굵기 700
 * - 비활성: 글자 `rgb(107,114,128)` · 굵기 400
 *
 * 우리는 **검정 3px 밑줄 + 기본 글자색**을 쓰고 있었다 (UI_PARITY_AUDIT 2-5).
 */
export const NAV_TAB = 'flex cursor-pointer items-center justify-center border-b-4 px-4 py-4'
export const NAV_TAB_ACTIVE = 'border-b-tab-underline font-bold text-tab-underline'
export const NAV_TAB_IDLE = 'border-b-transparent text-tab-idle'
