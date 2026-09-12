import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/**
 * ★이용방법★ — 사이트 소개 · 운영 원칙 · 랭킹 규칙 · 로그 분석 방식 (2026-09-12 사장님)
 *
 * > «이거 전부 다듬어서 이용방법 카테고리 만들어서 넣어줘
 * >  그리고 사이트 소개글은 위쪽에 상단바에 이용방법을 게시판 옆에 만들어줘»
 *
 * ── 글은 ★사장님이 쓰신 것★ 이다
 *   문장을 다듬고 순서를 잡았을 뿐 뜻을 바꾸지 않았다. 없는 약속을 만들지 않는다.
 *
 * ── 「경기 로그 분석」 절만 내가 채웠다
 *   사장님이 «자세하고 멋있게 써줘» 하셨다. 적힌 숫자는 ★2026-09-12 실측★ 이다 —
 *   집계 잡 로그와 운영 DB 에서 그날 직접 센 값이고 지어낸 것이 없다.
 *   숫자가 늙으면 고쳐야 한다. 그래서 「기준일」을 같이 적는다.
 *
 * ── 리그 참가 신청 · SPL→IPL 전환 안내는 ★여기 없다★
 *   사장님 지시로 SPL 클랜랭킹 자리에 붙였다 («이 내용은 SPL 클랜랭킹파트에»).
 */
export const metadata: Metadata = { title: '이용방법 - 3rd cloud' }

/** 실측 기준일 — 아래 숫자들을 센 날 */
const MEASURED_ON = '2026-09-12'

interface Block {
  kind: 'p' | 'li' | 'note' | 'code'
  text: string
}
interface Section {
  id: string
  title: string
  lead?: string
  blocks: readonly Block[]
}

const p = (text: string): Block => ({ kind: 'p', text })
const li = (text: string): Block => ({ kind: 'li', text })
const note = (text: string): Block => ({ kind: 'note', text })
const code = (text: string): Block => ({ kind: 'code', text })

const SECTIONS: readonly Section[] = [
  {
    id: 'intro',
    title: 'SA CLOUD 소개',
    lead: '안녕하세요. SA CLOUD(통칭 싸클) 제작자이자 관리자입니다.',
    blocks: [
      p(
        '개인 프로젝트이자 관리자의 졸업과제로 시작한 사이트입니다. 부족한 부분이 있을 수 있습니다. 이용하시면서 불편한 점이나 개선할 점이 있다면 자유롭게 피드백해 주세요. 확인 후 가능한 부분은 빠르게 반영하겠습니다.',
      ),
      p('SA CLOUD의 대부분의 콘텐츠는 별도의 제한 없이 자유롭게 이용할 수 있습니다.'),
    ],
  },
  {
    id: 'signup',
    title: '회원가입',
    lead: '아이디 · 비밀번호 · 병영수첩 주소 세 가지면 끝납니다.',
    blocks: [
      p(
        '가입하기를 누르면 SA CLOUD가 칭호 하나를 알려 드립니다. 서든어택 인게임에서 칭호를 그것으로 바꾸면 계정 인증과 회원가입이 동시에 끝납니다.',
      ),
      note('별도의 본인확인 절차나 외부 인증이 없습니다. 칭호 하나가 곧 본인 확인입니다.'),
    ],
  },
  {
    id: 'community',
    title: '커뮤니티 이용 안내',
    blocks: [
      p('게시판은 회원가입을 완료한 회원만 이용할 수 있습니다.'),
      p('모든 게시글은 익명으로 작성할 수 있지만 작성자의 소속 클랜은 함께 표시됩니다.'),
      code('윤x선 진짜 잘생긴 듯\n— veritas 익명1'),
      p(
        '자유로운 의견 교환과 소통을 지향합니다. 서로 논쟁하거나 싸우는 것까지 운영자가 과도하게 개입하지 않겠습니다.',
      ),
      p('다만 커뮤니티의 정상적인 이용을 방해하는 다음 행위는 제한됩니다.'),
      li('무분별한 도배'),
      li('타인의 사진을 허락 없이 업로드하는 행위'),
      li('내용 없는 순수 비방글'),
      li('패드립 · 섹드립 등 수위가 지나치게 높은 욕설'),
      li('SP 업체 등 광고 및 홍보성 게시물'),
      p('해당 행위가 확인될 경우 게시판 이용이 제한될 수 있습니다.'),
      note(
        '관리자가 익명 게시글의 작성자를 임의로 확인하거나 추적하지 않는 것을 원칙으로 합니다. 게시판 이용 제한에 필요한 기록은 시스템이 자동으로 처리하도록 설계할 예정입니다. 실제 개인정보 및 로그 처리 방식은 별도의 개인정보처리방침을 통해 안내하겠습니다.',
      ),
    ],
  },
  {
    id: 'season',
    title: '시즌 안내',
    blocks: [
      p('CLOUD 0 — 테스트 시즌'),
      li('정식 시즌 이전의 테스트 시즌입니다.'),
      li('CLOUD 1 시작과 동시에 CLOUD 0의 시즌 기록은 초기화됩니다.'),
      p('CLOUD 1 — 정식 시즌'),
      li('2026년 10월 1일 시작 예정입니다.'),
      li('CLOUD 1부터 생성되는 시즌 기록은 영구 보관하는 것을 원칙으로 합니다.'),
      li('시즌 기간은 이용자 여러분의 의견을 받아 결정하겠습니다. 1개월(4주) / 3개월 / 4개월 / 6개월 / 1년'),
      note('공지사항에서 로그인 없이 참여할 수 있는 익명 투표를 진행할 예정입니다.'),
    ],
  },
  {
    id: 'period',
    title: '운영 기간',
    lead: '2026.09.03 ~ 2027.08.21',
    blocks: [
      p('우선 관리자의 졸업 시점까지 운영하는 것을 기준으로 잡았습니다.'),
      p('사이트를 계속 이용해 주시는 분들이 있고 커뮤니티가 유지된다면 운영 기간을 연장할 생각입니다.'),
      note('운영 기간 변경 및 연장 여부는 추후 별도로 공지하겠습니다.'),
    ],
  },
  {
    id: 'ranking',
    title: '랭킹 시스템',
    blocks: [
      p('1. 승강제'),
      li('Astra 구간과 Challenger 1 구간에는 승강제가 적용됩니다.'),
      li('정해진 주기마다 상위 1·2위 클랜과 하위 2개 클랜을 기준으로 승격 및 강등이 이루어집니다.'),
      p('2. 미참여 감점'),
      li(
        '랭킹 상위권을 확보한 뒤 경기에 참여하지 않는 이른바 「랭킹 주차」를 방지하기 위해 미참여 감점을 적용합니다.',
      ),
      li('점수를 확보하고 멈추는 것보다, 계속 뛰는 클랜이 제대로 평가받는 랭킹을 만드는 것이 목적입니다.'),
      p('3. 열산 패널티'),
      li('활발한 일퀵 및 팀게임 문화를 만들기 위해 열산 경기를 자동 감지합니다.'),
      li('열산으로 분류된 경기는 원래 점수의 10%만 랭킹에 반영합니다.'),
      note(
        '판정 기준은 양 팀 클랜원 수의 합입니다. 두 팀을 합쳐 클랜원이 5명 미만인 판을 열산으로 봅니다. IPL에만 적용되며 클랜 점수와 개인 점수 모두에 걸립니다.',
      ),
      p('4. 설박튀 기록'),
      li(
        '설치 이후 상대가 이탈해 정상적인 경기 기록이 남지 않는 이른바 「설박튀」를 별도로 처리했습니다. 기존 시스템에서 기록되지 않던 상황을 잡아 관련 분쟁을 줄이겠습니다.',
      ),
    ],
  },
  {
    id: 'cheat',
    title: '불법 프로그램 사용 제재',
    blocks: [
      p(
        '2026년 10월 1일 이후 불법 프로그램 사용이 공식적으로 확인된 이용자는 SA CLOUD에서 기록 열람 등의 기능이 제한될 수 있습니다.',
      ),
      p('구체적인 판정 기준과 제재 범위는 별도 운영정책을 통해 공개하겠습니다.'),
      note('클린한 게임 환경을 함께 만들어 주세요.'),
    ],
  },
]

/* ────────────────────────────────────────────────────────────────────────────
   경기 로그 분석 — 사장님이 «자세하고 멋있게» 라고 하신 절.
   숫자는 전부 2026-09-12 실측이다.
   ──────────────────────────────────────────────────────────────────────────── */

interface PipelineStep {
  no: string
  title: string
  detail: string
  facts: readonly string[]
}

const PIPELINE: readonly PipelineStep[] = [
  {
    no: '01',
    title: '수집',
    detail:
      '넥슨이 공개하는 병영수첩을 10분마다 훑습니다. 새 경기만 골라 담고, 이미 담은 판은 건드리지 않습니다.',
    facts: ['수집 주기 10분', '시즌 Cloud 0 누적 3,492경기', '중복 방지 — 경기 하나에 행 하나'],
  },
  {
    no: '02',
    title: '판별',
    detail:
      '클랜전인지, 퀵인지, 설치 후 이탈인지를 가릅니다. 승자를 못 정하는 판은 승패를 지어내지 않고 「알수없음」으로 둡니다.',
    facts: ['승자 미확정 판은 래더에 넣지 않음', '설박튀는 별도 표시'],
  },
  {
    no: '03',
    title: '리그 분류',
    detail:
      '양 팀의 등록 상태를 보고 IPL · SPL · 열산으로 나눕니다. 클랜은 한 리그에만 속합니다. 다른 리그에 합류하면 이전 리그 목록에서 빠지되 경기 기록은 그대로 남습니다.',
    facts: ['클랜은 한 리그에만', '기록은 지우지 않고 목록에서만 감춤'],
  },
  {
    no: '04',
    title: '배틀로그 해부',
    detail:
      '경기 한 판의 킬 이벤트를 한 줄씩 읽어 라운드·시각·무기·위치로 되살립니다. 위치는 맵을 나눈 구역표에 맞춰 「죽은 사람이 서 있던 칸」으로 셉니다. 잡은 사람 기준으로 세면 저격 대결이 통째로 사라집니다.',
    facts: ['구역 9곳 · 268칸', '기준은 죽은 사람의 위치', '라운드 단위로 되살림'],
  },
  {
    no: '05',
    title: '여섯 축 계산',
    detail:
      '되살린 라운드에서 선수마다 여섯 가지를 셉니다. 표본이 모자란 축은 0으로 채우지 않고 「측정중」으로 비웁니다.',
    facts: [
      '세이브 — 혼자 남은 라운드를 이긴 비율',
      '스나싸움 / 샷싸움 — 롱 안 스나 대 스나, 라플 대 라플',
      '캐리력 — 한 판 평균 킬',
      '선짤 — 라운드 첫 킬을 딴 비율',
      '연속킬 — 2초 안에 연달아 잡은 라운드 비율',
      '소수싸움 — 수가 밀린 상황을 이긴 비율',
    ],
  },
  {
    no: '06',
    title: '줄 세우기',
    detail:
      '여섯 축은 원값으로 비교할 수 없습니다. 같은 리그 안에서 백분위로 바꿔 견줍니다. 싸움만 같은 무기끼리 견줍니다 — 스나수와 라플수는 애초에 다른 시험을 치른 사이입니다.',
    facts: [
      '싸움 — 리그 × 무기 (IPL 스나수 141명 · 라플수 735명)',
      '나머지 다섯 — 리그 통합 (IPL 876명)',
      '동점은 한가운데 등수를 줍니다',
    ],
  },
  {
    no: '07',
    title: '점수와 랭킹',
    detail:
      '개인은 여섯 축 · 승률 · 킬뎃을 섞어 실력 점수를 냅니다. 판수가 적으면 점수가 가운데로 끌려옵니다. 클랜은 Elo로 판마다 주고받은 뒤 구간 안에서 다시 줄을 세웁니다.',
    facts: [
      '개인 — 여섯축 19 : 승률 35 : 킬뎃 46',
      '개인 — 15판 미만은 랭킹에서 제외',
      '승률·킬뎃은 자기 구간 기준',
      '클랜 — 실력 20 : 윗판 65 : 판수 15',
      '열산 판은 10%만 반영',
    ],
  },
]

const ANALYSIS_NOTES: readonly string[] = [
  '집계는 5분 · 30분 주기로 돌고, 감시기가 10분마다 잡이 멈췄는지 확인합니다.',
  '값이 없으면 0으로 채우지 않습니다. 화면에 「측정중」 또는 「알수없음」으로 나옵니다.',
  '공식을 바꿀 때는 옛 공식을 지우지 않고 남깁니다. 언제 무엇이 왜 바뀌었는지 되짚을 수 있어야 합니다.',
  '세부적인 데이터 처리 및 분석 방식은 시스템 최종 안정화 이후 더 공개하겠습니다.',
]

const OATH: readonly string[] = [
  '불법적인 광고를 하지 않겠습니다.',
  '기록 누락 및 사이트 버그에 최대한 빠르게 대응하여 이용자의 불편을 줄이겠습니다.',
  '부정한 방법으로 시스템을 이용하는 유저 및 클랜은 운영정책에 따라 등록 해제 또는 자격을 박탈하겠습니다.',
  '약속한 운영 기간 동안 사이트 관리에 최선을 다하겠습니다.',
  '특정 유저나 클랜에 유리하도록 기록과 규칙을 임의로 조작하지 않겠습니다.',
  '모든 이용자에게 동일한 기준의 규칙과 시스템을 적용하겠습니다.',
]

function Body({ blocks }: { blocks: readonly Block[] }): ReactNode {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`
        if (block.kind === 'li') {
          return (
            <p
              key={key}
              className="mb-[6px] pl-[14px] text-[13px] leading-[1.85] text-[var(--v2-text-muted)]"
              style={{ textIndent: '-14px' }}
            >
              · {block.text}
            </p>
          )
        }
        if (block.kind === 'note') {
          return (
            <p
              key={key}
              className="my-[10px] border-l-2 border-[var(--v2-chip-border-on)] py-[2px] pl-[12px] text-[12.5px] leading-[1.8] text-[var(--v2-text-faint)]"
            >
              {block.text}
            </p>
          )
        }
        if (block.kind === 'code') {
          return (
            <pre
              key={key}
              className="my-[10px] whitespace-pre-wrap rounded-[6px] border border-[var(--v2-card-border)] bg-[var(--v2-chip)] px-[14px] py-[11px] text-[12.5px] leading-[1.8] text-[var(--v2-text-muted)]"
            >
              {block.text}
            </pre>
          )
        }
        return (
          <p key={key} className="mb-[8px] text-[13px] leading-[1.85] text-[var(--v2-text)]">
            {block.text}
          </p>
        )
      })}
    </>
  )
}

export default function GuidePage() {
  return (
    <div className="sac-v2 pc-container pb-[60px] pt-[26px]">
      <div className="mx-auto w-full max-w-[880px]">
        <p className="text-[10.5px] font-bold tracking-[.2em] text-[var(--v2-text-ghost)]">GUIDE</p>
        <h1 className="mt-[6px] text-[30px] font-black leading-[1.2] text-[var(--v2-text-strong)] max-md:text-[24px]">
          이용방법
        </h1>
        <p className="mt-[8px] text-[12.5px] leading-[1.8] text-[var(--v2-text-faint)]">
          사이트 소개 · 커뮤니티 규칙 · 랭킹이 매겨지는 방식까지 한 곳에 모았습니다.
        </p>

        {/* ── 목차 ── */}
        <nav aria-label="목차" className="mt-[22px] flex flex-wrap gap-[6px]">
          {[...SECTIONS.map((s) => ({ id: s.id, title: s.title })), { id: 'analysis', title: '경기 로그 분석' }, { id: 'oath', title: '관리자 서약' }].map(
            (item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-full border border-[var(--v2-chip-border)] bg-[var(--v2-chip)] px-[11px] py-[5px] text-[11.5px]"
              >
                <span className="text-[var(--v2-text-muted)]">{item.title}</span>
              </a>
            ),
          )}
        </nav>

        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mt-[34px] scroll-mt-[120px]">
            <h2 className="mb-[10px] border-b border-[var(--v2-head-divider)] pb-[8px] text-[16px] font-bold text-[var(--v2-text-strong)]">
              {section.title}
            </h2>
            {section.lead ? (
              <p className="mb-[10px] text-[13.5px] font-semibold leading-[1.8] text-[#9cc0ff]">
                {section.lead}
              </p>
            ) : null}
            <Body blocks={section.blocks} />
          </section>
        ))}

        {/* ── 경기 로그 분석 ── */}
        <section id="analysis" className="mt-[34px] scroll-mt-[120px]">
          <h2 className="mb-[10px] border-b border-[var(--v2-head-divider)] pb-[8px] text-[16px] font-bold text-[var(--v2-text-strong)]">
            경기 로그 분석 방식
          </h2>
          <p className="mb-[4px] text-[13.5px] font-semibold leading-[1.8] text-[#9cc0ff]">
            경기 하나가 랭킹 한 줄이 되기까지 일곱 단계를 지납니다.
          </p>
          <p className="mb-[16px] text-[11.5px] leading-[1.8] text-[var(--v2-text-ghost)]">
            아래 숫자는 {MEASURED_ON} 기준 실측값입니다. 시즌이 돌면 달라집니다.
          </p>

          <ol className="flex flex-col gap-[10px]">
            {PIPELINE.map((step) => (
              <li
                key={step.no}
                className="grid grid-cols-[40px_minmax(0,1fr)] gap-[12px] rounded-[8px] border border-[var(--v2-card-border)] bg-[var(--v2-card)] px-[14px] py-[13px] max-md:grid-cols-1 max-md:gap-[6px]"
              >
                <span className="num text-[17px] font-black leading-none text-[#8ff0ff]">{step.no}</span>
                <div className="min-w-0">
                  <p className="mb-[5px] text-[13.5px] font-bold text-[var(--v2-text-strong)]">
                    {step.title}
                  </p>
                  <p className="mb-[8px] text-[12.5px] leading-[1.85] text-[var(--v2-text-muted)]">
                    {step.detail}
                  </p>
                  <ul className="flex flex-wrap gap-[5px]">
                    {step.facts.map((fact) => (
                      <li
                        key={fact}
                        className="rounded-[4px] border border-[var(--v2-chip-border)] bg-[var(--v2-chip)] px-[8px] py-[4px] text-[11px] text-[var(--v2-text-faint)]"
                      >
                        {fact}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-[14px]">
            {ANALYSIS_NOTES.map((line) => (
              <p
                key={line}
                className="mb-[6px] border-l-2 border-[var(--v2-chip-border-on)] py-[2px] pl-[12px] text-[12.5px] leading-[1.8] text-[var(--v2-text-faint)]"
              >
                {line}
              </p>
            ))}
          </div>
        </section>

        {/* ── 관리자 서약 ── */}
        <section id="oath" className="mt-[34px] scroll-mt-[120px]">
          <h2 className="mb-[10px] border-b border-[var(--v2-head-divider)] pb-[8px] text-[16px] font-bold text-[var(--v2-text-strong)]">
            관리자 서약
          </h2>
          {OATH.map((line) => (
            <p key={line} className="mb-[8px] text-[13px] leading-[1.85] text-[var(--v2-text)]">
              <span className="mr-[8px] font-bold text-[#c9a94a]">하나.</span>
              {line}
            </p>
          ))}
          <div className="mt-[18px] rounded-[8px] border border-[var(--v2-card-border)] bg-[var(--v2-card)] px-[16px] py-[15px] text-center">
            <p className="text-[13px] leading-[1.9] text-[var(--v2-text)]">
              공정한 규칙과 시스템을 유지할 것을
              <br />
              저의 학교와 이름을 걸고 약속드립니다.
            </p>
            <p className="mt-[10px] text-[12.5px] font-bold text-[var(--v2-text-strong)]">
              홍익대학교 경영학과 김건우 올림
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
