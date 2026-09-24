import Link from 'next/link'

/**
 * ⚠ ★옛 설명서★ (2026-09-22 ~ 2026-09-24 오후) — 지우지 않는다 (`CLAUDE.md` 1-4).
 *
 * 2026-09-24 사장님: 「서플라이 2.0 설명서 좀 바꿔 훨씬 간략하게」 → `page.tsx` 의 `CPL_GUIDE_SHORT`
 * 가 true 면 새 짧은 판, false 면 이 긴 판이 그대로 돌아온다. 문구는 한 글자도 안 바꿨다.
 */
export function CplGuideLegacy() {
  return (
    <>
      <header className="flex flex-col gap-3 border-b border-line-soft pb-6">
        <p className="text-[14px] leading-[1.75] text-meta">
          CPL 은 <b className="text-text-strong">2026년 10월 1일</b> 에 출발하는 클랜 리그입니다.
          지금은 참가 클랜을 모으고 있습니다 — 기록은 10월 1일부터 쌓입니다.
        </p>
      </header>

      <Section title="시즌">
        <Line label="cloud1 — 배치시즌">
          첫 시즌은 <b className="text-text-strong">배치시즌</b> 입니다. 한 달 동안의 성적으로
          <b className="text-text-strong"> C1 과 C2 </b> 중 어디에 속할지가 정해집니다.
        </Line>
        <Line label="cloud2 — 승강제 시작">
          배치가 끝나면 곧바로 cloud2 시즌이 시작되고,
          <b className="text-text-strong"> 승격·강등</b> 이 도입됩니다.
          C1 하위 두 팀과 C2 상위 두 팀의 자리가 바뀝니다.
          C2 하위 두 팀은 CPL 에서 탈락하며, 시즌이 끝난 뒤 다시 도전할 수 있습니다.
        </Line>
        <Line label="시즌 길이">
          cloud2 시즌부터 <b className="text-text-strong">한 시즌은 4개월</b> 입니다.
        </Line>
      </Section>

      <Section title="참가">
        <Line label="누구나 신청할 수 있습니다">
          참가 신청을 하시면 <b className="text-text-strong">10월 1일 전까지는 무료</b> 로
          등록해 드립니다.
          <span className="mt-3 block">
            <Link
              prefetch={false}
              href="/apply?kind=cpl-independent"
              className="inline-flex items-center rounded-[var(--radius)] border border-accent px-4 py-2 text-[14px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
            >
              CPL 참가 신청하기
            </Link>
          </span>
        </Line>
        <Line label="다만 자격은 봅니다">
          클랜의 체계와 일퀵 참여도를 봅니다. 열산만 하는 클랜, 열빡만 하는 클랜,
          하루에 퀵매치 한 판을 돌릴 최소 인원이 없는 클랜은 참가가 제한됩니다.
        </Line>
        <Line label="기록되는 경기">
          <b className="text-text-strong">1서버에서 클랜원 대 클랜원으로 진행하는 퀵매치</b> 만
          기록됩니다. 열산·열빡 같은 열명 게임은 자동으로 가려내어 기록하지 않습니다.
        </Line>
      </Section>

      <Section title="알려드립니다">
        <Line label="cloud0 시즌 기록">
          베타였던 cloud0 시즌의 기록은 cloud1 시즌이 시작될 때 모두 지워집니다.
          <b className="text-text-strong"> cloud1 시즌부터의 기록은 영구 보관</b> 됩니다.
        </Line>
        <Line label="PL 리그">
          인원 부족으로 <b className="text-text-strong">10월 1일부터 없어집니다.</b>
        </Line>
        <Line label="IPL 리그">
          10월 1일부터 <b className="text-text-strong">경기 분석만</b> 제공합니다.
          개인·클랜의 킬데스·승률·플레이스타일 분석은 중단되며,
          「무소속」 이라는 이름의 뜻에 맞게 IPL 클랜은 저희 사이트 소속이 아니게 됩니다.
          언제든지 CPL 에 참가하실 수 있고, 권해 드립니다.
        </Line>
        <Line label="빼 드립니다">
          다른 기록 사이트가 좋으시거나 기록 게임에 관심이 없으신 분은
          <b className="text-text-strong"> softgw01@naver.com </b> 으로 메일 주시면 즉시
          클랜을 내려 드립니다. 다만 그 뒤로는 SA CLOUD 가 여는 어떤 리그에도 참가하실 수
          없으니 이 점 유의해 주세요.
        </Line>
      </Section>

      <p className="mt-10 border-t border-line-soft pt-5 text-[13px] leading-[1.8] text-faint">
        만드는 사람은 대학생입니다. 상업적으로 하는 일이 아니라 졸업과제로 만들었습니다.
        그래도 시즌 관리 · 전과자(10/1 이후) 즉각 영구 차단 · 게시판 관리 · 랭킹 주차 관리 ·
        설박튀 관리는 과제 이상으로 하겠습니다. 가끔 들어와 편하게 즐겨 주세요.
      </p>
    </>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 border-b border-line-soft pb-2 text-[16px] font-bold text-text-strong">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

export function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[13px] font-bold text-[#ffd83d]">{label}</div>
      <p className="text-[14px] leading-[1.75] text-meta">{children}</p>
    </div>
  )
}
