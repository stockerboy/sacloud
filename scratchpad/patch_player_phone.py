# -*- coding: utf-8 -*-
# 2026-09-23 오후 사장님:
#   「모바일에서 상세정보를 (머리 카드에) 넣어서 합쳐버리고 · 육각을 지난시즌 대신 넣어버려 ·
#    기존 상세정보랑 육각은 없애고 · 최근 같이한 플레이어는 PC·모바일 둘 다 없애」
# + 라운드 흐름 폰 죽은 차례 — 「다운」 글자를 빼서 이름 자리를 번다.
import io

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

# ── A. 라운드 흐름 폰 — 「다운」 빼기 ─────────────────────────────────────
patch('packages/ui/src/v3/RoundFlowChartV3.tsx', [
    ("""            {f.at === firstAt ? null : <span style={{ color: tone.textDim, fontSize: 11, flex: 'none' }}>다운</span>}""",
     """            {/* 폰은 두 칸이 좁아 「다운」 을 뺀다 — 이름이 「푸른살…」 로 잘리는 것보다 낫다 (2026-09-23 폰 캡쳐) */}
            {f.at === firstAt || phone ? null : <span style={{ color: tone.textDim, fontSize: 11, flex: 'none' }}>다운</span>}"""),
])

# ── B. 머리 카드 — 폰에서 상세정보 줄을 합친다 ───────────────────────────
patch('packages/ui/src/v3/PlayerHeaderV3.tsx', [
    ("""      {report?.message ? <div style={{ position: 'relative', padding: '0 20px 9px', fontSize: 10.5, color: V3.textDim }}>{report.message}</div> : null}
    </section>
  )
}""",
     """      {/*
        ★★폰 — 상세정보를 머리 카드에 합친다★★ (2026-09-23 오후 사장님:
          「모바일버전에서 상세정보를 빨간원 친 곳(이 카드)에 넣어서 합쳐버리고 · 기존에 있던 상세정보는 없애버리고」)

        PC 는 오른쪽 「상세정보」 카드(`PlayerDetailV3` 의 `SideInfoCard`)가 그대로다.
        이 줄들은 ★≤767px 에서만★ 보이고(supply-skin.css `.v3-phead-info-phone`), 그때 위 MVP·핵의심 두 칸 줄은 숨는다 —
        MVP·핵의심이 이 줄 안에 다시 들어 있어서다. 래더·소속은 카드 위쪽(점수 · 이름 밑 클랜)에 이미 있어 안 되풀이한다.
        말씨는 인계서 ③-10 대로 — 「판킬」 · MVP 「n판 중 k회」 · 핵의심 옆 신고 단추.
      */}
      <div className="v3-phead-info-phone" style={{ position: 'relative', borderTop: `1px solid ${V3.rowDivider}` }}>
        <PhoneInfoRow label="승률" sub={`${fmt(data.win)}승 ${fmt(data.lose)}패`}>
          <b style={{ fontSize: 21, fontWeight: 700, color: statColor(data.win_rate), whiteSpace: 'nowrap' }}>{pct1(data.win_rate)}</b>
        </PhoneInfoRow>
        {showsKd && data.kill !== null && data.death !== null ? (
          <PhoneInfoRow label="킬뎃" sub={`${fmt(data.kill)}킬 ${fmt(data.death)}데스`}>
            <b style={{ fontSize: 21, fontWeight: 700, color: data.kd_rate === null ? V3.textMuted : statColor(data.kd_rate), whiteSpace: 'nowrap' }}>{pct1(data.kd_rate)}</b>
          </PhoneInfoRow>
        ) : null}
        <PhoneInfoRow label="판킬">
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            <b style={{ fontSize: 21, fontWeight: 700, color: V3.text }}>{data.kill_per_match.toFixed(1)}</b>
            <span style={{ fontSize: 12, color: V3.textDim }}>킬</span>
          </span>
        </PhoneInfoRow>
        <PhoneInfoRow label="MVP" sub={`${fmt(data.win + data.lose)}판 중`}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            <b style={{ fontSize: 21, fontWeight: 700, color: data.mvp_count > 0 ? V3.mvp : V3.textGhost }}>{fmt(data.mvp_count)}</b>
            <span style={{ fontSize: 12, color: V3.textDim }}>회</span>
          </span>
        </PhoneInfoRow>
        {/* 등수는 모르면 안 적는다 — 배치고사 중이거나 판이 모자라면 null */}
        <PhoneInfoRow label="랭킹" sub={data.rank_count === null ? '' : `${fmt(data.rank_count)}명중`}>
          {data.rank === null ? (
            <span style={{ fontSize: 13, color: V3.textGhost, whiteSpace: 'nowrap' }}>{data.placement ? '배치고사' : '집계 없음'}</span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
              <b style={{ fontSize: 21, fontWeight: 700, color: rankColorOf(data.rank, data.rank_count) }}>{fmt(data.rank)}</b>
              <span style={{ fontSize: 12, color: V3.textDim }}>위</span>
            </span>
          )}
        </PhoneInfoRow>
        <PhoneInfoRow label="핵의심" last>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <b style={{ fontSize: 21, fontWeight: 700, color: (report?.reported ? report.count : data.report_count) > 0 ? '#ff6b6b' : V3.textGhost }}>{fmt(report?.reported ? report.count : data.report_count)}</b>
              <span style={{ fontSize: 12, color: V3.textDim }}>회</span>
            </span>
            {report ? (
              <button
                type="button"
                onClick={report.pending ? undefined : report.onReport}
                style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: V3.radiusChip, cursor: report.pending ? 'wait' : 'pointer', color: report.reported ? '#ff6b6b' : '#b3555c', background: 'transparent', border: `1px solid ${report.reported ? 'rgba(255,107,107,.55)' : 'rgba(179,85,92,.45)'}` }}
              >
                {report.pending ? '…' : report.reported ? '신고함' : '신고'}
              </button>
            ) : null}
          </span>
        </PhoneInfoRow>
        {report?.message ? <div style={{ padding: '0 20px 9px', fontSize: 10.5, color: V3.textDim }}>{report.message}</div> : null}
      </div>
      {report?.message ? <div className="v3-phead-foot" style={{ position: 'relative', padding: '0 20px 9px', fontSize: 10.5, color: V3.textDim }}>{report.message}</div> : null}
    </section>
  )
}

/** 폰 상세정보 한 줄 — 서플라이 오른쪽 카드 줄과 같은 모양(라벨 · 보조 · 큰 값). PC 의 `InfoRow`(PlayerDetailV3)와 같은 뼈대다 */
function PhoneInfoRow({ label, sub, last, children }: { label: string; sub?: string; last?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: last ? 'none' : `1px solid ${V3.rowDivider}`, minHeight: 50 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: V3.textDim, whiteSpace: 'nowrap', flex: 'none' }}>{label}</span>
      <div style={spacerStyle} />
      {sub ? <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{sub}</span> : null}
      {children}
    </div>
  )
}"""),
])

# ── C. 본문 — 폰 탭(기록실|플레이분석) · 같이한 플레이어 끔 · 폰 오른쪽 칸 숨김 ──
patch('packages/ui/src/v3/PlayerDetailV3.tsx', [
    # 스위치
    ("""/* 2026-09-11 사장님: «누가 스나이퍼인지 안 떠 — 워터마크 폐지, 닉 옆에 빨간 (S)». 워터마크(SNIPER·ME)는 스위치로만 남긴다 */
const SCORE_WATERMARKS = false""",
     """/* 2026-09-11 사장님: «누가 스나이퍼인지 안 떠 — 워터마크 폐지, 닉 옆에 빨간 (S)». 워터마크(SNIPER·ME)는 스위치로만 남긴다 */
const SCORE_WATERMARKS = false
/**
 * ★「최근 같이한 플레이어」 표를 내린다★ (2026-09-23 오후 사장님: 「피시랑 모바일 둘 다에서 없애 필요없어」).
 * 컴포넌트(`TeammatesCard`)와 자료(`data.teammates`)는 그대로다 — `true` 로 되돌리면 그대로 나온다 (`CLAUDE.md` 1-4).
 */
const SHOW_TEAMMATES = false"""),
    # import pillStyle
    ("""import { WIN_LOSS, V3, V3_DARK, type V3Tone, cardStyle, chipStyle, fmt, pct1, spacerStyle } from './tokens'""",
     """import { WIN_LOSS, V3, V3_DARK, type V3Tone, cardStyle, chipStyle, fmt, pct1, pillStyle, spacerStyle } from './tokens'"""),
    # state
    ("""  const [tab, setTab] = useState<'graph' | 'play' | 'clan'>('graph')
  const showsKd = props.showsKd ?? true""",
     """  const [tab, setTab] = useState<'graph' | 'play' | 'clan'>('graph')
  /*
   * ★폰 탭 — 기록실 | 플레이분석★ (2026-09-23 오후 사장님: 「육각을 지난시즌 대신 넣어버려」).
   * PC 는 레이아웃의 링크 탭(기록실/지난시즌)이 그대로고 이 탭은 ≤767px 에서만 보인다.
   * 「플레이분석」 을 고르면 본문(추이 · 최근매치 · 경기 목록) 대신 ★육각(비교분석하기)★ 이 선다.
   */
  const [phoneTab, setPhoneTab] = useState<'record' | 'hex'>('record')
  const phoneHex = phoneTab === 'hex'
  const showsKd = props.showsKd ?? true"""),
    # css + 탭 + 본문 감싸기
    ("""        @media (max-width: 980px) {
          .sac-prr-grid { grid-template-columns: minmax(0,1fr); }
          .sac-prr-aside { position: static; }
        }
      `}</style>""",
     """        @media (max-width: 980px) {
          .sac-prr-grid { grid-template-columns: minmax(0,1fr); }
          .sac-prr-aside { position: static; }
        }
        /* ★폰★ (2026-09-23 오후 사장님) — 오른쪽 칸(상세정보·육각·같이한 플레이어)은 안 그린다:
           상세정보는 머리 카드로(PlayerHeaderV3) · 육각은 「플레이분석」 탭으로 옮겼다. 폰 탭은 여기서만 보인다 */
        .sac-pilltabs-phone { display: none; }
        @media (max-width: 767px) {
          .sac-prr-aside { display: none; }
          .sac-pilltabs-phone { display: flex; }
          .sac-phone-hide { display: none; }
        }
      `}</style>

      {/* ★폰 탭★ — 기록실 | 플레이분석 (지난시즌 자리). 모양은 레이아웃의 `.sac-pilltabs` 폰 규칙(supply-skin.css)을 그대로 탄다 */}
      <div className="sac-pilltabs sac-pilltabs-phone" style={{ alignItems: 'stretch', gap: 6, flexWrap: 'wrap' }}>
        {([['record', '기록실'], ['hex', '플레이분석']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPhoneTab(key)}
            className={phoneTab === key ? 'sac-pilltab is-on' : 'sac-pilltab'}
            style={{ ...pillStyle(phoneTab === key), fontFamily: 'inherit', cursor: 'pointer' }}
            aria-current={phoneTab === key ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      {phoneHex ? (
        <div style={{ marginTop: 12 }}>
          <StrengthCard data={data} compare={props.compare} leagueSlug={props.leagueSlug} />
        </div>
      ) : null}
      <div className={phoneHex ? 'sac-phone-hide' : undefined}>"""),
    ("""          {/* 서플라이 오른쪽 칸의 마지막 표. 자료는 이미 있었는데 v3 화면에서는 안 그리고 있었다 */}
          <TeammatesCard data={data} />
        </aside>
      </div>
""",
     """          {/* 서플라이 오른쪽 칸의 마지막 표. 2026-09-23 오후 사장님 「필요없어」 → SHOW_TEAMMATES=false */}
          {SHOW_TEAMMATES ? <TeammatesCard data={data} /> : null}
        </aside>
      </div>
      </div>
"""),
])

# ── D. 레이아웃 — 링크 탭(기록실/지난시즌)은 폰에서 숨긴다 ─────────────────
patch('apps/web/app/league/[leagueSlug]/player/[playerId]/layout.tsx', [
    ("""          <PillTabs tabs={leaguePlayerTabs(leagueSlug, playerId)} current={pathname} />""",
     """          {/* 폰은 본문 안 탭(기록실 | 플레이분석)이 대신한다 (2026-09-23 오후 사장님 「육각을 지난시즌 대신」) — supply-skin.css `.sac-pilltabs-pc` */}
          <div className="sac-pilltabs-pc">
            <PillTabs tabs={leaguePlayerTabs(leagueSlug, playerId)} current={pathname} />
          </div>"""),
])

# ── E. CSS — 머리 카드 폰 줄 · 링크 탭 폰 숨김 ────────────────────────────
patch('packages/ui/src/v2/supply-skin.css', [
    ("""/* 탭 띠는 페이지 루트 밖의 별도 pc-container(여백 11.25px) 안에 있어 371 이었다(운영 폰 실측).""",
     """/* ★선수 페이지 폰 합치기★ (2026-09-23 오후 사장님)
   상세정보 줄은 머리 카드 안(`.v3-phead-info-phone`)에서만 · 그때 MVP·핵의심 두 칸 줄(`.v3-phead-foot`)은 숨긴다(같은 값이 줄 안에 있다).
   선수 레이아웃의 링크 탭(기록실/지난시즌 · `.sac-pilltabs-pc`)은 폰에서 숨기고 본문 탭(기록실|플레이분석)이 대신한다.
   PC 는 한 글자도 안 바뀐다. */
.v3-phead-info-phone { display: none; }
@media (max-width: 767px) {
  .v3-phead-info-phone { display: block; }
  .v3-phead-foot { display: none !important; }
  .sac-pilltabs-pc { display: none; }
}

/* 탭 띠는 페이지 루트 밖의 별도 pc-container(여백 11.25px) 안에 있어 371 이었다(운영 폰 실측)."""),
])
