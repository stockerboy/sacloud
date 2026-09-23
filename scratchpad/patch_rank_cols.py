# -*- coding: utf-8 -*-
# ①-4 명단 칸 정리 (2026-09-23 사장님): 플레이어 · 순위(개인랭킹) · kda · 세이브(n회) · 포지션. 래더·딜량·헤드샷 칸 삭제.
import io, re

def patch(path, edits):
    s = io.open(path, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for old, new in edits:
        assert s.count(old) == 1, ('need exactly one', path, old[:90], s.count(old))
        s = s.replace(old, new)
    if crlf:
        s = s.replace('\n', '\r\n')
    io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('ok', path)

# ── 계약 ──────────────────────────────────────────────────────────────────
patch('packages/contract/src/entities/match.ts', [
    ("""  nameplate: z.enum(['fire', 'dark', 'light']).nullable().optional(),
""", """  nameplate: z.enum(['fire', 'dark', 'light']).nullable().optional(),
  /**
   * ★리그 개인랭킹 순위★ (2026-09-23 사장님: 명단 칸 「순위(래더x)」 — 예: 128위).
   *
   * 랭킹 목록·선수 페이지의 `playerRankOf` 와 ★같은 모집단·같은 정렬★ 이다
   * (점수 있음 + 판수 문턱 · 래더 내림차순 · 동률은 id). 그래서 랭킹 1위는 여기서도 1위다.
   * 문턱 미달·배치고사·집계 전이면 `null` — 화면은 「-」. 지어내지 않는다 (D-106).
   * 경기 ★상세★ 에서만 채운다 — 목록은 `null`.
   */
  league_rank: Count.nullable().default(null),
"""),
])

# ── 서버 ──────────────────────────────────────────────────────────────────
patch('apps/web/lib/server/queries/matches.ts', [
    ("""import { prisma, type Prisma } from '@sacloud/db'""",
     """import { prisma, Prisma } from '@sacloud/db'"""),
    ("""import { withSeasonWindow } from './season0Scope'""",
     """import { withSeasonWindow } from './season0Scope'
/* 명단 「순위」 칸의 판수 문턱 — 랭킹 목록·`playerRankOf` 와 같은 값 (2026-09-23) */
import { rankMinGamesOf } from '@sacloud/contract'"""),
    ("""    saves: null,
""", """    saves: null,
    league_rank: null,
"""),
    ("""  const [clans, now, positionsResolved, saveRows, hexRows, plateRows, plateCuts, weaponRows, hexV2] = await Promise.all([""",
     """  const [clans, now, positionsResolved, saveRows, hexRows, plateRows, plateCuts, weaponRows, hexV2, leagueRankRows] = await Promise.all(["""),
    ("""    softFail('match-hexagon-v2', null, { matchId: match.id })(
      matchClanHexV2(match.id, {
        redLeagueClanId: match.redLeagueClanId,
        blueLeagueClanId: match.blueLeagueClanId,
      }),
    ),
  ])
""", """    softFail('match-hexagon-v2', null, { matchId: match.id })(
      matchClanHexV2(match.id, {
        redLeagueClanId: match.redLeagueClanId,
        blueLeagueClanId: match.blueLeagueClanId,
      }),
    ),
    /*
     * ★명단 「순위」 칸★ (2026-09-23 사장님) — 열 명의 개인랭킹 등수를 ★한 질의★ 로.
     * `playerRankOf`(leagues.ts) 와 ★같은 모집단·같은 정렬★ 이다 — 점수 있음 + 판수 문턱 · 래더 내림차순 · 동률은 id.
     * 배치고사 중인 사람은 등수를 안 준다 (같은 규칙). 실패해도 상세를 죽이지 않는다 — 그때는 「-」.
     */
    playerIds.length === 0
      ? Promise.resolve([] as { playerId: string; rank: number }[])
      : softFail('match-league-rank', [] as { playerId: string; rank: number }[], { matchId: match.id })(
          prisma.$queryRaw<{ playerId: string; rank: number }[]>`
            SELECT r."playerId", r."rank"
              FROM (
                SELECT lp."playerId" AS "playerId",
                       lp."placement" AS "placement",
                       ROW_NUMBER() OVER (ORDER BY lp."rating" DESC, h."leaguePlayerId" ASC)::int AS "rank"
                  FROM "LeaguePlayerHex" h
                  JOIN "LeaguePlayer" lp ON lp."id" = h."leaguePlayerId"
                 WHERE lp."leagueId" = ${leagueId}
                   AND h."weapon" IS NOT NULL
                   AND h."score" IS NOT NULL
                   AND h."games" >= ${rankMinGamesOf(null)}
              ) r
             WHERE r."playerId" IN (${Prisma.join(playerIds)})
               AND r."placement" = false
          `,
        ),
  ])
  const leagueRankOf = new Map(leagueRankRows.map((row) => [row.playerId, row.rank]))
"""),
    ("""        nameplate: plateByPlayer.get(stat.playerId) ?? null,
""", """        nameplate: plateByPlayer.get(stat.playerId) ?? null,
        league_rank: leagueRankOf.get(stat.playerId) ?? null,
"""),
])

# ── mock ──────────────────────────────────────────────────────────────────
patch('packages/mock/src/store.ts', [
    ("""    save_chances: null,
""", """    save_chances: null,
    league_rank: null,
"""),
])

# ── 클랜 화면 스코어보드 (경기 상세 · 경기 목록도 이걸 쓴다) ──────────────────
patch('packages/ui/src/v3/ClanDetailV3.tsx', [
    ("""const playerRowStyle: CSSProperties = { position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(96px,1fr) 86px 58px 22px', gap: 8,""",
     """/* 2026-09-23 사장님 ①-4 — 칸은 「플레이어 · 순위 · kda · 세이브 · 포지션」. 옛 칸(순위 없음): 'minmax(96px,1fr) 86px 58px 22px' */
const playerRowStyle: CSSProperties = { position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(96px,1fr) 44px 86px 58px 22px', gap: 8,"""),
    ("""...(showSaves ? { gridTemplateColumns: 'minmax(96px,1fr) 86px 44px 58px 22px' } : {})""",
     """...(showSaves ? { gridTemplateColumns: 'minmax(96px,1fr) 44px 86px 44px 58px 22px' } : {})"""),
    ("""      <span style={{ position: 'relative' }}><Kda kill={row.kill} death={row.death} assist={row.assist} size={17} /></span>
      {showSaves ? <span style={{ position: 'relative', textAlign: 'right', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', color: (row.saves ?? 0) >= 3 ? V3.cyan : (row.saves ?? 0) > 0 ? V3.textMuted : '#b6bece' }}>{row.saves === null ? '-' : `${row.saves}/${row.save_chances ?? 0}`}</span> : null}""",
     """      {/* ★순위★ — 리그 개인랭킹 등수 (2026-09-23 사장님 「순위(래더x)」). 모르면 「-」 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: row.league_rank === null ? '#767f96' : '#96a0b5' }}>{row.league_rank === null ? '-' : `${row.league_rank}위`}</span>
      <span style={{ position: 'relative' }}><Kda kill={row.kill} death={row.death} assist={row.assist} size={17} /></span>
      {/* ★세이브 「2회」★ (2026-09-23 사장님 — 「2/4」 말고 「2회」 · 0 이면 「0회」). 옛 표기: `${row.saves}/${row.save_chances ?? 0}` */}
      {showSaves ? <span style={{ position: 'relative', textAlign: 'right', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', color: (row.saves ?? 0) >= 3 ? V3.cyan : (row.saves ?? 0) > 0 ? V3.textMuted : '#b6bece' }}>{row.saves === null ? '-' : `${row.saves}회`}</span> : null}"""),
    ("""          <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'} style={{ display: 'grid', gridTemplateColumns: showSaves ? 'minmax(96px,1fr) 86px 44px 58px' : 'minmax(96px,1fr) 86px 58px', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${V3.rowDivider}`, fontSize: 9.5, color: '#b6bece', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
            <span>플레이어</span><span>K / D / A</span>{showSaves ? <span style={{ textAlign: 'right' }}>세이브</span> : null}<span style={{ textAlign: 'right' }}>포지션</span><span />
          </div>""",
     """          <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'} style={{ display: 'grid', gridTemplateColumns: showSaves ? 'minmax(96px,1fr) 44px 86px 44px 58px' : 'minmax(96px,1fr) 44px 86px 58px', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${V3.rowDivider}`, fontSize: 9.5, color: '#b6bece', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
            <span>플레이어</span><span style={{ textAlign: 'right' }}>순위</span><span>kda</span>{showSaves ? <span style={{ textAlign: 'right' }}>세이브</span> : null}<span style={{ textAlign: 'right' }}>포지션</span><span />
          </div>"""),
])

# ── 701px+ 격자 (supply-skin.css) — 순위 칸 40px 추가 ──────────────────────
patch('packages/ui/src/v2/supply-skin.css', [
    ("""  .v3-score-row { grid-template-columns: minmax(96px, 1fr) 84px 46px 0px !important; }
  .v3-score-row--saves { grid-template-columns: minmax(96px, 1fr) 84px 38px 46px 0px !important; }""",
     """  /* 2026-09-23 오후 — 「순위」 칸 40px 이 둘째로 들어왔다 (사장님 ①-4). 옛 값: 84 46 0 · 84 38 46 0 */
  .v3-score-row { grid-template-columns: minmax(96px, 1fr) 40px 84px 46px 0px !important; }
  .v3-score-row--saves { grid-template-columns: minmax(96px, 1fr) 40px 84px 38px 46px 0px !important; }"""),
])

# ── 선수 화면 스코어보드 (SUPPLY_SCORE_COLUMNS) ─────────────────────────────
p = 'packages/ui/src/v3/PlayerDetailV3.tsx'
s = io.open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')

def rep(old, new):
    global s
    assert s.count(old) == 1, ('need exactly one', p, old[:90], s.count(old))
    s = s.replace(old, new)

rep("""/** 폰/PC 칸 갈아 끼우기 — 한 군데에만 적는다 (머리줄과 줄이 같은 격자를 써야 칸이 맞는다) */
const SB_COLS_PC = 'minmax(92px,1fr) 66px 92px 64px 104px 66px'
const SB_COLS_PHONE = 'minmax(84px,1fr) 88px 46px 88px'""",
    """/** 폰/PC 칸 갈아 끼우기 — 한 군데에만 적는다 (머리줄과 줄이 같은 격자를 써야 칸이 맞는다)
 * 2026-09-23 오후 사장님 ①-4 — 「플레이어 · 순위 · kda · 세이브 · 포지션」 다섯 칸. 클랜 화면 스코어보드와 같은 폭.
 * ⚠ 옛 여섯 칸(래더·kda·무기·딜량·헤드샷)의 격자: PC 'minmax(92px,1fr) 66px 92px 64px 104px 66px' · 폰 'minmax(84px,1fr) 88px 46px 88px' (`ScoreRowSupplySix`) */
const SB_COLS_PC = 'minmax(92px,1fr) 44px 86px 40px 50px'
const SB_COLS_PHONE = 'minmax(80px,1fr) 40px 78px 36px 46px'""")

# 머리줄
rep("""              <span>플레이어</span>
              <span className="sac-sb-pc-only" style={{ textAlign: 'right' }}>래더</span>
              <span style={{ textAlign: 'center' }}>kda</span>
              <span style={{ textAlign: 'center' }}>무기</span>
              <span style={{ textAlign: 'center' }}>딜량</span>
              <span className="sac-sb-pc-only" style={{ textAlign: 'center' }}>헤드샷</span>""",
    """              {/* 2026-09-23 오후 사장님 ①-4 — 순위·kda·세이브·포지션. 옛 머리(래더·kda·무기·딜량·헤드샷)는 `ScoreRowSupplySix` 주석 참조 */}
              <span>플레이어</span>
              <span style={{ textAlign: 'right' }}>순위</span>
              <span style={{ textAlign: 'center' }}>kda</span>
              <span style={{ textAlign: 'right' }}>세이브</span>
              <span style={{ textAlign: 'right' }}>포지션</span>""")

# 옛 여섯 칸 줄은 이름만 바꿔 남긴다
rep("""function ScoreRow({ row, me, mvp, weaponKnown, leagueSlug, side, maxDamage }: { row: MatchPlayerStat; me: boolean; mvp: boolean; weaponKnown: boolean; leagueSlug: string; side: 'red' | 'blue'; maxDamage: number }) {
  /* ★열림은 줄마다 따로★ — 다른 줄을 눌러도 안 접힌다 (2026-09-15 사장님) */""",
    """/**
 * ★명단 한 줄 — 다섯 칸★ (2026-09-23 오후 사장님 ①-4):
 *   플레이어 · 순위(리그 개인랭킹 · 모르면 「-」) · kda · 세이브(「2회」 · 0 이면 「0회」) · 포지션(라플수/스나수/알수없음)
 * 딜량·헤드샷·래더 칸은 뺐다 — 「알수없음」 글자가 화면에서 사라져야 한다는 지시.
 * ⚠ 옛 여섯 칸 줄은 바로 아래 `ScoreRowSupplySix` 로 ★그대로 남겼다★ (`CLAUDE.md` 1-4).
 */
function ScoreRow({ row, me, mvp, weaponKnown, leagueSlug, side }: { row: MatchPlayerStat; me: boolean; mvp: boolean; weaponKnown: boolean; leagueSlug: string; side: 'red' | 'blue' }) {
  const [openHex, setOpenHex] = useState(false)
  const hex = row.hexagon ?? []
  const sniper = weaponKnown && row.weapon === 1
  const clan = row.match_time_clan
  return (
    <>
    <div className="v3-score-row sac-sb-row" style={{ position: 'relative', overflow: 'hidden', padding: '8px 12px', minHeight: 44, borderBottom: `1px solid ${V3.rowDivider2}`, background: me ? 'linear-gradient(100deg,rgba(143,240,255,.14),rgba(143,240,255,.04) 55%,transparent)' : 'transparent', boxShadow: me ? 'inset 3px 0 0 #0891b2' : 'none' }}>
      {SCORE_PLATE_ON && row.nameplate ? <span aria-hidden className={`v3-plate-row v3-plate-row--${row.nameplate}`} /> : null}
      {/* ① 플레이어 — ★클랜마크는 이름 앞에 항상★ */}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <MarkCircle clan={clan ? { slug: clan.slug, mark: clan.mark } : null} size={20} />
        {hex.length > 0 ? (
          <button
            type="button"
            aria-expanded={openHex}
            onClick={(e) => { e.stopPropagation(); setOpenHex((v) => !v) }}
            style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: me ? 700 : 500, color: me ? '#124a56' : V3.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px dotted ${openHex ? V3.blueSoft : 'rgba(120,136,170,.35)'}` }}
          >{row.name}</button>
        ) : (
          <a href={`/league/${leagueSlug}/player/${row.player_id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12.5, fontWeight: me ? 700 : 500, color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: me ? '#124a56' : V3.text }}>{row.name}</span>
          </a>
        )}
        {sniper ? <SniperMark /> : null}
        {mvp ? <MvpMark size={15} /> : null}
      </span>
      {/* ② 순위 — 리그 개인랭킹 등수. 문턱 미달·배치고사·집계 전이면 「-」 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: row.league_rank === null ? V3.textGhost : V3.textDim }}>{row.league_rank === null ? '-' : `${row.league_rank}위`}</span>
      {/* ③ kda — 「7 / 5 / 4」 밑에 「(58.3%)」 */}
      <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 }}>
        <Kda kill={row.kill} death={row.death} assist={row.assist} size={13} />
        {row.kd_rate === null ? null : (
          <span style={{ fontSize: 10, fontWeight: 600, color: statColor(row.kd_rate), whiteSpace: 'nowrap' }}>({row.kd_rate.toFixed(1)}%)</span>
        )}
      </span>
      {/* ④ 세이브 — 「2회」. 배틀로그 없으면 「-」 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: (row.saves ?? 0) >= 3 ? V3.cyan : (row.saves ?? 0) > 0 ? V3.textMuted : V3.textDim }}>{row.saves === null ? '-' : `${row.saves}회`}</span>
      {/* ⑤ 포지션 — 주무기(`main_weapon`). 그 판에 든 총이 아니다 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: row.main_weapon === null || row.main_weapon === undefined ? V3.textGhost : V3.textDim }}>
        {row.main_weapon === 1 ? '스나수' : row.main_weapon === 0 ? '라플수' : '알수없음'}
      </span>
    </div>
    {openHex ? (
      <PlayerMatchHexV3 axes={hex} name={row.name} side={side} href={`/league/${leagueSlug}/player/${row.player_id}`} />
    ) : null}
    </>
  )
}

/**
 * ⚠ ★옛 판 — 서플라이 여섯 칸 줄★ (2026-09-22 ~ 2026-09-23 낮). 지금은 안 부른다 — `ScoreRow`(다섯 칸)가 대신한다.
 *   되살리려면 `t.stats.map` 에서 이 이름으로 바꾸고 `SB_COLS_*` 를 위 주석의 옛 격자로 (`CLAUDE.md` 1-4).
 */
function ScoreRowSupplySix({ row, me, mvp, weaponKnown, leagueSlug, side, maxDamage }: { row: MatchPlayerStat; me: boolean; mvp: boolean; weaponKnown: boolean; leagueSlug: string; side: 'red' | 'blue'; maxDamage: number }) {
  /* ★열림은 줄마다 따로★ — 다른 줄을 눌러도 안 접힌다 (2026-09-15 사장님) */""")

# 부르는 곳 — maxDamage 는 이제 안 받는다
rep("""              <ScoreRow key={row.player_id} row={row} me={row.player_id === me} mvp={row.mvp === true} weaponKnown={row.weapon !== null} leagueSlug={leagueSlug} side={t.side} maxDamage={maxDamage} />""",
    """              <ScoreRow key={row.player_id} row={row} me={row.player_id === me} mvp={row.mvp === true} weaponKnown={row.weapon !== null} leagueSlug={leagueSlug} side={t.side} />""")

# 옛 줄이 안 쓰여도 typecheck(noUnusedLocals)가 안 깨지게
rep("""export function PlayerDetailV3(props: PlayerDetailV3Props) {""",
    """/* 옛 여섯 칸 줄은 지우지 않는다 — 안 부르는 동안 noUnusedLocals 를 피하려는 참조 */
void ScoreRowSupplySix

export function PlayerDetailV3(props: PlayerDetailV3Props) {""")

if crlf:
    s = s.replace('\n', '\r\n')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok', p)
