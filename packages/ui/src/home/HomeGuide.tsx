/**
 * 메인 · 사용법 (O-001 · 2026-09-02).
 *
 * ── 왜 생겼나
 *   홈에서 랭킹 미리보기와 최근 경기를 뺐다. 그 자리에 **검색창을 어떻게 쓰는지**를 넣는다.
 *
 *   ⚠ ★여기 적혀 있던 「동시 5명이 한계」는 사실이 아니었다★ (2026-09-03 정정 · 규칙 15).
 *     그건 `vercel.app` preview 를 잰 숫자다. **운영에서는 동시 30명까지 오류 0%** 였다
 *     (`docs/STATE.md` 「부하 실측」 · `app/page.tsx` 머리주석에 자세히 적었다).
 *     ★O-001 을 한 것 자체는 맞다. 급한 정도를 부풀렸을 뿐이다.★
 *   처음 온 사람은 큰 검색창 하나만 보면 무엇을 쳐야 할지 모른다.
 *
 * ── 여기 적힌 다섯 줄은 전부 **지금 실제로 되는 동작**이다
 *   `app/_home/HomeSearch.tsx` 의 `handleSearch` 와 `LEAGUE_SHORTCUTS`,
 *   `packages/ui/src/league/LeagueSubNav.tsx` 의 탭을 읽고 적었다.
 *   없는 기능을 안내에 쓰지 않는다 (`CLAUDE.md` 2-1).
 *   화면이 바뀌면 **이 문장부터 고친다.**
 *
 * ── 조용하게 둔다
 *   주인공은 검색창이다. 제목만 `--font-display` 이고 본문은 작고 흐린 글씨다.
 *   진홍(`--color-accent`)은 줄머리 번호에만 닿는다 — 넓은 면에 칠하지 않는다 (D-204).
 */

import { FoldCard } from './FoldCard'

/** 한 줄에 「무엇을 하면」 · 「무엇이 되는지」 */
interface Step {
  what: string
  then: string
}

const STEPS: readonly Step[] = [
  {
    what: '검색창에 닉네임을 칩니다',
    then: '그 선수의 기록실로 갑니다. 병영수첩 주소나 계정 번호를 붙여 넣어도 됩니다.',
  },
  {
    what: '검색 종류를 클랜으로 바꾸고 클랜 이름을 칩니다',
    then: '그 클랜의 기록실로 갑니다.',
  },
  {
    what: '위의 리그 버튼을 누릅니다',
    then: 'SPL · IPL · 10mountain — 누르면 그 리그의 개인랭킹으로 바로 갑니다.',
  },
  {
    what: '리그 화면 안에서 클랜랭킹과 개인랭킹을 오갑니다',
    then: '같은 리그의 두 순위를 탭으로 넘나듭니다.',
  },
  {
    what: '못 찾으면 검색창 아래에 한 줄이 뜹니다',
    then: '아직 기록이 없는 것인지, 오타인지, 서버가 답을 못 준 것인지를 나눠서 말해 줍니다.',
  },
]

/** 접혀 있을 때 보이는 한 줄. **우리가 쓴 줄**이다 (O-041 ②) */
const SUMMARY = '닉네임으로 찾기, 클랜으로 찾기, 리그 순위 보기 — 다섯 단계.'

export function HomeGuide() {
  return (
    /* 2026-09-03 (O-041 ②) — 소개와 같이 접는다. 5단계 글은 그대로다 */
    <FoldCard title="사용법" summary={SUMMARY}>
      <ol>
        {STEPS.map((step, index) => (
          <li
            key={step.what}
            className="flex gap-3 border-t border-[var(--color-line-soft,#1a1010)] py-3.5 first:border-t-0 first:pt-0"
          >
            <span className="shrink-0 text-[12px] leading-6 text-accent tabular-nums font-[family-name:var(--font-num)]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] leading-6 text-[var(--color-text,#d6c9c9)]">
                {step.what}
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-meta">{step.then}</span>
            </span>
          </li>
        ))}
      </ol>
    </FoldCard>
  )
}
