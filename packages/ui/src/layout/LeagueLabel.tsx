/**
 * 리그 이름 라벨 — `10mountain` 뒤에만 작은 산 표시를 붙인다 (2026-09-01 · D-246).
 *
 * ── 왜 이모지가 아니라 인라인 SVG 인가
 *   사용자는 «귀여운 산 이모티콘 붙여도 되고» 라고 했다. 그런데 이모지를
 *   `League.name` 에 넣으면 세 가지가 망가진다.
 *
 *     1. 모양이 기기마다 다르다 — 윈도우 · 안드로이드 · iOS 가 전부 다르게 그린다.
 *        `적진` 토큰은 색이 진홍 하나뿐인데 이모지는 제 색을 들고 온다
 *     2. 정렬과 검색에 걸린다 — `League.name` 은 정렬 키이자 검색 대상이다.
 *        이름 안의 서로게이트 페어가 `ORDER BY` · `LIKE` 결과를 바꾼다
 *     3. 이름이 데이터인지 장식인지 흐려진다 — API 응답 · CSV · 로그에 다 섞여 나온다
 *
 *   그래서 **`League.name` 은 `10mountain` 글자만** 두고, 산은 **화면에서만**
 *   `currentColor` 로 그린 1줄짜리 SVG 로 옆에 붙인다. 데이터는 깨끗하고,
 *   색은 글자를 따라가고, 떼고 싶으면 이 파일 하나만 지우면 된다.
 *
 * ── 왜 라벨 문자열로 판별하나
 *   리그 이름이 오는 길이 두 갈래다 — 코드에 박힌 GNB 라벨과 DB 의 `League.name`.
 *   slug 는 GNB 라벨 쪽에만 있고 DB 이름 쪽에는 없는 자리가 있어서, 두 길 모두에서
 *   쓸 수 있는 판별 기준은 **이름 글자**뿐이다. slug 로 갈라 놓으면 DB 이름을 그대로
 *   찍는 화면에서 산이 사라진다.
 */

/** 산 표시를 붙일 리그의 표시 이름. slug 가 아니다 — 위 주석 참고 */
export const MOUNTAIN_LEAGUE_NAME = '10mountain'

/**
 * 작은 산 표시. `currentColor` 로만 그려서 글자색을 그대로 따라간다.
 * 진홍을 쓰지 않는다 — D-204 가 «진홍을 넓은 면에 칠하지 말라» 고 했고,
 * 이건 강조가 아니라 이름에 붙는 장식이다.
 */
export function MountainMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`inline-block h-[0.85em] w-[0.85em] shrink-0 align-[-0.08em] ${className}`}
      fill="currentColor"
      aria-hidden
    >
      {/* 뒤쪽 작은 봉우리 */}
      <path d="M10.6 5.4 15.4 13H10z" opacity="0.5" />
      {/* 앞쪽 큰 봉우리 — 꼭대기에 눈을 남긴다 */}
      <path d="M5.6 3 11.2 13H0z" />
      <path d="M5.6 3 7.2 5.8 6.3 5.4l-.9.6-.8-.6-.6.3z" opacity="0.45" />
    </svg>
  )
}

export interface LeagueLabelProps {
  /** 리그 표시 이름 (`SPL` · `IPL` · `10mountain` …) */
  name: string
  className?: string
}

/**
 * 리그 이름을 찍는다. `10mountain` 이면 뒤에 산 표시가 따라붙고, 나머지는 글자만 나온다.
 * 이름을 화면에 쓰는 자리라면 어디서든 이걸 쓰면 된다 — 분기가 여기 한 곳에만 있다.
 */
export function LeagueLabel({ name, className = '' }: LeagueLabelProps) {
  if (name !== MOUNTAIN_LEAGUE_NAME) return <>{name}</>
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {name}
      <MountainMark />
    </span>
  )
}
