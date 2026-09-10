'use client';

/**
 * SACLOUD 선수 상세 v3 — 단일 파일 컴포넌트 (Next.js + React + TypeScript)
 *
 * 사용법
 *   1) components/player/PlayerDetailV3.tsx 로 저장
 *   2) 라우트에서 <PlayerDetailV3 /> 렌더
 *   3) 폰트: Chakra Petch(영문·숫자) + Noto Sans KR(한글) 을 layout.tsx 에서 로드
 *   4) 클랜마크 PNG 를 public/assets/clans/ 로 복사 (원 크롭된 igloo-fit.png 포함)
 *
 * 범위: UI 만. API / DB / Collector / 랭킹·시즌 계산은 만들지 않는다. 데이터는 아래 Mock 상수뿐.
 * 자세한 설계 규칙은 PLAYER_DETAIL_GUIDE.md 참고.
 */

import { useState, type CSSProperties } from 'react';

/* ═══ 1. 색상 규칙 ═══════════════════════════════════════
   rankColor(rank)  → 등수·닉네임 (1~3 빨강 / 4~20 노랑 / 21~40 파랑 / 41~100 초록 / 101~ 하양)
   statColor(v)     → 0~100 스케일 수치 (승률·킬뎃 등). 래더 점수는 규칙 밖(흰색).
   ─────────────────────────────────────────────────────── */
export function rankColor(rank: number): string {
  if (rank <= 3) return '#ff4d4d';
  if (rank <= 20) return '#ffd83d';
  if (rank <= 40) return '#5b9dff';
  if (rank <= 100) return '#22c55e';
  return '#ffffff';
}
export function statColor(v: number): string {
  if (Number.isNaN(v)) return '#8a8a93';
  if (v < 40) return '#e01b24';
  if (v < 50) return '#ffffff';
  if (v < 55) return '#22c55e';
  if (v < 60) return '#a06a35';
  if (v < 65) return '#5b8dff';
  return '#f5c518';
}

/* ═══ 2. 클랜 테마 ═══════════════════════════════════════
   선수 카드 배경은 **소속 클랜의 클랜마크에서 뽑은 색**으로 칠한다.
   클랜이 바뀌면 이 객체만 교체하면 페이지 색조가 따라 바뀐다.
   ─────────────────────────────────────────────────────── */
export type ClanTheme = { light: string; main: string; deep: string; edge: string; ink: string };
const IGLOO: ClanTheme = { light: '#e6f7f7', main: '#81d3ef', deep: '#3cb0d2', edge: '#a8e8ff', ink: '#bfe6ff' };
const MARK = '/assets/clans/igloo-fit.png';

/* ═══ 3. 토큰 ═══════════════════════════════════════════ */
const C = {
  pageBg: 'radial-gradient(1200px 700px at 50% -8%, #142238 0%, #0c1526 42%, #070d1c 100%)',
  bar: 'linear-gradient(160deg,#0d1524,#080d18)',
  barBorder: '#16202e',
  card: 'linear-gradient(160deg,#152036 0%,#101a2c 58%)',
  cardBorder: '#1e2a42',
  divider: '#1b2537',
  rowDivider: '#16203a',
  rowDivider2: '#141d2c',
  plot: '#0a1220',
  chip: '#0e1728',
  chipBorder: '#24314c',
  text: '#e8eaf2',
  textMuted: '#a4b0c8',
  textDim: '#7c88a4',
  textFaint: '#6b7690',
  textGhost: '#5c6a84',
  textGhost2: '#4e5b74',
  blue: '#5b8dff',
  red: '#e01b24',
  gold: '#ffd83d',
  radiusCard: 10,
  radiusCtl: 7,
  radiusChip: 5,
} as const;

/** ASTRA 는 무조건 영롱하게 */
const ASTRA_STYLE: CSSProperties = {
  background: 'linear-gradient(92deg,#8ff0ff 0%,#c9b6ff 34%,#ffd6f2 58%,#8ff0ff 100%)',
  backgroundSize: '220% 100%',
  WebkitBackgroundClip: 'text', backgroundClip: 'text',
  color: 'transparent', WebkitTextFillColor: 'transparent',
  fontWeight: 700, letterSpacing: '.16em',
  filter: 'drop-shadow(0 0 7px rgba(160,220,255,.75)) drop-shadow(0 0 16px rgba(190,150,255,.4))',
  animation: 'sacAstra 5.5s ease-in-out infinite',
};
/** CHALLENGER 는 ASTRA 보다 약하게 — 단색 브론즈 */
const CHAL_STYLE: CSSProperties = { color: '#a98a64', fontWeight: 500, letterSpacing: '.12em' };

/* ═══ 4. Mock 데이터 ═════════════════════════════════════ */
const PLAYER = { name: '밤빵걸', weapon: '라플', clan: 'igloo', rank: 24, pool: '1,658명' };

const LEAGUE_TABS = ['클랜랭킹', '개인랭킹', 'LIVE', '게시판'] as const;
const PLAYER_TABS = ['기록실', '지난시즌'] as const;
const RANGES = ['DAY', '누적'] as const;

/**
 * 구간별 전적 — [승, 패, 스나킬, 스나데스, 라플킬, 라플데스]
 * 판수·퍼센트·판킬은 전부 이 값에서 계산한다(하드코딩 금지).
 * 합계가 상단 KPI(39승 22패 61전 / 킬뎃 53.2% = 524킬 461데스)와 일치해야 한다.
 */
const REGION_RAW: (number[] | null)[] = [
  [33, 18, 132, 103, 312, 273],  // ASTRA        51판 · 8.7킬/판
  [ 6,  4,  23,  24,  57,  61],  // CHALLENGER 1 10판 · 8.0킬/판
  null,                          // CHALLENGER 2 0판
];
const REGION_KEYS = ['astra', 'c1', 'c2'] as const;
const REGION_MVP = [14, 2, 0];   // 구간별 MVP 횟수
type RegionKey = (typeof REGION_KEYS)[number];

/**
 * STRENGTH POINT — 플레이 성향 6축 (시계방향, 12시부터)
 * value 는 그래프 면적만 결정하고, 화면에 보이는 값은 rank(리그 등수)다.
 * badge: 등수가 10위 이내일 때만 그래프 아래 "특성" 배지를 달아준다.
 */
const TRAITS = [
  { label: '세이브',   value: 86, rank: 4,   badge: '세이브 머신',  desc: '열세 상황을 뒤집어 살린 라운드 수' },
  { label: '샷싸움',   value: 38, rank: 63,  badge: '샷터',        desc: '1:1 교전 승률' },
  { label: '캐리력',   value: 81, rank: 9,   badge: '캐리 머신',    desc: '팀 승리에 기여한 비중' },
  { label: '선짤',     value: 27, rank: 117, badge: 'First Blood', desc: '라운드 첫 킬(퍼스트 블러드) 횟수' },
  { label: '연속킬',   value: 34, rank: 74,  badge: '멀티킬러',     desc: '한 라운드 2킬 이상 횟수' },
  { label: '소수싸움', value: 31, rank: 92,  badge: '말맞추기',     desc: '수적 열세 교전 승률' },
];

/** 추이 키포인트 — 승률/킬뎃이 서로 교차·역전하도록 설계 */
const KD_KEY = [58, 56, 49, 44, 47, 55, 61, 57, 48, 45, 51, 53.2];
const WR_KEY = [46, 50, 57, 62, 58, 49, 44, 52, 60, 66, 61, 63.9];
const WEEKS = ['9/3', '9/10', '9/17', '9/24', '10/1'];

/** 스코어보드 부가 데이터 */
const PLAYER_EMB: Record<string, string> = {
  '늄냠': 'igloo-fit', '밤빵걸': 'igloo-fit', '반짝명이': 'igloo-fit', '푸씨맨': 'igloo-fit', '반짝굴비': 'igloo-fit',
  '이브차코': 'evermore', '삐패': 'evermore', '메이져강산': 'deluxe', '루니트': 'evermore', '하늘색우산': 'evermore',
};
const SNIPERS = ['늄냠', '메이져강산'];
const SAVES: Record<string, number> = {
  '늄냠': 2, '밤빵걸': 3, '반짝명이': 1, '푸씨맨': 0, '반짝굴비': 1,
  '이브차코': 2, '삐패': 1, '메이져강산': 4, '루니트': 0, '하늘색우산': 1,
};
const ASSISTS: Record<string, number> = {
  '밤빵걸': 3, '늄냠': 1, '반짝명이': 0, '푸씨맨': 2, '반짝굴비': 0,
  '이브차코': 2, '삐패': 0, '메이져강산': 4, '루니트': 1, '하늘색우산': 0,
};
const IGLOO_ROSTER = ['밤빵걸', '늄냠', '반짝명이', '푸씨맨', '반짝굴비'];
const OPP_ROSTER = ['이브차코', '삐패', '메이져강산', '루니트', '하늘색우산'];

/** [승/패, 맵, 시간, 우리 라운드, 상대 라운드, 상대 클랜, 엠블럼, MVP 이름] */
const MATCHES: [string, string, string, number, number, string, string, string][] = [
  ['승리', '제3보급창고', '16시간 전 23:26', 6, 2, 'evermore', 'evermore', '밤빵걸'],
  ['승리', '제3보급창고', '17시간 전 22:53', 6, 4, 'evermore', 'evermore', '늄냠'],
  ['패배', '제3보급창고', '17시간 전 22:31', 3, 6, 'evermore', 'evermore', '메이져강산'],
  ['승리', '제3보급창고', '17시간 전 22:19', 6, 1, 'deluxe', 'deluxe', '밤빵걸'],
];

/* ═══ 5. 차트 지오메트리 ═══════════════════════════════════
   ⚠️ 육각형 SVG 는 viewBox(300×262)와 표시 크기(300px)를 1:1로 유지해야 한다.
      축소하면 내부 텍스트도 같이 줄어 8px 이하가 된다.
   ⚠️ 추이 차트는 플롯 우측 끝을 500 으로 당겨 라벨 영역(140 units)을 확보한 상태다.
   ─────────────────────────────────────────────────────── */
const HX = 150, HY = 120, HR = 74;
const hexPt = (i: number, f: number): [number, number] => {
  const a = -Math.PI / 2 + (Math.PI * 2 * i) / 6;
  return [+(HX + Math.cos(a) * HR * f).toFixed(1), +(HY + Math.sin(a) * HR * f).toFixed(1)];
};
const HEX_RINGS = [1, .875, .75, .625, .5, .375, .25, .125].map(f =>
  TRAITS.map((_, i) => hexPt(i, f).join(',')).join(' '));
const HEX_SPOKES = TRAITS.map((_, i) => hexPt(i, 1));
const HEX_AREA = TRAITS.map((t, i) => hexPt(i, t.value / 100).join(',')).join(' ');
/** 축 라벨은 리터럴 좌표로 배치 (SVG text 내용을 데이터 바인딩하면 스케일 이슈가 생긴다) */
const HEX_LABELS: [number, number, 'start' | 'middle' | 'end'][] = [
  [150, 26, 'middle'], [232, 78, 'start'], [232, 170, 'start'],
  [150, 222, 'middle'], [68, 170, 'end'], [68, 78, 'end'],
];

const KX0 = 44, KX1 = 500;
const ky = (v: number) => 236 - ((Math.max(20, Math.min(80, v)) - 20) / 60) * 210;
const XS = WEEKS.map((_, i) => +(KX0 + ((KX1 - KX0) * i) / (WEEKS.length - 1)).toFixed(1));

/** 키포인트 사이를 잘게 쪼개고 "경기 없는 주"는 평평하게 */
function buildSeries(keys: number[], seed0: number): number[] {
  const out: number[] = [];
  let sd = seed0;
  const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const STEPS = 13;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    const flat = rnd() < 0.62;              // 이 구간은 경기가 없던 주 → 직선
    let last = a;
    for (let k = 0; k < STEPS; k++) {
      const base = a + (b - a) * (k / STEPS);
      if (flat && k < STEPS * 0.72) { out.push(a); last = a; continue; }
      let v = base + (rnd() - 0.5) * 1.6;
      v = last + (v - last) * 0.55;         // 스무딩 — 과한 톱니 방지
      out.push(v); last = v;
    }
  }
  out.push(keys[keys.length - 1]);
  return out;
}
const toPoints = (vals: number[]) => vals.map((v, i) => {
  const x = KX0 + ((KX1 - KX0) * i) / (vals.length - 1);
  return `${x.toFixed(1)},${ky(v).toFixed(1)}`;
}).join(' ');

/* ═══ 6. 스코어보드 생성 ═══════════════════════════════════
   라운드 스코어와 물리적으로 정합하게 만든다:
     · 팀 총킬 T = 승리 라운드 × 4
     · 이긴 팀 총킬 = 진 팀 총데스 (교차 검증 성립)
     · MVP 는 경기 데이터의 이름 하나만이 진실의 원천 (헤더·스코어보드 동일)
   ─────────────────────────────────────────────────────── */
type Row = { name: string; k: number; d: number; a: number | string; kd: number; me: boolean; mvp: boolean };

const spread = (T: number) => {
  const w = [0.28, 0.24, 0.20, 0.16, 0.12];
  const out = w.map(x => Math.round(T * x));
  out[0] += T - out.reduce((a, b) => a + b, 0);
  return out.map(v => Math.max(0, v));
};

function buildTeam(names: string[], teamKills: number, teamDeaths: number, mvpName: string | null, meName: string | null, seed: number): Row[] {
  const ks = spread(teamKills);
  const ds = spread(teamDeaths).slice().reverse();
  return names.map((n, j) => {
    const a = Math.max(0, (ASSISTS[n] ?? 0) + ((seed + j) % 3) - 1);
    const k = ks[j], d = ds[j];
    return { name: n, k, d, a: a === 0 ? '-' : a, kd: k + d > 0 ? (k / (k + d)) * 100 : 0, me: n === meName, mvp: n === mvpName };
  });
}

/* ═══ 7. 스타일 ═════════════════════════════════════════ */
const s = {
  page: { width: '100%', minHeight: '100vh', background: C.pageBg, color: C.text, fontFamily: "'Chakra Petch','Noto Sans KR',system-ui,sans-serif", letterSpacing: '.01em', WebkitFontSmoothing: 'antialiased' },
  spacer: { flex: 1 },

  barWrap: { padding: '14px 24px 0' },
  bar: { maxWidth: 1180, margin: '0 auto', height: 68, display: 'flex', alignItems: 'center', gap: 36, padding: '0 24px', boxSizing: 'border-box', background: C.bar, border: `1px solid ${C.barBorder}`, borderRadius: 14 },
  tabBarWrap: { padding: '10px 24px 0' },
  tabBar: { maxWidth: 1180, margin: '0 auto', height: 54, display: 'flex', alignItems: 'stretch', padding: '0 12px', boxSizing: 'border-box', background: C.bar, border: `1px solid ${C.barBorder}`, borderRadius: 14, overflow: 'hidden' },
  tab: { display: 'flex', alignItems: 'center', margin: '9px 3px', padding: '0 20px', borderRadius: 9, fontSize: 14 },

  body: { maxWidth: 1420, margin: '0 auto', padding: '0 90px 90px', boxSizing: 'border-box' },
  inner: { padding: '0 46px 70px' },

  card: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: C.radiusCard },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${C.divider}`, flexWrap: 'wrap' },
  ribbon: { width: 22, height: 2, background: C.blue, flex: 'none' },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' },

  /** 선수 카드 상단 띠 — IPL 은 in-flow 중앙 열 (absolute 로 두면 좌우 텍스트와 겹친다) */
  band: { position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 13, padding: '14px 18px', borderBottom: `1px solid ${C.divider}` },
  kpiRow: { position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', borderTop: '1px solid #18233a' },

  half: { marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, alignItems: 'stretch' },
  halfCard: { display: 'flex', flexDirection: 'column', background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: C.radiusCard },
  statRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', alignItems: 'baseline', gap: 12, padding: '9px 0', borderTop: `1px solid ${C.rowDivider2}` },

  matchRow: { display: 'grid', gridTemplateColumns: '52px 124px minmax(0,1fr) minmax(0,132px) 62px', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' },
  playerRow: { position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 104px 60px 74px', gap: 10, alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${C.rowDivider2}` },
} satisfies Record<string, CSSProperties>;

const Astra = ({ size = 11 }: { size?: number }) => (
  <span style={{ ...ASTRA_STYLE, fontSize: size, whiteSpace: 'nowrap' }}>ASTRA</span>
);

/* ═══ 8. 하위 컴포넌트 ═══════════════════════════════════ */

/** 소속 클랜 테마 배경 — 선수 카드 KPI 줄에 깔린다 */
function ClanBackdrop({ theme }: { theme: ClanTheme }) {
  return (
    <>
      <span aria-hidden style={{ position: 'absolute', left: '-3%', top: '-10%', width: '34%', height: '130%', backgroundImage: `url(${MARK})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', opacity: .11, pointerEvents: 'none' }} />
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '62%', background: `linear-gradient(180deg,${theme.light}29,${theme.main}0f 60%,transparent)`, pointerEvents: 'none' }} />
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '44%', background: `linear-gradient(0deg,${theme.deep}2e,transparent)`, pointerEvents: 'none' }} />
      <span aria-hidden style={{ position: 'absolute', right: 22, top: '50%', transform: 'translateY(-50%)', fontSize: 34, fontWeight: 900, color: '#dff2ff', opacity: .12, whiteSpace: 'nowrap', pointerEvents: 'none' }}>Cloud 0</span>
    </>
  );
}

function StrengthHexagon() {
  return (
    <svg viewBox="0 0 300 262" style={{ width: 300, height: 262, flex: '0 0 300px', display: 'block' }}>
      <defs>
        <radialGradient id="pxFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6a6a" stopOpacity=".22" />
          <stop offset="100%" stopColor="#e01b24" stopOpacity=".04" />
        </radialGradient>
        <filter id="pxGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="p1" />
          <feGaussianBlur stdDeviation="13" result="p2" />
          <feMerge><feMergeNode in="p2" /><feMergeNode in="p1" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {HEX_RINGS.map((p, i) => <polygon key={i} points={p} fill="none" stroke="#41527a" strokeWidth={1.1} />)}
      {HEX_SPOKES.map(([x, y], i) => <line key={i} x1={HX} y1={HY} x2={x} y2={y} stroke="#41527a" strokeWidth={1.1} />)}
      <polygon points={HEX_AREA} fill="url(#pxFill)" stroke="#ff5c5c" strokeWidth={1.8} strokeOpacity={.85} strokeLinejoin="round" filter="url(#pxGlow)" />
      {TRAITS.map((t, i) => {
        const [x, y, anchor] = HEX_LABELS[i];
        return (
          <g key={t.label}>
            <text x={x} y={y} textAnchor={anchor} fontSize="12" fontWeight="700" fill={C.textMuted}>{t.label}</text>
            <text x={x} y={y + 14} textAnchor={anchor} fontSize="11.5" fontWeight="700" fill={rankColor(t.rank)}>{t.rank}위</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 10위 이내 특성만 배지로 */
function TraitBadges() {
  const top = TRAITS.filter(t => t.rank <= 10);
  if (!top.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 18px 16px' }}>
      <span style={{ fontSize: 9.5, color: C.textGhost2, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>특성</span>
      {top.map(t => (
        <span key={t.badge} title={t.desc} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px 5px 8px', borderRadius: 999, whiteSpace: 'nowrap', background: 'linear-gradient(100deg,rgba(255,216,61,.16),rgba(255,216,61,.04))', border: '1px solid rgba(255,216,61,.5)', boxShadow: '0 0 14px rgba(255,216,61,.18)' }}>
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flex: 'none', display: 'block' }} aria-hidden>
            {t.label === '세이브' ? (
              <>
                <path d="M12 2.6 L20 6 V12.4 C20 17 16.6 20.4 12 21.6 C7.4 20.4 4 17 4 12.4 V6 Z" fill="rgba(255,216,61,.14)" stroke={C.gold} strokeWidth={1.5} strokeLinejoin="round" />
                <path d="M8.4 12.2 L11.2 15 L16 9.6" fill="none" stroke={C.gold} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : (
              <>
                <path d="M3.5 17.5 L9 11.4 L13 14.6 L20.5 6.5" fill="none" stroke={C.gold} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15.4 6.2 H20.8 V11.6" fill="none" stroke={C.gold} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="11.4" r="1.7" fill={C.gold} />
              </>
            )}
          </svg>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#ffe89a' }}>{t.badge}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#c9a94a' }}>{t.rank}위</span>
        </span>
      ))}
    </div>
  );
}

function TrendChart() {
  const kdLine = toPoints(buildSeries(KD_KEY, 90210));
  const wrLine = toPoints(buildSeries(WR_KEY, 4242));
  const wrEnd = ky(63.9), kdEnd = ky(53.2);
  return (
    <div style={{ padding: '6px 12px 10px', background: C.plot }}>
      <svg viewBox="0 0 640 300" style={{ width: '100%', height: 300, display: 'block' }}>
        <defs>
          <filter id="kdGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="g1" />
            <feGaussianBlur stdDeviation="16" result="g2" />
            <feMerge><feMergeNode in="g2" /><feMergeNode in="g1" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width="640" height="300" fill={C.plot} />
        <text x="272" y="150" textAnchor="middle" fontSize="62" fontWeight="900" fill="#dff2ff" opacity="0.05" letterSpacing="6">CLOUD 0</text>

        {[20, 40, 60, 80].map(g => (
          <g key={g}>
            <line x1={KX0} y1={ky(g)} x2={KX1} y2={ky(g)} stroke="#111826" />
            <text x={KX0 - 8} y={ky(g) + 4} textAnchor="end" fill={C.textDim} fontSize="11">{g}</text>
          </g>
        ))}
        {XS.slice(1, -1).map(x => <line key={x} x1={x} y1={26} x2={x} y2={236} stroke="#111826" strokeDasharray="3 5" />)}
        {XS.map((x, i) => (
          <text key={x} x={x} y={264} textAnchor={i === 0 ? 'start' : i === XS.length - 1 ? 'end' : 'middle'} fill={C.textDim} fontSize="11">{WEEKS[i]}</text>
        ))}
        <line x1={KX1} y1={20} x2={KX1} y2={242} stroke="#2b3a58" />
        <text x={KX1} y={16} textAnchor="middle" fill="#8f9bb5" fontSize="13" fontWeight="700">today</text>

        {/* 승률(파랑) → 킬뎃(빨강). 각 3겹: 헤일로 → 중간 → 코어 */}
        <polyline points={wrLine} fill="none" stroke={C.blue} strokeWidth={11} strokeLinejoin="miter" strokeLinecap="round" filter="url(#kdGlow)" opacity={0.42} />
        <polyline points={wrLine} fill="none" stroke="#7fa9ff" strokeWidth={6} strokeLinejoin="miter" strokeLinecap="round" opacity={0.45} />
        <polyline points={wrLine} fill="none" stroke="#dbe8ff" strokeWidth={3} strokeLinejoin="miter" strokeLinecap="round" opacity={0.95} />
        <polyline points={kdLine} fill="none" stroke={C.red} strokeWidth={12} strokeLinejoin="miter" strokeLinecap="round" filter="url(#kdGlow)" opacity={0.5} />
        <polyline points={kdLine} fill="none" stroke="#ff5a63" strokeWidth={6.5} strokeLinejoin="miter" strokeLinecap="round" opacity={0.45} />
        <polyline points={kdLine} fill="none" stroke="#ffd7da" strokeWidth={3.2} strokeLinejoin="miter" strokeLinecap="round" opacity={0.95} />

        {/* 선 끝 마커: 승률 = 클랜마크 / 킬뎃 = K/D 원 (중심을 선 끝 x=KX1 에 맞춤) */}
        <image href={MARK} x={KX1 - 10} y={wrEnd - 10} width="20" height="20" clipPath="circle(10px at 10px 10px)" />
        <text x={KX1 + 16} y={wrEnd + 5} textAnchor="start" fill="#dbe8ff" fontSize="15" fontWeight="700">63.9%</text>
        <text x={KX1 + 63} y={wrEnd + 5} textAnchor="start" fill="#8fa9d8" fontSize="9.5" fontWeight="700">39승 22패</text>
        <circle cx={KX1} cy={kdEnd} r={10} fill={C.chip} stroke="#ff5a63" strokeWidth={1.6} />
        <text x={KX1} y={kdEnd + 3} textAnchor="middle" fill="#ffd7da" fontSize="8.5" fontWeight="700">K/D</text>
        <text x={KX1 + 16} y={kdEnd + 5} textAnchor="start" fill="#ffd7da" fontSize="15" fontWeight="700">53.2%</text>
        <text x={KX1 + 63} y={kdEnd + 5} textAnchor="start" fill="#c98f95" fontSize="9.5" fontWeight="700">524킬 461데스</text>
      </svg>
    </div>
  );
}

function ScoreRow({ row }: { row: Row }) {
  const sv = SAVES[row.name] ?? 0;
  const sniper = SNIPERS.includes(row.name);
  return (
    <div style={{
      ...s.playerRow,
      background: row.me ? 'linear-gradient(100deg,rgba(143,240,255,.10),rgba(143,240,255,.02) 55%,transparent)' : 'transparent',
      boxShadow: row.me ? 'inset 3px 0 0 #8ff0ff, inset 0 0 26px rgba(143,240,255,.10)' : 'none',
    }}>
      {/* 워터마크: SNIPER 왼쪽(34%), ME 오른쪽(66%) — 서로 겹치지 않는 고정 위치 */}
      {sniper && <span aria-hidden style={{ position: 'absolute', left: '34%', top: '50%', transform: 'translate(-50%,-50%) skewX(-16deg) scaleY(0.9) scaleX(1.16)', fontSize: 25, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.5em', color: C.red, opacity: .17, WebkitTextStroke: `3.4px ${C.red}`, whiteSpace: 'nowrap', pointerEvents: 'none' }}>SNIPER</span>}
      {row.me && <span aria-hidden style={{ position: 'absolute', left: '66%', top: '50%', transform: 'translateY(-50%) skewX(-12deg) scaleY(0.92)', fontSize: 24, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.24em', color: '#8ff0ff', opacity: .14, WebkitTextStroke: '2.2px #8ff0ff', whiteSpace: 'nowrap', pointerEvents: 'none' }}>ME</span>}

      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ width: 20, height: 20, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(/assets/clans/${PLAYER_EMB[row.name] ?? 'igloo-fit'}.png)`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
        <span style={{ fontSize: 12.5, fontWeight: row.me ? 700 : 500, whiteSpace: 'nowrap', color: row.me ? '#dff2ff' : '#c3cbdb' }}>{row.name}</span>
        {row.mvp && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 'none', padding: '2px 6px', borderRadius: C.radiusChip, whiteSpace: 'nowrap', background: 'rgba(255,216,61,.10)', border: '1px solid rgba(255,216,61,.5)' }}>
            <span style={{ fontSize: 9, color: C.gold }}>★</span>
            <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '.08em', color: C.gold }}>MVP</span>
          </span>
        )}
      </span>
      {/* 킬·어시 흰색 / 데스 빨강 */}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>
        <span style={{ color: '#eef4ff' }}>{row.k}</span>
        <span style={{ color: '#3a4560' }}>/</span>
        <span style={{ color: '#ff5a63' }}>{row.d}</span>
        <span style={{ color: '#3a4560' }}>/</span>
        <span style={{ color: '#eef4ff' }}>{row.a}</span>
      </span>
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', color: sv >= 3 ? '#8ff0ff' : sv > 0 ? C.textMuted : '#3f4c66' }}>{sv}회</span>
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: statColor(row.kd) }}>{row.kd.toFixed(1)}%</span>
    </div>
  );
}

/* ═══ 9. 페이지 ═════════════════════════════════════════ */
export default function PlayerDetailV3() {
  const [playerTab, setPlayerTab] = useState<(typeof PLAYER_TABS)[number]>('기록실');
  const [region, setRegion] = useState<RegionKey>('astra');
  const [range, setRange] = useState<(typeof RANGES)[number]>('DAY');
  const [openMatch, setOpenMatch] = useState<number | null>(0);
  const [reports, setReports] = useState(123);
  const [reported, setReported] = useState(false);

  const theme = IGLOO;
  const ink = rankColor(PLAYER.rank);

  const kpis = [
    { label: '래더', value: '3,639점', sub: '', color: '#ffffff' },
    { label: '승률', value: '63.9%', sub: '39승 22패', color: statColor(63.9) },
    { label: '킬뎃', value: '53.2%', sub: '라플', color: statColor(53.2) },
    { label: '판킬', value: '8.6', sub: '킬 / 판', color: C.text },
  ];

  /** 선택 구간 파생값 — 퍼센트·판킬·MVP율 전부 RAW 에서 계산 */
  const si = REGION_KEYS.indexOf(region);
  const raw = REGION_RAW[si];
  const sel = (() => {
    if (!raw) return { games: 0, hasData: false, rows: [] as any[], sniAvg: '-', rifAvg: '-', mvp: 0, mvpRate: '-' };
    const [w, l, sk, sd, rk, rd] = raw;
    const games = w + l;
    const win = (w / games) * 100;
    const sni = (sk / (sk + sd)) * 100;
    const rif = (rk / (rk + rd)) * 100;
    const kd = ((sk + rk) / (sk + rk + sd + rd)) * 100;
    const isAstra = si === 0;
    const rows = isAstra
      ? [
          { label: '승률', single: true, sub: `${w}승 ${l}패`, value: `${win.toFixed(1)}%`, color: statColor(win) },
          { label: '킬뎃', single: false, sniSub: `${sk}/${sd}`, sniValue: `${sni.toFixed(1)}%`, sniColor: statColor(sni), sub: `${rk}/${rd}`, value: `${rif.toFixed(1)}%`, color: statColor(rif) },
        ]
      : [
          { label: '통합 승률', single: true, sub: `${w}승 ${l}패`, value: `${win.toFixed(1)}%`, color: statColor(win) },
          { label: '통합 킬뎃', single: true, sub: `${sk + rk}/${sd + rd}`, value: `${kd.toFixed(1)}%`, color: statColor(kd) },
        ];
    const mvp = REGION_MVP[si];
    return {
      games, hasData: games >= 10, rows,
      sniAvg: (sk / games).toFixed(1), rifAvg: (rk / games).toFixed(1),
      mvp, mvpRate: `${((mvp / games) * 100).toFixed(1)}%`,
    };
  })();

  const matches = MATCHES.map(([result, map, time, myR, oppR, opp, emb, mvpName], i) => {
    const win = result === '승리';
    const igK = myR * 4, evK = oppR * 4;
    const igloo = buildTeam(IGLOO_ROSTER, igK, evK, win ? mvpName : null, PLAYER.name, i);
    const ever = buildTeam(OPP_ROSTER, evK, igK, win ? null : mvpName, null, i + 2);
    const me = igloo[0];
    return { i, result, map, time, opp, emb, win, myR, oppR, me, mvpIsMe: mvpName === PLAYER.name, teams: [
      { name: 'igloo', emb: MARK, ink: theme.ink, result: win ? '승리' : '패배', score: `${myR}:${oppR}`, players: igloo },
      { name: opp, emb: `/assets/clans/${emb}.png`, ink: '#9aa6bf', result: win ? '패배' : '승리', score: `${oppR}:${myR}`, players: ever },
    ] };
  });

  return (
    <div style={s.page}>
      <style>{`
        @keyframes sacAstra{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes sacSweep{0%{transform:translateX(-120%)}55%,100%{transform:translateX(320%)}}
      `}</style>

      {/* 상단 로고 바 · 리그 탭 — 떠 있는 라운드 카드 + 필 탭 */}
      <div style={s.barWrap}>
        <div style={s.bar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/assets/clans/cloud-mark.png" alt="3rd cloud" width={40} height={31} style={{ objectFit: 'contain' }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: .95, letterSpacing: '-.01em' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>3RD</span>
              <span style={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: C.blue }}>CLOUD</span>
                <span style={{ fontSize: 8, fontWeight: 500, color: C.red, paddingBottom: 1 }}>.my</span>
              </span>
            </div>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 22 }}>
            <span style={{ color: '#fff', fontWeight: 500 }}>IPL</span>
            <span style={{ color: '#7c8092' }}>SPL</span>
            <span style={{ color: '#7c8092', display: 'flex', alignItems: 'center', gap: 5 }}>10 <span style={{ fontSize: 17, color: C.textGhost }}>⛰</span></span>
          </nav>
          <div style={s.spacer} />
          <span style={{ fontSize: 13.5, color: '#9a9eb0' }}>로그인</span>
        </div>
      </div>
      <div style={s.tabBarWrap}>
        <nav style={s.tabBar}>
          {LEAGUE_TABS.map(t => {
            const on = t === '개인랭킹';
            return <div key={t} style={{ ...s.tab, color: on ? '#fff' : '#7c8092', fontWeight: on ? 700 : 400, background: on ? 'rgba(91,141,255,.14)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px rgba(91,141,255,.42)' : 'none' }}>{t}</div>;
          })}
        </nav>
      </div>

      <main style={s.body}>
        <div style={s.inner}>
          {/* ═══ 선수 카드 ═══ */}
          <section style={{ ...s.card, marginTop: 22, borderTop: `2px solid ${theme.edge}` }}>
            <div style={s.band}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                <span style={{ width: 46, height: 46, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${MARK})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', boxShadow: `0 0 0 1px ${theme.edge}a6, 0 0 20px ${theme.main}6b` }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', color: theme.ink, textShadow: `0 0 16px ${theme.main}80` }}>{PLAYER.name}</span>
                    <span style={{ fontSize: 11, color: C.textMuted, border: `1px solid ${C.chipBorder}`, borderRadius: C.radiusChip, background: C.chip, padding: '3px 8px', whiteSpace: 'nowrap' }}>{PLAYER.weapon}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, color: '#6f93b4', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ color: theme.ink, fontWeight: 500 }}>{PLAYER.clan}</span>
                    <span style={{ color: '#3a4560' }}>·</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, color: ink }}>
                      <span style={{ fontSize: 17, fontWeight: 900, lineHeight: 1, letterSpacing: '-.02em' }}>{PLAYER.rank}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700 }}>위</span>
                    </span>
                    <span style={{ color: C.textGhost2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>/ {PLAYER.pool}</span>
                  </span>
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 26, height: 1, background: 'linear-gradient(90deg,rgba(91,141,255,0),#5b8dff)' }} />
                  <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '.2em', color: '#fff', lineHeight: 1, textShadow: '0 0 18px rgba(91,141,255,.55),0 0 40px rgba(91,141,255,.22)', whiteSpace: 'nowrap' }}>IPL</span>
                  <span style={{ width: 26, height: 1, background: 'linear-gradient(90deg,#5b8dff,rgba(91,141,255,0))' }} />
                </span>
                <span style={{ fontSize: 9, letterSpacing: '.34em', color: C.textGhost2, whiteSpace: 'nowrap' }}>SEASON CLOUD 0</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#cfeeff', border: `1px solid ${theme.main}8c`, borderRadius: 999, background: `${theme.main}1f`, boxShadow: `0 0 14px ${theme.main}38`, padding: '5px 11px', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 5, height: 5, background: theme.edge }} />공식
                </span>
                <span style={{ fontSize: 11.5, color: '#a4b6c8', border: '1px solid #24384c', borderRadius: C.radiusCtl, background: '#0e1a28', padding: '6px 13px', whiteSpace: 'nowrap' }}>기본정보</span>
              </span>
            </div>

            <div style={s.kpiRow}>
              <ClanBackdrop theme={theme} />
              {kpis.map(k => (
                <div key={k.label} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, padding: '15px 20px', borderRight: `1px solid ${C.rowDivider}`, minWidth: 0 }}>
                  <span style={{ fontSize: 10.5, color: C.textGhost, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{k.label}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                    <span style={{ fontSize: 27, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap', color: k.color }}>{k.value}</span>
                    <span style={{ fontSize: 11, color: C.textGhost, whiteSpace: 'nowrap' }}>{k.sub}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 선수 탭 */}
          <div style={{ paddingTop: 20, display: 'flex', alignItems: 'stretch', gap: 6 }}>
            {PLAYER_TABS.map(t => {
              const on = t === playerTab;
              return <div key={t} onClick={() => setPlayerTab(t)} style={{ padding: '9px 20px', borderRadius: 9, fontSize: 13.5, cursor: 'pointer', color: on ? '#fff' : '#7c8092', fontWeight: on ? 700 : 400, background: on ? 'rgba(91,141,255,.14)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px rgba(91,141,255,.42)' : 'none' }}>{t}</div>;
            })}
          </div>

          {/* ═══ 좌: 구간별 전적 / 우: STRENGTH POINT (높이 stretch) ═══ */}
          <div style={s.half}>
            <div style={s.halfCard}>
              <div style={{ ...s.cardHead, borderBottom: `1px solid ${C.divider}` }}>
                <div style={s.ribbon} />
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>3,639점</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, color: C.gold }}>
                    <span style={{ fontSize: 17, fontWeight: 900, lineHeight: 1, letterSpacing: '-.02em' }}>24</span>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>위</span>
                  </span>
                </span>
                <div style={s.spacer} />
              </div>

              {/* 구간 선택 — 별도 줄 (헤더에 넣으면 절반 폭에서 넘친다) */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '10px 18px 12px', borderBottom: `1px solid ${C.rowDivider}` }}>
                {REGION_KEYS.map((k, i) => {
                  const on = region === k;
                  const base: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 3, padding: '5px 11px', borderRadius: C.radiusCtl, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? '#1a1c24' : '#111218', border: `1px solid ${on ? '#3a3d4a' : '#24262f'}`, opacity: on ? 1 : .55 };
                  return (
                    <span key={k} onClick={() => setRegion(k)} style={base}>
                      {i === 0 ? <Astra /> : (
                        <>
                          <span style={{ fontSize: 11, ...CHAL_STYLE }}>CHALLENGER</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#c2a07a' }}>{i}</span>
                        </>
                      )}
                    </span>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${C.rowDivider}` }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap', minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: C.textGhost2, letterSpacing: '.1em' }}>VS</span>
                  {si === 0 ? <Astra size={16} /> : (
                    <>
                      <span style={{ fontSize: 15, ...CHAL_STYLE }}>CHALLENGER</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#c2a07a' }}>{si}</span>
                    </>
                  )}
                </span>
                <div style={s.spacer} />
                <span style={{ fontSize: 11.5, color: sel.games === 0 ? '#3f4c66' : sel.hasData ? C.textMuted : C.textFaint, whiteSpace: 'nowrap' }}>{sel.games}판</span>
              </div>

              {sel.hasData ? (
                <div style={{ display: 'flex', flexDirection: 'column', padding: '0 18px 6px' }}>
                  {sel.rows.map((row: any) => (
                    <div key={row.label} style={s.statRow}>
                      <span style={{ fontSize: 12, color: C.textDim, whiteSpace: 'nowrap' }}>{row.label}</span>
                      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 10, minWidth: 0, flexWrap: 'nowrap' }}>
                        {row.single ? (
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, color: C.textGhost2 }}>{row.sub}</span>
                            <span style={{ fontSize: 17, fontWeight: 600, color: row.color }}>{row.value}</span>
                          </span>
                        ) : (
                          <>
                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', flex: 'none' }}>
                              <span style={{ fontSize: 9.5, color: C.textGhost, letterSpacing: '.06em' }}>스나</span>
                              <span style={{ fontSize: 10, color: C.textGhost2 }}>{row.sniSub}</span>
                              <span style={{ fontSize: 15, fontWeight: 600, color: row.sniColor }}>{row.sniValue}</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', flex: 'none' }}>
                              <span style={{ fontSize: 9.5, color: C.textGhost, letterSpacing: '.06em' }}>라플</span>
                              <span style={{ fontSize: 10, color: C.textGhost2 }}>{row.sub}</span>
                              <span style={{ fontSize: 15, fontWeight: 600, color: row.color }}>{row.value}</span>
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '14px 18px 8px', fontSize: 11.5, color: C.textGhost2 }}>10판 이상 기록이 쌓이면 승률·킬뎃을 표시합니다</div>
              )}

              {/* 판킬 · MVP · 핵의심 — 카드 하단으로 밀어 높이 맞춤 */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', padding: '0 18px 16px' }}>
                <div style={s.statRow}>
                  <span style={{ fontSize: 12, color: C.textDim, whiteSpace: 'nowrap' }}>판킬</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 10, minWidth: 0, flexWrap: 'nowrap' }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', flex: 'none' }}>
                      <span style={{ fontSize: 9.5, color: C.textGhost, letterSpacing: '.06em' }}>스나</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{sel.sniAvg}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap', flex: 'none' }}>
                      <span style={{ fontSize: 9.5, color: C.textGhost, letterSpacing: '.06em' }}>라플</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{sel.rifAvg}</span>
                    </span>
                  </span>
                </div>
                <div style={s.statRow}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 10.5, color: C.gold }}>★</span>
                    <span style={{ fontSize: 12, color: C.textDim }}>MVP</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 9, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: C.textGhost2, whiteSpace: 'nowrap' }}>{sel.games}판 중</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: C.gold }}>{sel.mvp}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: '#c9a94a' }}>회</span>
                    </span>
                    <span style={{ fontSize: 11, color: C.textDim, whiteSpace: 'nowrap' }}>{sel.mvpRate}</span>
                  </span>
                </div>

                {/* 핵의심 — 클릭하면 카운트 증가 (실제 신고 API 는 이번 범위 아님) */}
                <div onClick={() => { setReports(n => n + 1); setReported(true); }} style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: reported ? 'rgba(224,27,36,.12)' : 'rgba(224,27,36,.05)', border: `1px solid ${reported ? 'rgba(255,90,99,.55)' : 'rgba(224,27,36,.3)'}`, boxShadow: reported ? '0 0 16px rgba(224,27,36,.22)' : 'none' }}>
                  <span style={{ fontSize: 16, lineHeight: 1, flex: 'none' }}>🚨</span>
                  <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: reported ? '#ff6b6b' : '#c98f95' }}>핵의심</span>
                  <div style={s.spacer} />
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: reported ? '#ff6b6b' : '#c98f95' }}>{reports}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: reported ? '#c96b6b' : C.textDim }}>회</span>
                  </span>
                </div>
              </div>
            </div>

            <div style={s.halfCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${C.divider}` }}>
                <div style={s.ribbon} />
                <span style={{ ...s.cardTitle, letterSpacing: '.06em' }}>STRENGTH POINT</span>
                <div style={s.spacer} />
                <span style={{ fontSize: 10.5, color: C.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>시즌 Cloud 0 · 61전 기준</span>
              </div>
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '8px 18px 14px' }}>
                <StrengthHexagon />
              </div>
              <TraitBadges />
            </div>
          </div>

          {/* ═══ 승률 및 킬뎃 추이 ═══ */}
          <section style={{ ...s.card, marginTop: 16 }}>
            <div style={s.cardHead}>
              <div style={{ ...s.ribbon, background: C.red }} />
              <span style={s.cardTitle}>승률 및 킬뎃 추이</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                <span style={{ width: 15, height: 2, background: '#ff5a63' }} />
                <span style={{ fontSize: 11, color: C.textFaint }}>킬뎃</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 15, height: 2, background: '#7fa9ff' }} />
                <span style={{ fontSize: 11, color: C.textFaint }}>승률</span>
              </span>
              <span style={{ fontSize: 10.5, color: C.textGhost2, whiteSpace: 'nowrap' }}>그래프는 매일 오전 3시에 찍힙니다 · 2판 미만인 날은 찍히지 않습니다</span>
              <div style={s.spacer} />
              <span style={{ display: 'flex', gap: 5 }}>
                {RANGES.map(r => {
                  const on = range === r;
                  return <span key={r} onClick={() => setRange(r)} style={{ padding: '5px 13px', borderRadius: C.radiusCtl, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap', color: on ? '#fff' : '#7c8092', background: on ? '#1a1c24' : '#111218', border: `1px solid ${on ? '#3a3d4a' : '#24262f'}` }}>{r}</span>;
                })}
              </span>
            </div>
            <TrendChart />
          </section>

          {/* ═══ 최근 경기 ═══ */}
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={s.ribbon} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>최근 경기</span>
            <div style={{ flex: 1, height: 1, background: '#1a2438' }} />
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matches.map(m => {
              const open = openMatch === m.i;
              const edge = m.win ? C.blue : C.red;
              return (
                <div key={m.i} style={{ border: `1px solid ${C.cardBorder}`, borderRadius: C.radiusCard, overflow: 'hidden', borderLeft: `2px solid ${edge}`, background: open ? 'rgba(91,141,255,.04)' : C.card }}>
                  <div onClick={() => setOpenMatch(open ? null : m.i)} style={s.matchRow}>
                    <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.result}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>{m.map}</span>
                      <span style={{ fontSize: 10.5, color: C.textGhost2, whiteSpace: 'nowrap' }}>{m.time}</span>
                    </span>
                    {/* 팀 표기는 2줄 — 한 줄에 넣으면 절반 폭에서 클랜명이 짜부라진다 */}
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{ width: 20, height: 20, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${MARK})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: theme.ink, whiteSpace: 'nowrap', flex: 'none' }}>igloo</span>
                        <span style={{ fontSize: 10.5, color: '#3a4560', flex: 'none' }}>VS</span>
                        <span style={{ width: 20, height: 20, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(/assets/clans/${m.emb}.png)`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                        <span style={{ fontSize: 12.5, color: '#9aa6bf', whiteSpace: 'nowrap', flex: 'none' }}>{m.opp}</span>
                      </span>
                      <Astra size={10} />
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minWidth: 0, overflow: 'hidden' }}>
                      {m.mvpIsMe && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none', padding: '3px 7px', borderRadius: C.radiusChip, whiteSpace: 'nowrap', background: 'rgba(255,216,61,.10)', border: '1px solid rgba(255,216,61,.55)', boxShadow: '0 0 12px rgba(255,216,61,.22)' }}>
                          <span style={{ fontSize: 10.5, color: C.gold }}>★</span>
                          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color: C.gold }}>MVP</span>
                        </span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, flex: 'none', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#eef4ff' }}>{m.me.k}</span>
                        <span style={{ color: '#3a4560' }}>/</span>
                        <span style={{ color: '#ff5a63' }}>{m.me.d}</span>
                        <span style={{ color: '#3a4560' }}>/</span>
                        <span style={{ color: '#eef4ff' }}>{m.me.a}</span>
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap', color: statColor(m.me.kd) }}>{m.me.kd.toFixed(1)}%</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, whiteSpace: 'nowrap', fontSize: 10.5, color: open ? '#a9c3ff' : C.textGhost }}>
                      상세 <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
                    </span>
                  </div>

                  {open && (
                    <div style={{ background: '#0a0f1a', borderTop: `1px solid ${C.divider}`, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {m.teams.map(t => (
                        <div key={t.name} style={{ border: `1px solid ${C.divider}`, borderRadius: 8, background: 'linear-gradient(160deg,#111b2c,#0c1420)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', borderBottom: `1px solid ${C.rowDivider}`, borderLeft: `2px solid ${t.ink}` }}>
                            <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${t.emb})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: t.ink }}>{t.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: t.ink }}>{t.result}</span>
                            <div style={s.spacer} />
                            <span style={{ fontSize: 11, color: '#4e5b76', whiteSpace: 'nowrap' }}>{t.score}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 104px 60px 74px', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${C.rowDivider}`, fontSize: 9.5, color: '#3f4c66', letterSpacing: '.08em' }}>
                            <span>플레이어</span><span>K / D / A</span>
                            <span style={{ textAlign: 'right' }}>세이브</span>
                            <span style={{ textAlign: 'right' }}>킬뎃</span>
                          </div>
                          {t.players.map(p => <ScoreRow key={p.name} row={p} />)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
