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

/** 사이트가 지금 실제로 하는 일 */
const INTRO: readonly string[] = [
  'SACLOUD 는 서든어택 클랜전 기록을 모아 두는 곳입니다. 리그별 클랜·개인 랭킹, 선수와 클랜의 기록실, 경기 상세, 게시판이 있습니다.',
  '기록은 넥슨이 공개한 API 와 공개된 전적 페이지에서 가져옵니다. 아직 채워지지 않은 값은 지어내지 않고 비워 둡니다.',
]

/** 아직 없는 것 — 있다고 오해하지 않도록 함께 적는다 */
const NOT_YET =
  '아직 없는 것: 본인인증과 계정 소유권 증명, 그리고 경기 로그가 더 쌓여야 나오는 일부 클랜 지표.'

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
  {
    title: '점수 계산 규칙을 공개합니다',
    body: '어떤 값이 어떻게 점수가 되는지 문서로 공개합니다. 규칙을 바꾸면 바뀐 사실과 적용 시점도 함께 남깁니다.',
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

export function SiteIntro() {
  return (
    <div className="mt-10 flex justify-center max-md:mt-4 max-md:px-3">
      <div className="w-board rounded-sm bg-card shadow-card max-md:w-full">
        <div className="border-b-4 border-b-accent px-4 py-2 text-lg font-semibold text-accent">
          사이트 소개
        </div>

        <div className="border-b border-b-divider px-4 py-4 text-meta">
          {INTRO.map((line) => (
            <p key={line} className="mb-2 last:mb-0">
              {line}
            </p>
          ))}
          <p className="mt-3 text-sm">{NOT_YET}</p>
        </div>

        <div className="px-4 py-4">
          <div className="mb-3 font-semibold">관리자 서약서</div>
          <ol className="text-meta">
            {PLEDGES.map((pledge, index) => (
              <li key={pledge.title} className="mb-3 flex last:mb-0">
                <span className="mr-2 shrink-0 text-accent">{index + 1}.</span>
                <span className="min-w-0">
                  {/* 제목과 본문을 줄로 나눈다 — 한 줄로 이으면 어디까지가 약속인지 흐려진다 */}
                  <span className="block font-semibold">{pledge.title}</span>
                  <span className="block text-sm">{pledge.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
