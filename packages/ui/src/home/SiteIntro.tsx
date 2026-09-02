import { BOARD_OPEN } from '../board/boardOpen'

/**
 * 메인 · 사이트 소개 + 관리자 서약서 (`docs/SITE_SPEC_V2.md` 3절).
 *
 * ── 문구는 전부 새로 썼다
 *   원본 3rd.supply 의 소개·약관·안내 문구를 가져오지 않는다 (CLAUDE.md 3장 4번).
 *
 * ── 없는 기능을 있다고 쓰지 않는다
 *   여기 적힌 것은 지금 실제로 화면에 있는 것만이다. 아직 없는 것
 *   (본인인증 · 계정 소유권 증명 · 배틀로그 기반 지표 일부)은 **없다고 적는다.**
 *   과장 금지는 사용자가 못박은 조건이다.
 *
 * ── 서약서 다섯 줄은 사용자가 지정한 항목이다
 *   공개 범위 수집 · 원문 보존 · 계산 규칙 공개 · 순위 무개입 · 광고 없음.
 *   앞의 넷은 `CLAUDE.md` 3-A(마이그레이션 절대 규칙) · 3-B(래더 원칙)에,
 *   광고 없음은 `CLAUDE.md` 4장에 이미 코드 규칙으로 들어가 있다.
 *   **화면의 약속과 코드의 규칙이 같은 문장이어야 한다.**
 */

/**
 * 이름의 뜻 — **사용자가 확정한 값이다** (2026-08-30).
 * `CLOUD` = Connected League Operations & User Data.
 * 우리가 지어낸 풀이가 아니므로 임의로 고치지 않는다.
 */
const NAME_MEANING = 'CLOUD — Connected League Operations & User Data'

/**
 * ══ 2026-09-02 (O-004) — **본문을 사장님이 쓰신 글로 바꿨다** ══
 *
 * 아래 문장들은 **사장님 글이다.** A 가 원문을 절반으로 줄인 판이고 사장님께 보여 드렸다.
 * ★한 글자도 고치지 않는다.★ 말투(반말·단정체)도 사장님 것이다 — 부드럽게 다듬지 마라.
 * 오타가 보여도 혼자 고치지 말고 A 에게 말한다.
 *
 * 이 글에만 있는 것들이라 특히 중요하다 — **시즌 1 이 10월 1일**이라는 것,
 * 시즌 0 이 끝나면 초기화된다는 것, 사이트가 2027-08-31 까지라는 것.
 *
 * <details><summary>옛 소개 (우리가 쓴 글 · 2026-09-02 낮까지)</summary>
 *
 * ```
 * 3rd cloud 는 서든어택 클랜전 기록을 모아 두는 곳입니다. 리그별 클랜·개인 랭킹이 있고,
 * 선수와 클랜의 기록실에서 지나간 경기를 하나씩 펼쳐 볼 수 있습니다.
 * 기록은 넥슨이 공개한 API 와 공개된 전적 페이지에서 가져옵니다.
 * 아직 채워지지 않은 값은 지어내지 않고 비워 둡니다.
 * ```
 * (그 전에는 첫 줄에 «경기 상세, 게시판이 있습니다» 가 있었는데 둘 다 화면에 없어서
 *  O-001 에서 걷어냈다.)
 * </details>
 */

/** 첫 줄 — 왜 만들었나 */
const OPENING = '졸업과제 겸, 내 기록이 보고 싶어서 만들었다.'

/** 시즌 안내 다섯 줄. **여기에 「시즌 1 = 10월 1일」이 있다** */
const SEASON_NOTES: readonly string[] = [
  '베타 시즌(6~9월) 기록이 쌓여 있다',
  '시즌 0 이 끝나면 베타·시즌 0 기록은 초기화된다',
  '영구히 남는 첫 시즌은 시즌 1 — 10월 1일 시작',
  '시즌 0 동안 클랜 정식 등록을 받는다',
  '시즌을 몇 개월 단위로 돌릴지는 투표로 정한다. 의견을 달라',
]

/** 얼마나 운영하나 */
const RUNTIME: readonly string[] = [
  '사이트는 졸업과제 제출일인 2027년 8월 31일까지 운영한다.',
  '그때까지 1년은 성실히 관리하고, 오류를 고치고, 피드백을 빠르게 반영한다.',
  '1년 뒤에도 쓰는 사람이 충분하면 계속한다.',
]

const STANCE_TITLE = '정상적으로 게임할 사람들을 위한 곳이다'

const STANCE: readonly string[] = [
  '핵·어뷰징·작업장·도배·분탕으로 남의 게임 맛 떨어뜨릴 거면 나가라.',
  '3보급창고는 새 콘텐츠가 계속 나오는 영역이 아니다. 넥슨은 인게임 데이터만 보지 않는다 — 어떤 커뮤니티가 살아 있는지도 본다. 그래서 우리가 할 일은 하나다. 아직 우리가 있다는 걸 보여주는 것.',
  '서로 물어뜯어 판을 줄이지 말자. 경쟁은 하되 게임은 같이 살리자. 사람이 늘면 데이터가 쌓이고, 데이터가 쌓이면 목소리가 커진다. 그래야 원하는 콘텐츠가 게임 안에 생긴다.',
  '혼자 3보급창고를 살릴 수는 없다. 기록을 남기고, 경쟁할 이유를 만들고, 아직 이 게임 하는 사람이 있다는 걸 보여주는 자리는 되고 싶다.',
]

/**
 * 게시판 문단 — **`BOARD_OPEN` 이 참일 때만 그린다** (`../board/boardOpen.ts`).
 *
 * 지금은 게시판으로 가는 길이 화면에 없어서 안 그린다. 문단은 **지우지 않는다** —
 * 길이 열리면 스위치 한 줄로 저절로 따라 나온다 (`CLAUDE.md` 1-4).
 */
const BOARD_TITLE = '게시판'

const BOARD_NOTES: readonly string[] = [
  '로그인해야 쓴다. 글에 뜨는 건 소속 클랜과 포지션(스나·라플) 정도다.',
  '싸우든 핵 의심을 하든 막지 않는다. 다만 지속적인 비방·광고·도배·분탕은 엄격히 관리한다. 심하면 그 사람이 속한 클랜 기록을 영구 저장에서 빼고 즉시 삭제한다.',
]

/**
 * 아직 없는 것 — 있다고 오해하지 않도록 함께 적는다.
 * 2026-09-02 (O-001): **게시판**을 여기로 옮겼다. 위 소개에 「있다」고 적혀 있었는데 닫혀 있다.
 */
const NOT_YET =
  '아직 없는 것: 게시판, 본인인증과 계정 소유권 증명, 그리고 경기 로그가 더 쌓여야 나오는 일부 클랜 지표.'

interface Pledge {
  title: string
  body: string
}

const PLEDGES: readonly Pledge[] = [
  {
    title: '공개된 범위에서만 모읍니다',
    body: '공개 API 와 공개 페이지만 읽습니다. 접근 통제·요청 제한·봇 차단을 우회하지 않고, 가져올 수 없는 것은 가져오지 않은 채로 둡니다.',
  },
  {
    title: '받아 온 원문을 보관합니다',
    body: '가져온 응답을 그대로 남겨 둡니다. 화면의 숫자가 이상하면 원문까지 되짚어 확인할 수 있어야 하고, 계산이 틀렸다면 원문에서 다시 만듭니다.',
  },
  /*
   * ⚠ 2026-09-02 — **현재형에서 미래형으로 바꿨다.**
   *   옛 문장 — 제목 「점수 계산 규칙을 공개합니다」 /
   *            본문 「… 문서로 공개합니다. 규칙을 바꾸면 …」
   *   사이트에 그 문서가 **없다.** 규칙을 설명하는 라우트가 하나도 없고
   *   (`app/` 아래에 about·rules 류 없음), 문서는 저장소 안에만 있다.
   *   약속을 지우지는 않는다 — 아직 안 했다는 것만 정확히 적는다.
   */
  {
    title: '점수 계산 규칙을 공개할 예정입니다',
    body: '어떤 값이 어떻게 점수가 되는지 문서로 공개할 예정입니다. 규칙을 바꾸면 바뀐 사실과 적용 시점도 함께 남깁니다.',
  },
  {
    title: '순위에 손대지 않습니다',
    body: '특정 선수나 클랜의 점수를 사람 손으로 올리거나 내리지 않습니다. 잘못 들어온 기록은 규칙에 따라 고치고, 고친 내용을 남깁니다.',
  },
  {
    title: '광고를 넣지 않습니다',
    body: '배너도, 글 사이에 끼우는 광고도 넣지 않습니다.',
  },
]

/**
 * ── 2026-08-30: 자체 디자인(`적진`)
 *   흰 카드 · 남색 머리선 · 그림자를 걷어내고 1px 선과 여백으로만 그린다.
 *   메인의 주인공은 검색과 인기글이므로 이 블록은 **조용하게** 둔다 —
 *   제목만 `--font-display` 이고 본문은 작고 흐린 글씨다.
 */
export function SiteIntro() {
  return (
    <section className="mx-auto w-full max-w-[720px] border-t border-line pt-8">
      <h2 className="mb-4 text-[20px] font-normal leading-none text-[var(--color-text-strong,#f6eded)] font-[family-name:var(--font-display)]">
        사이트 소개
      </h2>

      {/* 이름의 뜻. 소개 첫 줄보다 앞에 둔다 — 사이트 이름부터 설명하는 것이 순서다 */}
      <p className="mb-4 text-[12px] tracking-wider text-[var(--color-faint,#6b5555)]">
        {NAME_MEANING}
      </p>

      <div className="text-[14px] leading-relaxed text-meta">
        <p className="mb-4 text-[var(--color-text,#d6c9c9)]">{OPENING}</p>

        {/* 시즌 안내 — 목록이라 줄머리를 준다. 진홍은 줄머리 점 하나에만 닿는다 */}
        <ul className="mb-4">
          {SEASON_NOTES.map((line) => (
            <li key={line} className="mb-1.5 flex gap-2.5 last:mb-0">
              <span aria-hidden className="mt-[9px] h-[3px] w-[3px] shrink-0 bg-accent" />
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>

        {RUNTIME.map((line) => (
          <p key={line} className="mb-1.5 last:mb-0">
            {line}
          </p>
        ))}

        {/* --- 정상적으로 게임할 사람들을 위한 곳이다 --- */}
        <h3 className="mb-3 mt-8 text-[15px] leading-6 text-[var(--color-text-strong,#f6eded)]">
          {STANCE_TITLE}
        </h3>
        {STANCE.map((line) => (
          <p key={line} className="mb-2.5 last:mb-0">
            {line}
          </p>
        ))}

        {/* --- 게시판 — 길이 열려 있을 때만 (`BOARD_OPEN`) --- */}
        {BOARD_OPEN ? (
          <>
            <h3 className="mb-3 mt-8 text-[15px] leading-6 text-[var(--color-text-strong,#f6eded)]">
              {BOARD_TITLE}
            </h3>
            {BOARD_NOTES.map((line) => (
              <p key={line} className="mb-2.5 last:mb-0">
                {line}
              </p>
            ))}
          </>
        ) : null}

        <p className="mt-6 text-[12px] text-[var(--color-faint,#6b5555)]">{NOT_YET}</p>
      </div>

      <div className="mt-8">
        <div className="mb-4 text-[12px] tracking-widest text-[var(--color-faint,#6b5555)]">
          관리자 서약서
        </div>
        <ol>
          {PLEDGES.map((pledge, index) => (
            <li
              key={pledge.title}
              className="flex gap-3 border-t border-[var(--color-line-soft,#1a1010)] py-3.5"
            >
              <span className="shrink-0 text-[12px] leading-6 text-accent tabular-nums font-[family-name:var(--font-num)]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0">
                {/* 제목과 본문을 줄로 나눈다 — 한 줄로 이으면 어디까지가 약속인지 흐려진다 */}
                <span className="block text-[15px] leading-6 text-[var(--color-text,#d6c9c9)]">
                  {pledge.title}
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-meta">
                  {pledge.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
