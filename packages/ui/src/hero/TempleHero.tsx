import Image from 'next/image'
import Link from 'next/link'

import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
import { formatRating } from '../common/format'

/**
 * 메인 최상단 — **신전 히어로**.
 *
 * 사용자 지시 (2026-09-01):
 * > *"이걸 메인페이지 최상단 디자인으로 넣어 그리고 사이트 분위기 자체를 그리스 로마 신전
 * >  느낌으로 바꿔줘 저 조각상이랑 잘 어울리게 그리고 조각상 사이에 IPL 1등 클랜마크와
 * >  클랜명을 넣어줘 그리고 약간 빛나게 해줘 현재 1등 이라는 문구를 만들어주고 저 조각상
 * >  뒷배경엔 간지나는 먹구름 디자인을 넣어줘 번개 이펙트 있으면 좋음(사이트에 렉을
 * >  안줄정도만) 구름 위에 SA CLOUD 로고를 넣고 Connected League Operations User Data
 * >  밑에 클라우드 약자가 뭐인지를 잘 보여줘"*
 *
 * ── 층 구성 (뒤 → 앞)
 *   ```
 *   ① 먹구름          CSS radial-gradient 3겹. **이미지를 쓰지 않는다**
 *   ② 번개            opacity 키프레임 하나. 14초 · 23초 주기로 아주 가끔
 *   ③ 조각상 그림      creation-source.png (next/image · priority)
 *   ④ 가운데 빛 + 1등 클랜마크 + 클랜명 + 「현재 1등」
 *   ⑤ SA CLOUD 로고 + 약자 풀이   ← 구름 「위」다. 화면 맨 위에 둔다
 *   ```
 *
 * ── ⚠ 성능 (D-238 을 낸 다음 날 쓴 코드다)
 *   움직이는 속성은 `transform` 과 `opacity` **둘뿐**이다. 자세한 근거와 포기한 것들은
 *   `packages/ui/src/styles.css` 의 「신전 히어로」 절 머리말에 적어 뒀다.
 *   여기서 세어 둘 것은 **합성 레이어를 만드는 노드 수**다.
 *
 *   ```
 *   ── 매 프레임 도는 것 (애니메이션 → 합성 레이어)
 *   구름          3   transform 만 움직인다
 *   번개          2   opacity 만 움직인다
 *   1등 마크      1   filter 가 움직인다 — 화면에 하나뿐일 때만 허용 (「알」과 같은 규칙)
 *   ────────────────
 *   소계          6   will-change 는 **한 곳도 주지 않았다**
 *
 *   ── 한 번 칠하고 끝나는 것 (정적. 매 프레임 비용 없음)
 *   조각상 그림   1   filter: contrast(1.115) + mix-blend-mode: screen
 *   가운데 빛     1   radial-gradient 두 겹
 *   아래 페이드   1   linear-gradient 한 겹
 *   ```
 *
 *   조각상 그림은 `next/image` 가 webp/avif 로 변환해 내려보낸다. 원본 PNG(1.6MB)를
 *   `<img>` 로 직접 걸지 않는다.
 *
 *   **포기한 것** — 구름에 `filter: blur()` 를 쓰면 훨씬 폭신해 보이지만 안 썼다.
 *   블러는 레이어마다 매 프레임 다시 칠한다. `radial-gradient` 의 부드러운 끝으로 대신했다.
 *   빛도 「숨쉬는」 애니메이션을 넣지 않았다 — 그러려면 `filter` 를 움직여야 한다.
 */

/** 1등 클랜. 데이터가 없으면 `null` 을 넘긴다 — 가운데 빛만 남고 마크·이름은 안 그린다 */
export interface TempleHeroTop {
  /** 클랜명 */
  name: string
  /** 클랜 페이지 슬러그 */
  slug: string
  /** 클랜마크 2겹 (배경/전경) */
  mark?: ClanMarkSource | null
  /**
   * SACLOUD 공식 등록 클랜인가.
   *
   * 지시받은 원형 시그니처에는 없던 칸이다. **일부러 더했다** — `ClanMark` 의 공식/fallback
   * 판정(D-146)이 이 값을 본다. 넘기지 않으면 «모름» 으로 떨어져 등록 클랜인데도
   * 구름 마크가 나온다. 1등 자리에 그러면 곤란하다.
   */
  is_official_clan?: boolean | null
  /** 래더 점수. 배치고사 등으로 값이 없으면 `null` */
  rating: number | null
}

export interface TempleHeroProps {
  top?: TempleHeroTop | null
  /** 클랜 페이지로 가는 링크. 기본은 `/clan/{slug}` */
  href?: string
  /** 히어로 아래에 붙일 것 (홈은 여기에 통합검색을 넣는다) */
  children?: React.ReactNode
}

/* ────────────────────────────────────────────────────────── 그림 좌표 */
/**
 * 조각상 그림에서 **두 손가락 사이**가 어디인가.
 *
 * 원본은 1254×1254 정사각형이고, 손끝 틈의 중심은 실측으로 약 `(552, 578)` 픽셀 —
 * 곧 그림 폭의 44.0% · 높이의 46.1% 지점이다.
 *
 * ── 그림을 그대로 쓰지 않고 **위아래를 잘라 낸다**
 *   원본은 위 26% · 아래 30% 가 그냥 검정이고, **아래쪽 85% 지점에 생성기 워터마크**
 *   (동그라미+반짝이)가 박혀 있다. 그대로 얹으면 그것까지 화면에 나온다.
 *
 *   그래서 칸을 `1254 : 700` (=0.5582) 로 눕히고 `object-fit: cover` 로 세로를 자른다.
 *   폭이 칸을 채우므로 배율은 폭이 정한다 → 세로로 `1 − 0.5582 = 0.4418`(칸 폭 기준)
 *   만큼이 넘친다. `object-position` 의 세로값 p 는 그 넘침 중 위로 밀어낼 비율이다.
 *
 *   ```
 *   위로 20.0% 를 잘라 내고 싶다  →  p = 0.200 / 0.4418 = 45.2%
 *   보이는 띠                    →  그림의 20.0% ~ 75.8%
 *     조각상 26% ~ 70%   전부 보인다 ✔
 *     워터마크 85%        잘려 나간다 ✔
 *   ```
 *
 * ── 그래서 틈은 **칸 안에서** 어디인가
 *   가로는 그대로 (폭은 자르지 않았다). 세로는 `(그림비율 − 0.200) / 0.5582`.
 *   **실제로 브라우저에 십자를 찍어 맞췄다** (2026-09-01, 폭 1528px). 계산으로 낸
 *   `44.0% / 46.8%` 은 왼쪽 손끝에 살짝 붙어 있었고, 틈 한가운데는 `45.0% / 46.4%` 였다.
 *
 * ── 폭이 좁아져도 이 값은 안 바뀐다
 *   전부 백분율이고 칸의 비율이 고정이라 390px 에서도 1120px 에서도 같은 자리다.
 *   **화면 폭마다 좌표를 따로 두지 않았다** — 두 벌을 두면 한쪽이 반드시 어긋난다.
 */
const IMAGE_RATIO = '1254 / 700'
const IMAGE_FOCUS = '50% 45.2%'
const GAP_X = '45%'
const GAP_Y = '46.4%'

/**
 * 1등 블록의 크기.
 *
 * ── ⚠ **백분율을 쓰면 안 된다** (2026-09-01 실제 렌더에서 잡았다)
 *   처음에 `clamp(38px, 6.6%, 76px)` 로 썼다. 그런데 이 값들이 붙는 요소의 **담는 블록은
 *   위의 «크기 0짜리 기준점»** 이다. 백분율은 그 0을 기준으로 풀리므로 `6.6% → 0` 이 되고,
 *   `clamp` 이 언제나 최소값을 골랐다. 폭 1528px 화면에서도 마크가 38px, 빛이 130px 로
 *   나왔다 — **모든 화면에서 같은 크기**였다. 브라우저로 안 봤으면 못 잡았을 결함이다.
 *
 *   그래서 가운데 항을 `vw` 로 바꿨다. 히어로 안쪽은 1120px 에서 멈추지만, 거기까지는
 *   화면 폭과 거의 같이 움직이고 그 위에서는 어차피 `clamp` 의 최대값에 붙는다.
 */
const MARK_SIZE = 'clamp(38px, 5.6vw, 76px)'
/** 마크를 감싼 빛. 마크보다 한참 크다 — 손가락 틈에서 새어 나오는 빛이다 */
const HALO_SIZE = 'clamp(130px, 19vw, 300px)'
/**
 * 글자 덩어리가 틈에서 얼마나 떨어지는가.
 *
 * 마크 반지름(최대 38px)보다 넉넉히 커야 글자가 마크에 닿지 않는다.
 * 최대 4.4rem(66px) − 38px = 28px 가 가장 좁을 때의 여유다.
 */
const LABEL_OFFSET = 'clamp(2.2rem, 5.2vw, 4.4rem)'

export function TempleHero({ top, href, children }: TempleHeroProps) {
  const clanHref = href ?? (top ? `/clan/${top.slug}` : undefined)

  return (
    <section className="relative isolate overflow-hidden">
      {/* ── ① 먹구름 3겹. 각각 DOM 노드 하나 · 움직이는 것은 transform 뿐 ── */}
      <div aria-hidden className="temple-cloud temple-cloud-a" />
      <div aria-hidden className="temple-cloud temple-cloud-b" />
      <div aria-hidden className="temple-cloud temple-cloud-c" />

      {/* ── ② 번개 2개. 서로 주기가 달라 박자로 읽히지 않는다 ── */}
      <Bolt left="17%" />
      <Bolt left="71%" second />

      {/*
        구름이 다음 섹션(통합검색)으로 새지 않게 아래쪽을 바닥색으로 녹인다.
        정적인 그라디언트 한 장이다 — 움직이지 않는다.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: 'linear-gradient(to bottom, transparent, var(--color-page))' }}
      />

      <div className="relative mx-auto w-full max-w-[var(--layout-max,1120px)] px-5 max-md:px-3">
        {/* ── ⑤ SA CLOUD 로고 + 약자 풀이 — 구름 「위」다 ── */}
        <Wordmark />

        {/* ── ③ 조각상 + ④ 1등 ── */}
        <div className="relative mt-9 max-md:mt-6" style={{ aspectRatio: IMAGE_RATIO }}>
          <Image
            src="/hero/creation-source.png"
            alt="손끝을 마주 뻗은 두 대리석 조각상"
            fill
            priority
            sizes="(max-width: 1120px) 100vw, 1120px"
            className="temple-statue"
            style={{ objectFit: 'cover', objectPosition: IMAGE_FOCUS }}
          />

          {/*
            크기 0 짜리 **기준점**. 손가락 틈 정확히 그 자리다.
            빛과 마크는 여기를 중심으로, 글자 덩어리는 여기서 위로 뻗는다.
            ⚠ **크기가 0이므로 자식에게 백분율을 주지 마라** — 0을 기준으로 풀린다.
              길이는 전부 `clamp(px, vw, px)` 로 쓴다 (위 상수들 참조).
          */}
          <div className="absolute" style={{ left: GAP_X, top: GAP_Y }}>
            {/* 가운데 빛. 1등이 없어도 이것만은 남는다 */}
            <div
              aria-hidden
              className="temple-halo pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ width: HALO_SIZE, aspectRatio: '1' }}
            />
            {top ? <TopClan top={top} href={clanHref} /> : null}
          </div>
        </div>
      </div>

      {/* 히어로가 품는 것 — 홈에서는 통합검색이 여기 들어온다 */}
      {children ? <div className="relative">{children}</div> : null}
    </section>
  )
}

/* ────────────────────────────────────────────────────────── ⑤ 로고 */

/**
 * `SA CLOUD` + 약자 풀이.
 *
 * ── 사용자 요구는 **약자가 읽히는 것**이다
 *   *"클라우드 약자가 뭐인지를 잘 보여줘"*. 그래서 두 군데서 같은 말을 한다.
 *
 *   ```
 *   SA CLOUD                                 ← `CLOUD` 만 밝다. `SA`(서든어택)는 죽인다
 *   Connected League Operations User Data    ← 각 낱말의 첫 글자만 밝고 크다
 *      C        L      O          U    D
 *   ```
 *
 * ── `Connected` 다. `Community` 가 아니다 (2026-09-01 사용자 정정)
 *   처음에 `Community` 로 지시가 왔다가 곧바로 *"아 미안 Connect로 가자"* 로 바뀌었다.
 *   저장소 밖 기록에도 원래 `Connected` 로 남아 있다. `&` 는 넣지 않는다.
 *
 * ── 왜 기존 `MainLogo`(SVG)를 쓰지 않았나
 *   저것은 `Black Han Sans` 한 덩어리를 `textLength` 로 폭까지 못 박은 워드마크라
 *   **글자별로 밝기를 나눌 수 없다.** 약자를 보여 주는 것이 이 블록의 목적이므로
 *   여기서는 진짜 텍스트로 짰다. `MainLogo` 컴포넌트는 지우지 않았다 (CLAUDE.md 10-4).
 */
function Wordmark() {
  return (
    <div className="pt-[104px] text-center max-md:pt-[64px]">
      <h1 className="temple-type leading-none">
        <span
          className="text-[clamp(2.2rem,7vw,4.6rem)] font-normal tracking-[0.14em]"
          style={{ color: 'var(--color-stone, #6e6862)' }}
        >
          SA
        </span>
        <span className="inline-block w-[0.34em]" />
        <span
          className="text-[clamp(2.2rem,7vw,4.6rem)] font-bold tracking-[0.14em]"
          style={{ color: 'var(--color-marble, #cfcac4)' }}
        >
          CLOUD
        </span>
        {/* 브랜드 점. `MainLogo` · `NavLogo` 와 같은 자리다 — 진홍은 여기 한 점 */}
        <span
          aria-hidden
          className="ml-[0.18em] inline-block h-[0.16em] w-[0.16em] align-[0.34em]"
          style={{ backgroundColor: 'var(--color-accent, #d92b2b)' }}
        />
      </h1>

      {/* 폰(390px)에서 `1.7vw` 는 6.6px 까지 내려간다. 약자가 보이는 것이 이 줄의 목적이라
          최소값으로 받쳐 뒀다 — 0.68rem(10.2px), 첫 글자는 1.32배라 13.5px 다 */}
      <p className="temple-type mt-4 text-[clamp(0.68rem,1.7vw,0.92rem)] max-md:mt-3">
        <Acronym head="C" rest="onnected" />
        <Acronym head="L" rest="eague" />
        <Acronym head="O" rest="perations" />
        <Acronym head="U" rest="ser" />
        <Acronym head="D" rest="ata" last />
      </p>
    </div>
  )
}

/**
 * 약자 한 낱말. 첫 글자만 밝고 한 단 크다.
 *
 * ── 낱말 사이는 **띄어쓰기 없는 빈 칸이면 안 된다** (2026-09-01 실제 렌더에서 잡았다)
 *   처음엔 폭만 가진 빈 `<span>` 으로 벌렸다. 화면은 멀쩡했는데 `innerText` 가
 *   `ConnectedLeagueOperationsUserData` **한 덩어리**였다 — 스크린리더가 그렇게 읽고
 *   복사해도 그렇게 붙는다. 약자를 **읽히게** 하려고 만든 줄인데 앞뒤가 안 맞는다.
 *
 *   그렇다고 보통 공백 한 칸을 넣으면 CSS 가 접어 버려서(`white-space` 기본값)
 *   글자로 남지 않는다. 그래서 **줄바꿈 없는 공백(`U+00A0`)** 을 글자로 넣고,
 *   보이는 간격은 `margin` 이 만든다. 둘의 역할을 나눈 것이다.
 *   (소스에 눈에 안 보이는 문자를 박아 두지 않으려고 `'U+00A0'` 이스케이프로 쓴다)
 */
function Acronym({ head, rest, last }: { head: string; rest: string; last?: boolean }) {
  return (
    <span className={`whitespace-nowrap${last ? '' : ' mr-[0.5em]'}`}>
      <span
        className="text-[1.32em] font-bold tracking-[0.06em]"
        style={{ color: 'var(--color-marble, #cfcac4)' }}
      >
        {head}
      </span>
      <span className="tracking-[0.1em]" style={{ color: 'var(--color-stone, #6e6862)' }}>
        {rest}
        {last ? null : '\u00a0'}
      </span>
    </span>
  )
}

/* ────────────────────────────────────────────────────────── ④ 1등 */

/**
 * 손가락 틈의 1등 클랜.
 *
 * ── 글자는 **전부 틈 위쪽**이다 (2026-09-01 실제 렌더에서 고쳤다)
 *   처음엔 「현재 1등」을 위에, 클랜명과 점수를 아래에 뒀다. 그런데 브라우저로 보니
 *   **클랜명이 누운 조각상의 허벅지 위에** 얹혔다. 대리석은 밝고 글자도 밝아서 읽기가
 *   나빴고, 그 아래 진홍 숫자는 더 심했다.
 *
 *   그림에서 정말로 비어 있는 곳은 **두 팔 사이 위쪽**(그림 높이 30~45%)이다.
 *   그래서 세 줄을 한 칼럼으로 묶어 틈 위에 세웠다. 읽는 순서도 그대로다 —
 *   `현재 1등` → `클랜명` → `래더`, 그리고 그 끝이 가리키는 곳에 마크가 빛난다.
 *
 * 색 배분 (D-204 를 지키면서 금빛을 아주 조금만 들인 결과)
 * ```
 * 금빛(--color-gold)     「현재 1등」 · 빛 · 마크 글로우   ← 1등 하나에만
 * 대리석(--color-marble) 클랜명                          ← 이 블록에서 가장 밝다
 * 진홍(--color-accent)   래더 점수                       ← 「가장 중요한 숫자 하나」
 * ```
 */
function TopClan({ top, href }: { top: TempleHeroTop; href?: string }) {
  const body = (
    <>
      {/* 「현재 1등」 · 클랜명 · 래더 — 틈 **위쪽**, 두 팔 사이의 빈 자리 */}
      <span
        className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 whitespace-nowrap"
        style={{ bottom: LABEL_OFFSET }}
      >
        <span
          className="temple-type text-[clamp(0.6rem,1.2vw,0.8rem)] font-bold tracking-[0.42em]"
          style={{ color: 'var(--color-gold, #c9a24e)' }}
        >
          현재 1등
        </span>
        <span
          className="temple-type text-[clamp(0.95rem,2.4vw,1.7rem)] font-bold leading-tight tracking-[0.06em]"
          style={{ color: 'var(--color-marble, #cfcac4)' }}
        >
          {top.name}
        </span>
        {top.rating === null ? null : (
          <span
            className="num text-[clamp(0.68rem,1.4vw,0.92rem)]"
            style={{ color: 'var(--color-accent, #d92b2b)' }}
          >
            {formatRating(top.rating)}
          </span>
        )}
      </span>

      {/* 마크 — 틈 한가운데. 「약간 빛나게」 (사용자 지시)
          `block` 을 명시한다. absolute 라 어차피 블록이 되지만, 폭이 안 먹는 사고를
          한 번 냈던 자리라 의도를 남겨 둔다 */}
      <span
        className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
        style={{ width: MARK_SIZE }}
      >
        <ClanMark
          clan={{ mark: top.mark ?? null, is_official_clan: top.is_official_clan }}
          size="fluid"
          className="temple-mark-glow"
          alt={`${top.name} 클랜마크`}
        />
      </span>
    </>
  )

  /* 링크가 있으면 블록 전체가 클랜 페이지로 간다. 없으면 그냥 그린다.
     `a { color: inherit }` 함정(D-231)을 피하려고 색은 전부 안쪽 `span` 이 갖는다 */
  return href ? (
    <Link href={href} className="absolute" aria-label={`IPL 현재 1등 ${top.name}`}>
      {body}
    </Link>
  ) : (
    <span className="absolute">{body}</span>
  )
}

/* ────────────────────────────────────────────────────────── ② 번개 */

/**
 * 번개 한 줄기.
 *
 * 껍데기 하나만 `opacity` 로 깜빡이고, 안에 든 것(확산광 + 지그재그 선)은 **정지 화면**이다.
 * 그래서 매 프레임 다시 칠할 것이 없다.
 *
 * ── 캔버스도 SVG 필터도 JS 타이머도 쓰지 않았다
 *   지그재그는 `<polyline>` 두 줄이다 — 굵고 흐린 줄(번짐 대신) 위에 가는 밝은 줄.
 *   `filter: blur()` 로 번지게 하면 예쁘지만 **레이어가 하나 더 생기고 매번 다시 칠한다.**
 *   그 값은 여기서 치를 값이 아니다 (*"사이트에 렉을 안줄정도만"*).
 */
function Bolt({ left, second }: { left: string; second?: boolean }) {
  return (
    <div
      aria-hidden
      className={`temple-bolt${second ? ' temple-bolt-2' : ''}`}
      style={{ left, top: '-6%', width: 'min(38%, 420px)', height: '62%' }}
    >
      {/* 하늘이 통째로 밝아지는 확산광 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(46% 58% at 50% 22%, rgb(214 210 206 / 0.5), transparent 72%)',
        }}
      />
      <svg
        className="absolute left-1/2 top-0 h-full -translate-x-1/2"
        style={{ width: 'clamp(16px, 2.4vw, 40px)' }}
        viewBox="0 0 40 200"
        preserveAspectRatio="xMidYMin meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 번짐 대신 굵고 투명한 줄 하나를 깔았다 */}
        <polyline
          points="28,0 12,86 24,94 9,200"
          fill="none"
          stroke="rgb(214 210 206 / 0.28)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="28,0 12,86 24,94 9,200"
          fill="none"
          stroke="rgb(246 243 240 / 0.92)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
