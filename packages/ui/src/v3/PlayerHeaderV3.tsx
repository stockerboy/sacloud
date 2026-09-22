'use client'

/**
 * ★선수 상세 머리 카드★ (2026-09-11 사장님 목업 — PC 먼저, 폰은 목업 그대로)
 *
 * 옛 판은 두 장이었다 — 띠(`PlayerBandV3`) + 구간 카드(`PlayerDetailV3` 안 `TierRecordCard`).
 * 사장님 목업은 ★한 장★ 이다:
 *
 * ```
 *            플레이구간  [ASTRA ▼]
 *   ⬤ starry [라플]                                 3,519점
 *     sometimes · 1위 / 697명                      [기본정보]
 *   ───────────────────────────────────────────────────────
 *   승률 65.7%        킬뎃 57.7% [라플][스나]     판킬 10.6
 *   44승 23패
 *   ───────────────────────────────────────────────────────
 *   ★ MVP 11회 19.3%                        🚨 핵의심 0회
 * ```
 *
 * ★숫자는 전부 «고른 구간 · 고른 무기» 다★ (사장님 2026-09-11):
 *   «여기 나오는 승률 킬뎃은 통합이 아니라 라플수이면 그 구간 라플킬뎃 스나수이면 그 구간 스나킬뎃»
 *   → 승률·킬뎃·판킬 셋 다 `tier_breakdown[구간]` 의 무기 칸을 읽는다. 통합(시즌 전체)이 아니다.
 *   무기를 모르는 판은 어느 무기에도 안 들어간다 — 그래서 «무기 합 ≠ 구간 전체» 일 수 있다.
 *
 * 값이 없으면 `-` 다. 지어내지 않는다.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { LeaguePlayerDetail } from '@sacloud/contract'
import {
  barracksPlayerUrl,
  leagueScreen,
  showsTier,
  badgeArtSmallPath,
  badgeOfAxis,
  tierKdOrNull,
  tierWinRateOrNull,
} from '@sacloud/contract'
import { rankColorOf, statColor } from './rankColors'
import { Hexagon } from './Hexagon'
import { PlayerHexTrend } from './PlayerHexTrend'
import { strengthAxes } from './playerHexAxes'
import { GhostButton, LeagueCenter, OfficialPill } from './PlayerBandV3'
import { MarkCircle, RankText, TierText, clanThemeOf } from './primitives'
import { V3, cardStyle, fmt, pct1, spacerStyle } from './tokens'
import { formatRating, formatRatingPoint } from '../common/format'

const WEAPON_LABEL: Readonly<Record<number, string>> = { 0: '라플', 1: '스나' }

export interface PlayerHeaderV3Props {
  data: LeaguePlayerDetail
  infoHref: string
  /**
   * ★정보갱신 손잡이★ (2026-09-21 사장님: 「정보갱신 버튼을 여기에도 만들어」).
   * 안 주면 단추를 ★안 그린다★ — 눌러도 아무 일 없는 단추를 두지 않는다.
   */
  onRenew?: () => void
  /** 갱신이 도는 중인가 — 단추가 「갱신중…」 으로 바뀐다 */
  renewing?: boolean
  seasonLabel: string
  /** 주무기 (0 라플 · 1 스나) — 첫 화면의 무기 칩이 이것부터 선다 */
  mainWeapon: number | null
  /** 핵의심 — 없으면 그 칸을 안 그린다 */
  report?: { count: number; reported: boolean; pending: boolean; message: string | null; onReport: () => void }
  /**
   * ★킬데스를 화면에서만 가린다★ (2026-09-14 사장님).
   *
   *   «IPL - 개인 , 클랜 승률만 기록, 개인 킬데스 정보 제공x»
   *   «킬데스를 써라 킬데스는 숨기는거 뿐이다 우리가 몰래 랭킹계산할때 써야하는 자료이다»
   *
   *   그래서 ★수집·저장·점수 계산은 한 글자도 안 바뀐다.★ 값은 계약에 그대로 실려 오고,
   *   이 깃발은 ★칸을 그리느냐★ 만 정한다. 기본 `true` 라 옛 화면은 그대로다 (`CLAUDE.md` 1-4).
   *   진실의 출처는 `leagueScreen(slug).playerColumns.kd` 하나뿐이다 — 여기서 지어내지 않는다.
   */
  showsKd?: boolean
}

type Row = LeaguePlayerDetail['tier_breakdown'][number]

const cellStyle: CSSProperties = { position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 20px', minWidth: 0 }

/**
 * ★★킬뎃 한 줄 — 누르면 스나·라플로 갈라진다★★ (2026-09-21 사장님)
 *
 * > 「킬뎃을 ★통합킬뎃★ 으로 라플 스나 합친거 써놓고 ★누르면 스나킬뎃 라플킬뎃
 * >  분리해서 볼 수 있게끔★ 설계해줘」
 *
 * ⚠ ★값을 감추는 것이 아니다★ — 접었을 때는 통합 하나, 펴면 둘이 그대로 나온다.
 * ⚠ ★주무기를 밝게★ 그린다 (옛 두 줄 판의 규칙을 그대로 가져왔다).
 */
function KdCell({
  kd,
  kill,
  death,
  games,
  sniper,
  rifle,
  weapon,
}: {
  kd: number | null
  kill: number | null
  death: number | null
  games: number | null
  sniper: { kd: number | null; games: number; kill: number; death: number } | null
  rifle: { kd: number | null; games: number; kill: number; death: number } | null
  weapon: 0 | 1 | null
}) {
  const [open, setOpen] = useState(false)
  const sub =
    kill === null || death === null
      ? games === null
        ? null
        : `${fmt(games)}판`
      : `${fmt(games ?? 0)}판 · ${fmt(kill)}킬 ${fmt(death)}데스`

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
        style={{ ...cellStyle, borderRight: `1px solid ${V3.rowDivider}`, cursor: 'pointer' }}
        className="v3-phead-cell"
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 10.5, color: V3.textGhost, letterSpacing: '.08em', whiteSpace: 'nowrap', flex: 'none' }}>
            킬뎃 <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
          </span>
          {sub ? (
            <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {sub}
            </span>
          ) : null}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 26,
              fontWeight: 600,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              color: kd === null ? V3.textMuted : statColor(kd),
            }}
          >
            {pct1(kd)}
          </span>
        </span>
      </div>
      {open ? (
        <>
          <Kpi
            label="스나 킬뎃"
            value={pct1(sniper?.kd ?? null)}
            sub={sniper === null ? null : `${fmt(sniper.games)}판 · ${fmt(sniper.kill)}킬 ${fmt(sniper.death)}데스`}
            color={
              sniper?.kd === null || sniper?.kd === undefined
                ? DIM
                : weapon === 1
                  ? statColor(sniper.kd)
                  : DIM
            }
          />
          <Kpi
            label="라플 킬뎃"
            value={pct1(rifle?.kd ?? null)}
            sub={rifle === null ? null : `${fmt(rifle.games)}판 · ${fmt(rifle.kill)}킬 ${fmt(rifle.death)}데스`}
            color={
              rifle?.kd === null || rifle?.kd === undefined
                ? DIM
                : weapon === 0
                  ? statColor(rifle.kd)
                  : DIM
            }
          />
        </>
      ) : null}
    </>
  )
}

function Kpi({ label, value, sub, color, extra, className }: { label: string; value: string; sub?: ReactNode; color: string; extra?: ReactNode; className?: string }) {
  return (
    <div
      style={{ ...cellStyle, borderRight: `1px solid ${V3.rowDivider}` }}
      /* ★`v3-kpi-pconly`★ 는 900px 미만에서 이 칸을 감춘다 (2026-09-21) */
      className={className ? `v3-phead-cell ${className}` : 'v3-phead-cell'}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 10.5, color: V3.textGhost, letterSpacing: '.08em', whiteSpace: 'nowrap', flex: 'none' }}>{label}</span>
        {sub ? <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span> : null}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', color }}>{value}</span>
        {extra}
      </span>
    </div>
  )
}

/**
 * ★MVP·핵의심 줄을 양끝으로 벌릴 것인가★ (2026-09-17 무한 QA에서 내렸다).
 * `true` 면 옛 모습 — 라벨은 왼쪽 끝, 값은 오른쪽 끝.
 */
const FOOT_SPREAD: boolean = false

/**
 * ★선수 카드가 무엇으로 등수·점수를 말하나★ (2026-09-21 · 무한 QA)
 *   `'ladder'`  랭킹 화면과 ★같은 래더★. ★지금 이것★
 *   `'hex'`     우리 실력점수 (2026-09-12 ~ 09-21 · `CLAUDE.md` 1-4)
 */
const PLAYER_CARD_RANK_BY = 'ladder' as 'ladder' | 'hex'

/**
 * ★킬뎃을 늘 두 줄로 펼쳐 둘까★ (2026-09-21 사장님: 「통합킬뎃으로 (…) 누르면 분리」).
 * `true` 면 옛 모습(스나·라플 두 줄이 늘 보임)이 그대로 돌아온다 (`CLAUDE.md` 1-4).
 */
const KD_SPLIT_ALWAYS = false as boolean

/** 옛 순위 보조 문구 — 지우지 않는다 (`CLAUDE.md` 1-4) */
export const RANK_SUB_V1 = (total: number): string => `/ ${fmt(total)}명`
/** 지금 쓰는 순위 보조 문구 — 슬래시를 떼고 «몇 명 중» 으로 말한다 */
const rankSub = (total: number): string => `${fmt(total)}명 중`

/**
 * ★이름 줄에도 순위를 적을 것인가★ (2026-09-15 밤 · 무한 QA에서 내렸다).
 * 아래 KPI 칸에 이미 «순위 4위 / 137명» 이 있어 한 카드에 같은 말이 두 번이었다.
 * `true` 로 두면 옛 모습으로 돌아간다.
 */
const RANK_ON_NAME_LINE: boolean = false


/**
 * ★기록카드 뒤 그림을 깔 것인가★ (2026-09-17 사장님이 «없애버려» 하심).
 *   구름·건물 그림(`/assets/player-hero.webp`)와 CSS 는 그대로 남아 있다.
 */
const HEAD_ART = false

/**
 * ★불 꺼진 색★ (2026-09-20 사장님: 「라플킬뎃은 어둡게(불꺼진것처럼)」)
 *
 * 주무기가 아닌 쪽에 쓴다. ★값은 그대로 보인다★ — 감추는 것이 아니라
 * ★어느 쪽이 본업인지★ 를 밝히는 것이다.
 */
const DIM = '#96a0b5'

/** ★「통합」 을 나타내는 구간 번호★ — 진짜 구간은 1부터라 0을 쓴다 (2026-09-20) */
const ALL_TIER = 0

export function PlayerHeaderV3({ data, infoHref, seasonLabel, mainWeapon, report, showsKd = true, onRenew, renewing }: PlayerHeaderV3Props) {
  const theme = clanThemeOf(data.clan?.slug)
  /* 이어 붙은 병영수첩 계정이 없으면 null — 아래에서 단추를 안 그린다 */
  const barracksHref = barracksPlayerUrl(data.player.barracks_usn)
  const hex = data.hex
  /* ★특성 배지★ — 열 위 안에 든 축 (2026-09-12 사장님). STRENGTH POINT 카드와 같은 값이다 */
  /*
   * ★부여된 배지만 진열한다★ (2026-09-17 사장님: «부여된것만 들고있어야하는데»).
   *
   * ⚠ 같은 날 제가 「여섯을 다 걸어라」 로 잘못 읽고 전부 그렸었다. 사장님 말씀은
   *   ★딴 것만★ 이다. 배지 컷은 스나싸움 3위 · 나머지 5위다 (2026-09-12 사장님).
   *   배지가 없는 선수는 이 줄 자체가 안 그려진다 — 그게 맞는 모양이다.
   */
  const badges = hex ? hex.axes.filter((a) => a.badge !== null && a.rank !== null) : []
  /**
   * ★통합 순위★ (2026-09-12 사장님: «이거 통합 순위 맞아? 왜 140명? 통합 순위로 넣어»).
   * 옛 판은 score_rank — ★그 무기 안에서만★ 의 등수라 «15위 / 140명» 이 떴다.
   * 이제 스나·라플을 섞은 등수를 먼저 쓰고, 그게 없을 때만 옛 값으로 떨어진다.
   */
  /*
   * ⚠ ★2026-09-21 — 랭킹 화면과 ★같은 값★ 을 본다★ (무한 QA에서 잡았다)
   *
   *   랭킹은 2026-09-21 부터 ★래더(Elo)★ 로 줄을 세우는데 이 카드만
   *   ★우리 실력점수(`hex.score_rank_all`)★ 로 등수를 적고 있었다. 실측 —
   *   ```
   *   랭킹 화면   다홍 ★1위★ / 120명
   *   이 카드     다홍 ★7위★ / 180명
   *   ```
   *   ★같은 사람이 두 화면에서 다른 등수★ 였다. 사장님이 보시면 못 믿는다.
   *
   *   `data.rank` 는 서버가 ★랭킹과 같은 잣대로★ 세어 준 값이다
   *   (`rankOfFirstPlayer` — 래더 기준). 그것을 먼저 쓴다.
   *
   * ⚠ 옛 판은 지우지 않았다 — `PLAYER_CARD_RANK_BY = 'hex'` 로 되돌린다.
   */
  const rank = PLAYER_CARD_RANK_BY === 'ladder' ? data.rank : (hex?.score_rank_all ?? (hex ? hex.score_rank : data.rank))
  const rankTotal =
    PLAYER_CARD_RANK_BY === 'ladder'
      ? data.rank_count
      : (hex?.score_total_all ?? (hex ? hex.score_total : data.rank_count))
  /*
   * ★★「통합」 을 맨 앞에 두고 기본으로 삼는다★★ (2026-09-20 사장님)
   *
   * > 「얘는 5승1패인데 왜 가로카드엔느 저렇게 찍히니또」
   *
   * ── 무엇이 문제였나 (실측 · 현물님 IPL)
   *     명부       ★5승 1패★ · 64킬 37뎃
   *     화면 상단   2승 1패 66.7%      ← ★1구간 3판만★
   *
   *   화면은 ★가장 많이 뛴 구간 하나★ 만 골라 보여 줬다. 여섯 판이 구간별로
   *   쪼개지면 그중 큰 덩이만 나온다. ★사람은 그 숫자를 「전체 기록」 으로 읽는다.★
   *
   * ── 그래서 통합을 만든다
   *   구간 기록을 다 더해 ★통합 한 줄★ 을 만들고 ★그것을 기본★ 으로 둔다.
   *   ⚠ 구간별 보기를 ★없애지 않았다★ — 칩을 누르면 그대로 나온다
   *     (2026-09-11 사장님 지시는 그대로 산다 · CLAUDE.md 1-4).
   *   ⚠ 구간이 하나뿐이면 통합과 같으므로 ★만들지 않는다★ — 똑같은 칩 두 개는 군더더기다.
   *
   * ── ⚠ ★애초에 구간은 화면에서 쓰지 않기로 했다★ (사장님: 「구간없앴잖아 우리 아니야?」)
   *   세 리그 전부 `showsTier: false` 다. 칩은 안 그려지는데 ★뒤에서는 구간으로
   *   쪼개고 있었다.★ 그래서 아무도 고를 수 없는 구간 하나의 숫자가 화면에 나갔다.
   *   ★칩을 안 그리는 리그에서는 언제나 통합★ 이다 — 아래 `tiered` 가 그것을 막는다.
   */
  const rows = useMemo(() => {
    const src = data.tier_breakdown
    const played = src.filter((r) => r.games > 0)
    if (played.length <= 1) return src
    const sum = (pick: (r: (typeof src)[number]) => number) =>
      played.reduce((a, r) => a + pick(r), 0)
    const win = sum((r) => r.win)
    const lose = sum((r) => r.lose)
    const sk = sum((r) => r.sniper_kill)
    const sd = sum((r) => r.sniper_death)
    const rk = sum((r) => r.rifle_kill)
    const rd = sum((r) => r.rifle_death)
    const knownGames = sum((r) => r.known_games)
    const sniperGames = sum((r) => r.sniper_games)
    const rifleGames = sum((r) => r.rifle_games)
    const all: (typeof src)[number] = {
      ...played[0]!,
      /* ★0 은 「통합」 이라는 뜻★ — 진짜 구간 번호는 1부터다 */
      tier: ALL_TIER,
      games: sum((r) => r.games),
      win,
      lose,
      /*
       * ★★구간 행과 ★똑같은 함수★ 로 잰다★★ (2026-09-20 비판 검수에서 잡았다)
       *
       *   구간 행의 킬뎃·승률은 `tierKdOrNull`·`tierWinRateOrNull` 을 타서
       *   ★판수가 모자라면 `null`★ 이 되고 화면이 «—» 를 적는다 (D-106).
       *
       *   그런데 이 「통합」 행은 `rate()` 로 ★직접 계산★ 하고 있었다. 그래서
       *   6판 뛴 선수가 ★통합 칸에는 「62.5%」, 구간 칩을 누르면 「—」★ 가 떴다.
       *   ★같은 카드 안에서 같은 이름의 숫자가 두 뜻★ 이 된 것이다.
       *
       * ⚠ 합쳐서 판수가 차면 값이 나온다 — 그게 맞다. 「통합」 은 ★더 많은 판★ 을
       *   본 것이므로 구간 하나보다 ★더 믿을 만하다.★ 막으려는 것은 판수가
       *   ★모자란데도★ 숫자를 적는 것뿐이다.
       */
      win_rate: tierWinRateOrNull(win + lose, win, lose),
      known_games: knownGames,
      kd: tierKdOrNull(knownGames, sk + rk, sd + rd),
      sniper_games: sum((r) => r.sniper_games),
      sniper_kill: sk,
      sniper_death: sd,
      sniper_kd: tierKdOrNull(knownGames, sk, sd),
      rifle_games: sum((r) => r.rifle_games),
      rifle_kill: rk,
      rifle_death: rd,
      rifle_kd: tierKdOrNull(knownGames, rk, rd),
      mvp: sum((r) => r.mvp),
      /*
       * ★★여기부터는 ★반드시★ 다시 센다★★ (2026-09-20 비판 검수에서 잡았다)
       *
       *   위에서 `...played[0]!` 로 시작하므로, ★여기 안 적은 칸은 1구간 값을
       *   그대로 물려받는다.★ 「통합」 이라고 적힌 줄에 1구간 숫자가 앉는 것이다.
       *   ★오늘 이미 한 번 겪은 사고다★ (클랜별 전적 48.0% · 커밋 7dfb7fe4).
       *
       *   ⚠ ★판킬 두 칸은 실제로 화면에 나간다★ — 머리 카드가 `sel.sniper_kill_per_match`
       *     를 그대로 적는다. 물려받은 채로 두면 ★통합 판킬이 1구간 판킬★ 이 된다.
       */
      sniper_kill_per_match: sniperGames > 0 ? sk / sniperGames : null,
      rifle_kill_per_match: rifleGames > 0 ? rk / rifleGames : null,
      sniper_win: sum((r) => r.sniper_win),
      sniper_lose: sum((r) => r.sniper_lose),
      rifle_win: sum((r) => r.rifle_win),
      rifle_lose: sum((r) => r.rifle_lose),
      /*
       * ⚠ ★상대 목록은 합치지 않고 ★비운다★.★ 구간마다 상대가 다르고, 같은 클랜이
       *   여러 구간에 걸치면 ★합치는 규칙★ 이 따로 필요하다 (`PlayerDetailV3` 가
       *   `byFoe` 로 그 일을 한다). 머리 카드는 이 두 칸을 ★읽지 않으므로★
       *   ★1구간 것을 물려받는 것보다 비어 있는 편이 정직하다.★
       */
      nemeses: [],
      opponents: [],
    }
    return [all, ...src]
  }, [data.tier_breakdown])
  /* ★머리 카드가 그리는 여섯 축★ (2026-09-12). STRENGTH POINT 카드와 ★같은 함수★ 다 */
  const axes = strengthAxes(data)
  /*
   * ★티어는 리그가 정한다★ (2026-09-14 사장님: «아직도 IPL에 층수가 나와있고
   *   ASTRA CHALLENGER 다 안없어졌어 SPL도 마찬가지 1티어 2티어 왜있는지»).
   *
   *   옛 값은 `data.league.division_count >= 2` 뿐이었다 — 부리그가 둘이면 무조건
   *   티어를 그렸다. 그런데 «부리그가 몇 개인가» 와 «티어를 화면에 쓰는가» 는
   *   ★다른 물음★ 이다. 계약(`showsTier`)이 정하고 화면은 따른다.
   */
  /** ★래더(점수) 칸을 그리나★ — 계약이 정한다 (2026-09-14) */
  const showsRating = leagueScreen(data.league.slug).playerColumns.rating
  const tiered = showsTier(data.league.slug) && data.league.division_count >= 2

  /* ★플레이구간★ — 가장 많이 뛴 구간이 기본. 누르면 그것이 우선 */
  const [pickedTier, setPickedTier] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const mostPlayed = useMemo(() => {
    /* ★통합이 있으면 그것이 기본★ — 사람이 먼저 보는 숫자는 「내 전체 기록」 이다 */
    const all = rows.find((r) => r.tier === ALL_TIER)
    if (all) return ALL_TIER
    const played = rows.filter((r) => r.games > 0)
    if (played.length === 0) return rows[0]?.tier ?? 1
    return played.reduce((a, b) => (b.games > a.games ? b : a)).tier
  }, [rows])
  /*
   * ★★구간을 안 쓰는 리그는 언제나 통합★★ (2026-09-20 사장님)
   *
   *   `tiered` 가 거짓이면 ★구간 칩을 아예 안 그린다.★ 고를 수 없는데도
   *   뒤에서 구간 하나를 골라 그 숫자를 보여 주면 ★사람은 전체 기록으로 읽는다.★
   *   실측 — 5승 1패인 선수가 2승 1패로 나왔다.
   */
  const tier = tiered ? (pickedTier ?? mostPlayed) : (rows.some((r) => r.tier === ALL_TIER) ? ALL_TIER : mostPlayed)
  const sel: Row | null = rows.find((r) => r.tier === tier) ?? null

  /* ★무기★ — 그 구간에서 뛴 무기만 고를 수 있다. 주무기부터, 없으면 많이 뛴 쪽 */
  const [pickedWeapon, setPickedWeapon] = useState<number | null>(null)
  const weapons = useMemo(() => {
    const list: number[] = []
    if ((sel?.rifle_games ?? 0) > 0) list.push(0)
    if ((sel?.sniper_games ?? 0) > 0) list.push(1)
    return list
  }, [sel])
  const weapon = (() => {
    if (pickedWeapon !== null && weapons.includes(pickedWeapon)) return pickedWeapon
    if (mainWeapon !== null && weapons.includes(mainWeapon)) return mainWeapon
    if (weapons.length > 0) return (sel?.sniper_games ?? 0) > (sel?.rifle_games ?? 0) ? 1 : 0
    return null
  })()

  /* 고른 구간 · 고른 무기의 숫자 (무기가 없으면 구간 전체) */
  const rifle = weapon === 0
  /* ★승률은 그 구간의 통합 승률로 고정★ · ★킬뎃·판킬만 무기를 따라간다★ (2026-09-11 사장님) */
  const win = sel === null ? null : sel.win
  const lose = sel === null ? null : sel.lose
  const winRate = win === null || lose === null || win + lose === 0 ? null : Math.round((win / (win + lose)) * 1000) / 10
  const kd = sel === null ? null : weapon === null ? sel.kd : rifle ? sel.rifle_kd : sel.sniper_kd
  /* 판킬은 2026-09-11 에 순위 칸으로 바뀌었다 — 값은 남겨 둔다 (되돌릴 때 쓴다) */
  const perMatch = sel === null ? null : weapon === null ? null : rifle ? sel.rifle_kill_per_match : sel.sniper_kill_per_match
  void perMatch
  const kill = sel === null ? 0 : rifle ? sel.rifle_kill : sel.sniper_kill
  const death = sel === null ? 0 : rifle ? sel.rifle_death : sel.sniper_death
  const mvpRate = sel && sel.games > 0 ? (sel.mvp / sel.games) * 100 : null
  /*
   * ⚠ ★옛 판이 쓰던 값들★ — 2026-09-20 에 킬뎃 칸이 스나·라플 두 칸으로 갈리면서
   *   안 쓰게 됐다. ★지우지 않는다★ (CLAUDE.md 1-4) — 한 칸으로 되돌릴 때 그대로 쓴다.
   */
  void rifle
  void kd
  void kill
  void death

  /*
   * ⚠ ★고를 게 하나뿐이면 안 그린다★ (2026-09-15 · 무한 QA).
   *
   *   이 칩은 «스나/라플 중 어느 쪽 기록을 볼까» 를 ★고르는★ 물건이다.
   *   그런데 한 무기만 뛴 선수는 칩이 하나뿐이라 누를 것이 없고,
   *   이름 옆에 ★같은 글자(«라플»)가 또★ 있어서 «라플 라플» 로 보였다.
   *   둘 이상일 때만 고르기를 세운다 — 표시는 이름 옆이 맡는다.
   */
  const weaponChips = weapons.length < 2 ? null : (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      {weapons.map((w) => (
        <span
          key={w}
          onClick={() => setPickedWeapon(w)}
          style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '.02em', padding: '3px 10px', borderRadius: 5, lineHeight: 1.45, cursor: 'pointer', whiteSpace: 'nowrap',
            color: w === weapon ? '#1c2f6b' : V3.textGhost,
            background: w === weapon ? 'rgba(91,141,255,.18)' : 'transparent',
            border: `1px solid ${w === weapon ? 'rgba(91,141,255,.5)' : V3.chipBorder}`,
          }}
        >
          {WEAPON_LABEL[w]}
        </span>
      ))}
    </span>
  )

  return (
    <section style={{ ...cardStyle, position: 'relative', overflow: 'hidden', marginTop: 22, borderTop: `2px solid ${theme.edge}` }} className="v3-phead">
      {/*
        * ⚠ ★구름·건물 그림을 뜼다★ (2026-09-17 사장님:
        *   «개인기록카드 뒤에 구름이랑 건물 인식표 희미하게 있는거 없애버려 개구려»).
        *
        *   카드 위 150px 에 `player-hero.webp` 가 투명도 0.3 으로 깔려 있었다.
        *   그림 파일과 CSS(`.v3-phead-art`)는 ★지우지 않았다★ — 그리지만 않는다.
        *   되살리려면 `HEAD_ART` 를 true 로 (`CLAUDE.md` 1-4).
        */}
      {HEAD_ART ? <span aria-hidden className="v3-phead-art" /> : null}
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 200, background: `linear-gradient(180deg, ${theme.main}1f, transparent 70%)`, pointerEvents: 'none' }} />

      {/* 1 · 플레이구간 · 무기 — 카드의 모든 숫자가 이 둘을 따른다 */}
      {tiered || weapons.length > 0 ? (
        <div className="v3-phead-tier" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '11px 16px 9px', flexWrap: 'wrap' }}>
          {tiered ? <span style={{ fontSize: 11, color: '#5c6479', letterSpacing: '.06em', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,.85)' }}>플레이구간</span> : null}
          <span style={{ position: 'relative', display: tiered ? 'inline-block' : 'none' }}>
            <span
              onClick={() => setOpen((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 8px', borderRadius: 5, background: 'rgba(10,16,28,.45)', border: `1px solid ${V3.chipBorder}` }}
            >
              <TierText division={tier} leagueCategory={data.league.category} size={13} />
              <span style={{ fontSize: 8, color: V3.textGhost }}>▼</span>
            </span>
            {open ? (
              <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 5, zIndex: 30, display: 'flex', flexDirection: 'column', minWidth: 132, padding: 4, gap: 2, borderRadius: 7, background: '#ffffff', border: `1px solid ${V3.cardBorder}`, boxShadow: '0 10px 26px rgba(16,24,40,.14)' }}>
                {rows.map((r) => (
                  <span
                    key={r.tier}
                    onClick={() => { setPickedTier(r.tier); setPickedWeapon(null); setOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap', background: r.tier === tier ? 'rgba(91,141,255,.14)' : 'transparent' }}
                  >
                    <TierText division={r.tier} leagueCategory={data.league.category} size={12} />
                    <div style={spacerStyle} />
                    <span style={{ fontSize: 11, color: r.games > 0 ? V3.textFaint : '#b6bece' }}>{fmt(r.games)}판</span>
                  </span>
                ))}
              </span>
            ) : null}
          </span>
          {weaponChips}
        </div>
      ) : null}

      {/* 2 · 신원 */}
      <div className="v3-phead-id" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 13, padding: '4px 18px 14px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
          <MarkCircle clan={data.clan} size={46} ring={theme} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', color: theme.deep, textShadow: `0 0 16px ${theme.main}80`, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{data.player.name}</span>
              {weapon !== null ? (
                <span style={{ fontSize: 11, color: V3.textMuted, border: `1px solid ${V3.chipBorder}`, borderRadius: V3.radiusChip, background: V3.chip, padding: '3px 8px', whiteSpace: 'nowrap' }}>{WEAPON_LABEL[weapon]}</span>
              ) : null}
              {/*
               * ★깃발★ (2026-09-15 사장님: «그 깃발을 개인기록에 깃발 5개 이런식으로
               *   표시해주면 좋겠어»). 하루 1등으로 정상에 꽂은 횟수다.
               *   ★0 이면 줄을 안 그린다★ — 「깃발 0개」 는 보여 줄 것이 아니다.
               *   다섯 개까지는 깃발을 늘어놓고, 넘으면 «🚩 7» 로 센다.
               */}
              {data.flags <= 0 ? null : (
                <span
                  title={`깃발 ${data.flags}개`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, letterSpacing: 1, whiteSpace: 'nowrap', flex: 'none' }}
                >
                  {'🚩'.repeat(Math.min(data.flags, 5))}
                  {data.flags > 5 ? <span style={{ fontSize: 11, fontWeight: 700, color: V3.gold, letterSpacing: 0 }}>{data.flags}</span> : null}
                </span>
              )}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, color: '#767f96', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ color: theme.deep, fontWeight: 500 }}>{data.clan?.name ?? '무소속'}</span>
              {/*
                ⚠ ★2026-09-15 밤 — 순위를 여기서 뺐다★ (무한 QA).
                  같은 카드 안에 «4위 / 137명» 이 ★두 번★ 있었다 — 이름 줄과 아래 KPI 칸.
                  이름 줄은 «누구인가» 만 말하게 두고, 순위는 ★승률·킬뎃과 나란한 KPI★
                  한 곳으로 모은다. 거기서 크고, 옆 숫자와 견주기도 좋다.
                  되돌리려면 `RANK_ON_NAME_LINE` 을 `true` 로 (`CLAUDE.md` 1-4).
              */}
              {RANK_ON_NAME_LINE && rank !== null ? (
                <>
                  <span style={{ color: '#b6bece' }}>·</span>
                  {/* ★비율 색★ — 표와 같은 규칙 (2026-09-17 무한 QA) */}
                  <RankText rank={rank} color={rankColorOf(rank, rankTotal) ?? V3.textMuted} />
                  {rankTotal !== null ? <span style={{ color: V3.textGhost2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>/ {fmt(rankTotal)}명</span> : null}
                </>
              ) : null}
            </span>
          </span>
        </span>
        <LeagueCenter name={data.league.name} season={seasonLabel} />
        <span className="v3-phead-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
          {/*
            * ⚠ ★래더를 안 주는 리그는 점수 칸을 통째로 안 그린다★ (2026-09-14 사장님:
            *   «IPL (…) ★래더시스템 미제공★» · «아직도 IPL에 층수가 나와있고»).
            *   표·포디움은 이미 계약을 보고 있었는데 ★머리 카드만 안 보고★ «34.8층» 을
            *   그리고 있었다. 점수 계산은 그대로 돈다 — 순위를 세우는 데 쓴다.
            *   ★순위(«1위 / 836명»)는 남긴다★ — 사장님: «개인랭킹도 은글슬쩍 유지해».
            */}
          {!showsRating ? null : (
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
            {/* ★층수마다 색★ (2026-09-11 사장님). 아직 못 잰 «측정 중» 은 흐린 글자 그대로 */}
            {/* ⚠ ★2026-09-21 — 랭킹과 같은 값·같은 말★ — 「31.2층 / 실력 점수」 가 아니라
                ★「3,864점 / 래더」★ 다. 3부 원본과 같은 표기이고, 「층」 은 사장님이
                9/15 에 「티어의 흔적」 이라 부르신 말이다 */}
            <span style={{ fontSize: 21, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>
              {PLAYER_CARD_RANK_BY === 'ladder'
                ? formatRatingPoint(data.rating)
                : hex?.score !== null && hex?.score !== undefined
                  ? formatRating(hex.score)
                  : hex
                    ? '측정 중'
                    : formatRating(data.rating)}
            </span>
            <span style={{ fontSize: 10, color: V3.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
              {PLAYER_CARD_RANK_BY === 'ladder'
                ? '래더'
                : hex?.score !== null && hex?.score !== undefined
                  ? '실력 점수'
                  : hex
                    ? `${fmt(hex.games)}판`
                    : '래더'}
            </span>
            {/* ★미참여 감점★ (2026-09-11 사장님) */}
            {(data.activity_penalty ?? 0) > 0 ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#c81e28', whiteSpace: 'nowrap' }}>미참여 −{Math.round(data.activity_penalty as number)}점</span>
            ) : null}
          </span>
          )}
          {data.clan?.is_official_clan ? <OfficialPill theme={theme} /> : null}
          {/*
           * ★병영수첩 바로가기★ (2026-09-16 사장님: «카드옆에 병영수첩바로가기
           *   버튼만들어 거기에 해당선수 병영수첩을 넣어서 누르면 거기로 넘어가게»).
           *
           *   ★밖으로 나가는 길이라 새 창★ — 우리 화면을 덮으면 보던 기록을 잃는다.
           *   ★이어 붙은 계정이 없으면 안 그린다★ — 닉으로 찾아가면 위장닉 때문에
           *   엉뚱한 사람에게 간다 (D-221). 지어내지 않는다.
           */}
          {barracksHref === null ? null : (
            <a
              href={barracksHref}
              target="_blank"
              rel="noreferrer"
              title="넥슨 병영수첩에서 이 선수 보기"
              style={{
                fontSize: 11.5,
                color: '#5c6479',
                border: '1px solid #dde1eb',
                borderRadius: V3.radiusCtl,
                background: '#e5e7ec',
                padding: '6px 13px',
                whiteSpace: 'nowrap',
                textDecoration: 'none',
              }}
            >
              병영수첩 ↗
            </a>
          )}
          <GhostButton href={infoHref}>기본정보</GhostButton>
          {/*
            ★정보갱신★ (2026-09-21 사장님: 「그리규 ★정보갱신 버튼을 여기에도★ 만들어」)
            누르면 그 자리에서 병영을 읽어 ★닉네임과 소속★ 을 고친다.
            ⚠ 손잡이를 안 주면 안 그린다 — 있는 척하지 않는다.
          */}
          {onRenew === undefined ? null : (
            <button
              type="button"
              onClick={onRenew}
              disabled={renewing === true}
              style={{
                fontSize: 11.5,
                color: renewing === true ? '#5c6479' : '#5c6479',
                border: '1px solid #dde1eb',
                borderRadius: V3.radiusCtl,
                background: '#e5e7ec',
                padding: '6px 13px',
                whiteSpace: 'nowrap',
                cursor: renewing === true ? 'wait' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {renewing === true ? '갱신중…' : '정보갱신'}
            </button>
          )}
        </span>
      </div>

      {/*
       * ★특성 배지★ (2026-09-12 사장님: «빈 공간에 뱃지 있는 선수는 여기에 진열해줘»).
       * 열 위 안에 든 축만 배지를 받는다 — 아래 STRENGTH POINT 카드가 쓰는 것과 ★같은 값★ 이다.
       * 배지가 없는 선수는 이 줄 자체가 안 그려져 카드가 길어지지 않는다.
       */}
      {badges.length > 0 ? (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '0 18px 12px' }}>
          <span style={{ fontSize: 9.5, color: V3.textGhost2, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>특성</span>
          {/*
            * ★배지 그림★ (2026-09-17 사장님) — 사장님이 주신 일곱 장을 그대로 쓴다.
            *   ⚠ 여기는 `leagueSlug` 가 없어 ★링크를 안 건다★ — 없는 슬러그를 지어내지 않는다.
            *     누르는 것은 상세 카드(`PlayerDetailV3`)와 랭킹 표에서 된다.
            */}
          {badges.map((a) => {
            const art = hex?.weapon === null || hex?.weapon === undefined ? null : badgeOfAxis(a.key, hex.weapon)
            /*
             * ★배지는 상위 2% 안에만★ · ★그중 TOP 5 는 금빛으로 빛난다★ (2026-09-18 사장님).
             *   got  배지를 땄나 (계약이 이름을 채워 준 것)
             *   glow 그중에서도 TOP 5 인가 — 테두리와 그림자가 한 단계 더 세진다
             */
            const got = a.badge !== null
            const glow = got && a.badge_glow === true
            return (
              <span key={a.key} title={a.desc ?? undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px 3px 6px', borderRadius: 999, whiteSpace: 'nowrap', background: got ? 'linear-gradient(100deg,rgba(255,216,61,.16),rgba(255,216,61,.04))' : 'rgba(16,24,40,.03)', border: got ? '1px solid rgba(255,216,61,.5)' : '1px solid rgba(16,24,40,.08)' }}>
                {art === null ? null : <img src={badgeArtSmallPath(art)} alt="" width={28} height={28} style={{ width: 28, height: 28, display: 'block', filter: glow ? 'drop-shadow(0 0 7px rgba(255,216,61,1))' : got ? 'drop-shadow(0 0 3px rgba(255,216,61,.8))' : 'grayscale(1) opacity(.55)' }} />}
                <span style={{ fontSize: 11, fontWeight: 700, color: got ? '#8a6a12' : '#767f96' }}>{art?.label ?? a.badge ?? a.label}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: got ? '#8a6a12' : '#96a0b5' }}>{a.rank}위</span>
              </span>
            )
          })}
        </div>
      ) : null}
      {/*
        ★PC 는 왼쪽에 그림 · 오른쪽에 숫자★ (2026-09-12 사장님:
        «Pc버전에서 왼쪽 정보들 오른쪽에 몰아넣고 공간 만들어서 저기도 플레이분석 그래프 만들어줘»).

        카드 가운데가 통째로 비어 있었다. 숫자 줄을 오른쪽으로 몰고 그 자리에 여섯 축을 넣는다.
        ★폰은 한 글자도 안 바뀐다★ — 아래 두 상자는 900px 미만에서 그냥 위아래로 쌓인다
        (`.v3-phead-body` 는 900px 이상에서만 두 칸이 된다).
      */}
      <div className="v3-phead-body">
      {axes.length > 0 ? (
        <div className="v3-phead-hex" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 340 }}>
          {/*
            ⚠ ★2026-09-22 — 위에 그래프, 아래에 육각형★ (사장님, 서플라이 실측 사진).
            서플라이는 이 자리에 세로 광고를 쌓는다 — 우리는 그 자리에 우리 기능을 쌓는다.
            ★옛 판(육각형 하나 · 392px)은 지우지 않는다★ (`CLAUDE.md` 1-4) — 되돌리려면
            아래 두 줄만 걷어내고 `size={392}` 로 되돌리면 된다.
              <Hexagon axes={axes} id={`pheadHex-${data.player.id}`} size={392} />
            ⚠ 광고 자리 폭을 넘지 않는다는 지시라 ★칸 폭을 340px 로 줄였다★ (옛 392px).
          */}
          <PlayerHexTrend data={data} />
          {/*
            ★크게★ (2026-09-21 사장님: 「왼쪽에 ★더 크게★ 육각그래프」) — 그래프가 새로
            생긴 만큼 340px 로 한 단만 줄였다. 옛 값 392.
            ⚠ 이 칸은 ★900px 이상에서만 보인다★ (`.v3-phead-hex` 가 폰에서 `display:none`) —
              그래서 폰 걱정 없이 키울 수 있다.
          */}
          <Hexagon axes={axes} id={`pheadHex-${data.player.id}`} size={340} />
        </div>
      ) : null}
      <div className="v3-phead-stats">
      {/*
        ★★3 · 승률 · 스나킬뎃 · 라플킬뎃 · 순위★★ (2026-09-20 사장님)
        > 「여기 오른쪽에 승률 스나 라플 이렇게 만들고 스나수는 스나킬뎃은 원래대로
        >  라플킬뎃은 어둡게(불꺼진것처럼) 그리고 킬뎃밑에 판킬을 적지말고
        >  판수를 각각 적어줘 50.8%밑에 18판 이런식으로」

        ── 왜 둘 다 보여 주나
          옛 판은 ★고른 무기의 킬뎃 하나★ 만 보여 줬다. 그래서 선수 페이지의
          통합 킬뎃과 숫자가 달라 ★「왜 자꾸 다르냐」★ 는 말이 나왔다.
          ★둘을 나란히 놓으면 무엇을 보고 있는지가 저절로 드러난다.★

        ── ★주무기가 밝고 나머지는 어둡다★
          이 선수가 ★무엇으로 싸우는 사람인지★ 를 색으로 말한다. 값은 둘 다 있다 —
          감추는 것이 아니라 ★어느 쪽이 본업인지★ 를 밝히는 것이다.
      */}
      <div className="v3-phead-kpi" style={{ position: 'relative', display: 'grid', gridTemplateColumns: showsKd ? 'repeat(4,minmax(0,1fr))' : 'repeat(3,minmax(0,1fr))', borderTop: '1px solid #edeff4' }}>
        {/*
          ★★PC 는 세로 배열★★ (2026-09-21 사장님: 「오른쪽에 ★래더 포지션 승률 킬뎃
            판킬 mvp 순위 핵의심★ 이 순서로 세로 배열 해줘 좀 잘 보이고 한눈에 들어오게」)

          ── ★폰은 지금 그대로다★
            육각형이 폰에서는 안 나오므로 「왼쪽 그림 · 오른쪽 세로」 는 ★PC 이야기★ 다.
            아래 세 칸(`v3-kpi-pconly`)은 ★900px 이상에서만★ 나온다 — 폰의 네 칸 격자를
            일곱 칸으로 만들면 줄이 어긋난다.
          ── 세로로 눕히는 일은 CSS 가 한다 (`tokens.css` 의 `.v3-phead-body .v3-phead-kpi`).
        */}
        <Kpi
          className="v3-kpi-pconly"
          label="래더"
          value={showsRating ? formatRatingPoint(data.rating) : '-'}
          sub={null}
          /* ★숫자에 색★ (2026-09-21 사장님) — 등수 색을 따른다. 잘하는 사람은 눈에 띈다 */
          color={(rank === null ? null : rankColorOf(rank, rankTotal)) ?? V3.textStrong}
        />
        <Kpi
          className="v3-kpi-pconly"
          label="포지션"
          value={weapon === null ? '-' : weapon === 1 ? '스나' : '라플'}
          sub={
            sel === null
              ? null
              : weapon === 1
                ? `${fmt(sel.sniper_games)}판`
                : weapon === 0
                  ? `${fmt(sel.rifle_games)}판`
                  : null
          }
          color={weapon === null ? V3.textMuted : V3.textStrong}
        />
        <Kpi
          label="승률"
          value={pct1(winRate)}
          sub={win === null || lose === null ? null : `${fmt(win)}승 ${fmt(lose)}패`}
          color={winRate === null ? V3.textMuted : statColor(winRate)}
        />
        {/* 킬데스를 안 주는 리그는 ★판수★ 가 이 자리를 받는다 — 칸을 비우면 3열 격자가 무너진다 (2026-09-14) */}
        {/*
          ★★킬뎃은 통합 한 줄 · 누르면 갈라진다★★ (2026-09-21 사장님:
            「★킬뎃을 통합킬뎃으로 라플 스나 합친거 써놓고 누르면 스나킬뎃 라플킬뎃
             분리해서 볼 수 있게끔★ 설계해줘」)

          ── 왜 합치나
            옛 판은 ★스나·라플 두 줄★ 이 늘 펼쳐져 있었다. 한 무기만 쓰는 사람에게는
            ★빈 줄 하나가 늘 자리를 먹었고★, 통합 킬뎃은 ★어디에도 없었다★ —
            선수 페이지의 통합 킬뎃과 숫자가 달라 보이는 까닭이 그것이었다.

          ── ★값을 감추는 것이 아니다★
            눌러서 펼치면 스나·라플이 그대로 나온다. 접었을 때는 ★통합★ 하나다.
        */}
        {showsKd ? (
          <KdCell
            kd={sel === null ? null : sel.kd}
            /* ★통합 킬/데스는 스나+라플 합★ — 합계 칸이 따로 없다 */
            kill={sel === null ? null : sel.sniper_kill + sel.rifle_kill}
            death={sel === null ? null : sel.sniper_death + sel.rifle_death}
            games={sel === null ? null : sel.games}
            sniper={
              sel === null
                ? null
                : { kd: sel.sniper_kd, games: sel.sniper_games, kill: sel.sniper_kill, death: sel.sniper_death }
            }
            rifle={
              sel === null
                ? null
                : { kd: sel.rifle_kd, games: sel.rifle_games, kill: sel.rifle_kill, death: sel.rifle_death }
            }
            weapon={weapon === 0 || weapon === 1 ? weapon : null}
          />
        ) : (
          <Kpi
            label="판수"
            value={sel === null ? '-' : `${fmt(sel.games)}판`}
            sub={win === null || lose === null ? null : `${fmt(win)}승 ${fmt(lose)}패`}
            color={sel === null ? V3.textMuted : V3.textStrong}
          />
        )}
        {/* ⚠ ★옛 두 줄 판은 지우지 않았다★ (`CLAUDE.md` 1-4) — `KD_SPLIT_ALWAYS` 를
            `true` 로 두면 아래가 그대로 돌아온다 */}
        {KD_SPLIT_ALWAYS && showsKd ? (
          <>
            {/* ★스나★ — 주무기면 밝게, 아니면 불 꺼진 것처럼 */}
            <Kpi
              label="스나 킬뎃"
              value={pct1(sel?.sniper_kd ?? null)}
              /* ★킬/데스를 작게 같이 적는다★ (2026-09-21 사장님: 「킬/데스 승/패 숫자도
                 아예 안들어감 ★작게 들어가야하는데★」). 원본 3부 카드가 그렇게 적는다 */
              sub={
                sel === null
                  ? null
                  : `${fmt(sel.sniper_games)}판 · ${fmt(sel.sniper_kill)}킬 ${fmt(sel.sniper_death)}데스`
              }
              color={
                sel?.sniper_kd === null || sel?.sniper_kd === undefined
                  ? DIM
                  : weapon === 1
                    ? statColor(sel.sniper_kd)
                    : DIM
              }
            />
            {/* ★라플★ — 같은 규칙 */}
            <Kpi
              label="라플 킬뎃"
              value={pct1(sel?.rifle_kd ?? null)}
              sub={
                sel === null
                  ? null
                  : `${fmt(sel.rifle_games)}판 · ${fmt(sel.rifle_kill)}킬 ${fmt(sel.rifle_death)}데스`
              }
              color={
                sel?.rifle_kd === null || sel?.rifle_kd === undefined
                  ? DIM
                  : weapon === 0
                    ? statColor(sel.rifle_kd)
                    : DIM
              }
            />
          </>
        ) : null}
        {/* 2026-09-11 사장님: 판킬 자리에 ★순위★ */}
        {/*
         * ⚠ ★2026-09-17 — 보조 문구를 「/ 138명」 에서 「138명 중」 으로★ (무한 QA).
         *   옛 문구는 라벨 바로 옆에 «순위  / 138명» 으로 붙어 ★슬래시 앞이 빈 칸★ 으로 보였다 —
         *   등수가 빠진 것처럼 읽힌다. 값(«1위»)은 아래 큰 글자에 따로 있어 슬래시가 이을 짝이 없다.
         *   ★숫자는 한 글자도 안 바뀐다★ — 138 은 그대로다.
         *   옛 문구가 필요하면 아래 `RANK_SUB_V1` 을 쓴다 (`CLAUDE.md` 1-4).
         */}
        <Kpi
          className="v3-kpi-pconly"
          label="판킬"
          value={perMatch === null ? '-' : perMatch.toFixed(1)}
          sub={null}
          /* ⚠ ★판킬에는 색을 넣지 않는다★ (2026-09-21 사장님: 「판킬에는 색깔 넣지마」).
               킬뎃·승률과 달리 ★잘하고 못하고의 기준이 없다★ — 라플수는 원래 판킬이 높다 */
          color={perMatch === null ? V3.textMuted : V3.textStrong}
        />
        <Kpi
          label="순위"
          value={rank === null ? '-' : `${fmt(rank)}위`}
          sub={rankTotal === null ? null : rankSub(rankTotal)}
          color={rank === null ? V3.textMuted : rankColorOf(rank, rankTotal) ?? V3.textStrong}
        />
      </div>

      {/*
       * 4 · MVP · 핵의심
       *
       * ⚠ ★2026-09-17 — 라벨과 값을 붙였다★ (무한 QA · 사장님: «한눈에 들어오는건
       *   굳이 새로 배열해서 떨어뜨려서 빈공간을 만들어 왜»).
       *
       *   옛 판은 라벨과 값 사이에 `spacerStyle`(flex:1)이 있었다 — PC 1440px 에서
       *   반 칸이 ★400px★ 이라 «핵의심» 과 «2 회» 가 ★350px 떨어져★ 섰다.
       *   어느 값이 어느 라벨의 것인지 눈으로 이을 수 없었다.
       *   이제 라벨 바로 뒤에 값이 온다. ★값은 하나도 안 없앴다★ — 자리만 좁혔다.
       *   옛 모습이 필요하면 `FOOT_SPREAD` 를 `true` 로 (`CLAUDE.md` 1-4).
       */}
      <div className="v3-phead-foot" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', borderTop: `1px solid ${V3.rowDivider}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRight: `1px solid ${V3.rowDivider}`, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: V3.gold, whiteSpace: 'nowrap' }}>★</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: V3.textFaint, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>MVP</span>
          {FOOT_SPREAD ? <div style={spacerStyle} /> : null}
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: (sel?.mvp ?? 0) > 0 ? '#8a6a12' : V3.textGhost }}>{fmt(sel?.mvp ?? 0)}</span>
            <span style={{ fontSize: 10.5, color: V3.textDim }}>회</span>
            <span style={{ fontSize: 11.5, color: mvpRate === null || mvpRate === 0 ? V3.textGhost : '#8a6a12' }}>{mvpRate === null ? '-' : `${mvpRate.toFixed(1)}%`}</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', minWidth: 0 }}>
          <span style={{ fontSize: 13, lineHeight: 1, flex: 'none' }}>🚨</span>
          <span
            onClick={report && !report.pending ? report.onReport : undefined}
            style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: report?.reported ? '#ff6b6b' : '#b3555c', cursor: report ? (report.pending ? 'wait' : 'pointer') : 'default' }}
          >
            핵의심
          </span>
          {FOOT_SPREAD ? <div style={spacerStyle} /> : null}
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: (report?.reported ? report.count : data.report_count) > 0 ? '#ff6b6b' : V3.textGhost }}>{fmt(report?.reported ? report.count : data.report_count)}</span>
            <span style={{ fontSize: 10.5, color: V3.textDim }}>회</span>
          </span>
        </div>
      </div>
      {report?.message ? <div style={{ position: 'relative', padding: '0 20px 9px', fontSize: 10.5, color: V3.textDim }}>{report.message}</div> : null}
      </div>
      </div>
    </section>
  )
}
