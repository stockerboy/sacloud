'use client';

/**
 * SACLOUD 클랜 상세 v3 — 단일 파일 컴포넌트 (Next.js + React + TypeScript)
 *
 * 사용법
 *   1) components/clan/ClanDetailV3.tsx 로 저장
 *   2) 라우트에서 <ClanDetailV3 /> 렌더
 *   3) 폰트: Chakra Petch(영문·숫자) + Noto Sans KR(한글) 을 layout.tsx 에서 로드
 *
 * 범위
 *   UI 만. API / DB / Collector / 랭킹·시즌 계산은 포함하지 않는다. 데이터는 아래 Mock 상수뿐.
 *
 * ★ 가장 중요한 규칙 — "클랜 배경색 테마"
 *   이 페이지의 여러 영역은 **그 클랜의 클랜마크에서 뽑은 색**으로 배경을 칠한다.
 *   자세한 설명과 적용 위치는 CLAN_THEME 주석과 README(CLAN_THEME_GUIDE.md) 참고.
 */

import { useState, type CSSProperties } from 'react';

/* ═══════════════════════════════════════════════════════════
   1. 색상 규칙 (등수 / 수치)
   ═══════════════════════════════════════════════════════════ */

/** 등수·닉네임 공용. 1~3위 빨강 / 4~20위 노랑 / 21~40위 파랑 / 41~100위 초록 / 101위~ 하양 */
export function rankColor(rank: number): string {
  if (rank <= 3) return '#ff4d4d';
  if (rank <= 20) return '#ffd83d';
  if (rank <= 40) return '#5b9dff';
  if (rank <= 100) return '#22c55e';
  return '#ffffff';
}
export const nameColor = rankColor;

/** 0~100 스케일 수치(승률·킬뎃 등). 등수에는 쓰지 않는다. 래더 점수도 대상 아님(흰색). */
export function statColor(v: number): string {
  if (Number.isNaN(v)) return '#8a8a93';
  if (v < 40) return '#e01b24';
  if (v < 50) return '#ffffff';
  if (v < 55) return '#22c55e';
  if (v < 60) return '#a06a35';
  if (v < 65) return '#5b8dff';
  return '#f5c518';
}

/* ═══════════════════════════════════════════════════════════
   2. ★ 클랜 테마 — 클랜마크 색으로 배경을 칠하는 부분
   ═══════════════════════════════════════════════════════════

   왜: 클랜 상세 페이지는 "그 클랜의 색"이 느껴져야 한다. 그래서 배경·엣지·워터마크를
       클랜마크(엠블럼 이미지)에서 실제로 추출한 색으로 칠한다.

   색을 어떻게 얻는가:
       클랜마크 PNG 에서 대표색 3개를 뽑아 아래 ClanTheme 로 정의한다.
         light  : 마크의 가장 밝은 부분  (igloo = 얼음/하늘 #e6f7f7)
         main   : 마크의 대표색          (igloo = 빙하 하늘색 #81d3ef)
         deep   : 마크의 짙은 부분        (igloo = 청록 #3cb0d2)
         edge   : 카드 상단 액센트 라인   (main 보다 한 톤 밝게)
       운영에서는 업로드 시 서버가 평균/대표색을 뽑아 저장해도 되고,
       지금처럼 클랜별 상수 테이블로 관리해도 된다. **하드코딩된 파랑을 쓰지 말 것.**

   어디에 쓰는가 (이 파일에서 theme.* 를 참조하는 5곳):
       (A) 성향 분석 카드 본문 배경   — 위쪽 light, 아래쪽 deep 그라데이션 + 빙원 능선 + 마크 워터마크
       (B) 상단 클랜 띠 상단 엣지     — theme.edge 2px
       (C) SET SCORE 헤더 좌/우 분할  — 승률 비율(61.9% : 38.1%)만큼 두 클랜 테마로 배경을 나눠 칠함
       (D) 세트 승률 막대             — 각 클랜 테마 그라데이션
       (E) 엠블럼 링 / 클랜명 글자색   — theme.light 계열 발광

   상대 클랜(veritas)은 자기 테마(골드)를 쓴다. 즉 한 화면에 두 테마가 좌/우로 공존한다.
*/

export type ClanTheme = {
  light: string;   // 가장 밝은 색
  main: string;    // 대표색
  deep: string;    // 짙은 색
  edge: string;    // 상단 액센트 라인
  ink: string;     // 클랜명 텍스트
  rgb: string;     // rgba() 조합용 "r,g,b" (main)
};

/** igloo = 북극곰 + 빙하 → 얼음 하늘색 계열 */
const IGLOO: ClanTheme = {
  light: '#e6f7f7',
  main: '#81d3ef',
  deep: '#3cb0d2',
  edge: '#a8e8ff',
  ink: '#bfe6ff',
  rgb: '129,211,239',
};

/** veritas = 금빛 문양 → 골드 계열 */
const VERITAS: ClanTheme = {
  light: '#fff0c6',
  main: '#ffd970',
  deep: '#c99a2e',
  edge: '#ffd970',
  ink: '#ffd970',
  rgb: '255,217,112',
};

/* ═══════════════════════════════════════════════════════════
   3. 토큰
   ═══════════════════════════════════════════════════════════ */
const C = {
  pageBg: 'radial-gradient(1200px 700px at 50% -8%, #142238 0%, #0c1526 42%, #070d1c 100%)',
  bar: 'linear-gradient(160deg,#0d1524,#080d18)',
  barBorder: '#16202e',
  card: 'linear-gradient(160deg,#152036 0%,#101a2c 58%)',
  cardBorder: '#1e2a42',
  divider: '#1b2537',
  rowDivider: '#18233a',
  rowDivider2: '#141d2c',
  plot: '#0a1220',
  chip: '#0e1728',
  chipBorder: '#24314c',
  text: '#e8eaf2',
  textStrong: '#ffffff',
  textMuted: '#a4b0c8',
  textDim: '#7c88a4',
  textFaint: '#6b7690',
  textGhost: '#5c6a84',
  textGhost2: '#4e5b74',
  blue: '#5b8dff',
  red: '#e01b24',
  gold: '#ffd83d',
  radiusCard: 10,
  radiusBlock: 8,
  radiusCtl: 7,
  radiusChip: 5,
} as const;

/** ASTRA 는 무조건 영롱하게 — 홀로그램 그라데이션 텍스트 */
const ASTRA_STYLE: CSSProperties = {
  background: 'linear-gradient(92deg,#8ff0ff 0%,#c9b6ff 34%,#ffd6f2 58%,#8ff0ff 100%)',
  backgroundSize: '220% 100%',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  fontWeight: 700,
  letterSpacing: '.16em',
  filter: 'drop-shadow(0 0 7px rgba(160,220,255,.75)) drop-shadow(0 0 16px rgba(190,150,255,.4))',
  animation: 'sacAstra 5.5s ease-in-out infinite',
};
/** CHALLENGER 는 ASTRA 보다 덜 강조 — 단색 브론즈 */
const CHAL_STYLE: CSSProperties = { color: '#a98a64', fontWeight: 500, letterSpacing: '.12em' };

/* ═══════════════════════════════════════════════════════════
   4. Mock 데이터
   ═══════════════════════════════════════════════════════════ */
const CLAN = { name: 'igloo', region: 'ASTRA', tier: '1티어', rank: 1, pool: '12팀', members: 109 };

const CLAN_TABS = ['기록실', '클랜원', '지난시즌'] as const;
const LEAGUE_TABS = ['클랜랭킹', '개인랭킹', 'LIVE', '게시판'] as const;

/** 구간별 승률 — ‹ › 화살표로 순환 */
const REGION_WINS: [string, number, number][] = [
  ['ASTRA', 82, 39],
  ['SPECTRA', 46, 31],
  ['BEDROCK', 18, 22],
];

/** 클랜 성향 6축 — 게임템포만 텍스트, 나머지는 등수 */
const TRAITS: { label: string; value: number; note: string; noteColor: string }[] = [
  { label: '스나싸움', value: 78, note: '1위', noteColor: '#ff4d4d' },
  { label: '소수싸움', value: 64, note: '2위', noteColor: '#ff4d4d' },
  { label: '세이브', value: 52, note: '8위', noteColor: '#ffd83d' },
  { label: '게임템포', value: 71, note: '빠른 전개', noteColor: '#a9c3ff' },
  { label: '선짤', value: 46, note: '24위', noteColor: '#5b9dff' },
  { label: '교환율', value: 83, note: '3위', noteColor: '#ff4d4d' },
];

const ASTRA_CLANS = ['deluxe', 'methodcrew', 'sometimes', 'hardcores', 'vuvuzela', 'grave', 'veritas', 'evermore', 'hing'];

/** 상대전적 추이 — 키포인트 사이를 잘게 쪼개고 "경기 없는 날"은 평평하게 */
const H2H_KEY = [46, 44, 49, 52, 50, 55, 53, 58, 57, 60, 59, 61.9];
function buildH2HShare(): number[] {
  const out: number[] = [];
  let sd = 1337;
  const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const STEPS = 14;
  for (let i = 0; i < H2H_KEY.length - 1; i++) {
    const a = H2H_KEY[i], b = H2H_KEY[i + 1];
    const flat = rnd() < 0.58;          // 이 구간은 경기가 없던 주 → 직선
    let last = a;
    for (let k = 0; k < STEPS; k++) {
      const t = k / STEPS;
      const base = a + (b - a) * t;
      if (flat && k < STEPS * 0.68) { out.push(a); last = a; continue; }
      let v = base + (rnd() - 0.5) * 1.5;
      v = last + (v - last) * 0.55;     // 스무딩 — 과한 톱니 방지
      out.push(v); last = v;
    }
  }
  out.push(H2H_KEY[H2H_KEY.length - 1]);
  return out;
}

/** 맞대결 경기 + 스코어보드 */
const H2H_MATCHES: [string, string, string, string, string][] = [
  ['승리', '제3보급창고', '14시간 전 01:10', '늄냠', '6:0'],
  ['승리', '제3보급창고', '2일 전 23:41', '밤빵걸', '6:3'],
  ['패배', '제3보급창고', '5일 전 22:18', '반짝명이', '4:6'],
  ['승리', '제3보급창고', '9일 전 00:52', '늄냠', '6:1'],
  ['패배', '제3보급창고', '13일 전 23:07', '푸씨맨', '2:6'],
  ['승리', '제3보급창고', '18일 전 01:33', '반짝굴비', '6:4'],
];

/** 선수 소속 마크 / 스나이퍼 / 세이브 */
const PLAYER_EMB: Record<string, string> = {
  '늄냠': 'igloo-fit', '밤빵걸': 'igloo-fit', '반짝명이': 'igloo-fit', '푸씨맨': 'igloo-fit', '반짝굴비': 'igloo-fit',
  '베리타스차코': 'veritas', '삐패': 'veritas', '메이져강산': 'deluxe', '루니트': 'veritas', '하늘색우산': 'veritas',
};
const SNIPERS = ['늄냠', '메이져강산'];
const SAVES: Record<string, number> = {
  '늄냠': 3, '밤빵걸': 1, '반짝명이': 2, '푸씨맨': 0, '반짝굴비': 1,
  '베리타스차코': 2, '삐패': 1, '메이져강산': 4, '루니트': 0, '하늘색우산': 1,
};

/** 최근 경기 — 래더 ±점수, 구간 라벨(ASTRA / CHALLENGER n) */
const RECENT: { result: string; map: string; time: string; opp: string; emb: string; label: string; delta: number }[] = [
  { result: '승리', map: '제3보급창고', time: '14시간 전 01:10', opp: 'deluxe', emb: 'deluxe', label: 'ASTRA', delta: 9 },
  { result: '승리', map: '제3보급창고', time: '14시간 전 00:52', opp: 'methodcrew', emb: 'methodcrew', label: '1', delta: 3 },
  { result: '패배', map: '제3보급창고', time: '15시간 전 00:31', opp: 'sometimes', emb: 'sometimes', label: 'ASTRA', delta: -6 },
  { result: '승리', map: '제3보급창고', time: '15시간 전 00:14', opp: '// veritas', emb: 'veritas', label: '2', delta: 7 },
];

/* ═══════════════════════════════════════════════════════════
   5. 차트 지오메트리
   ═══════════════════════════════════════════════════════════ */
const HX = 150, HY = 120, HR = 74;                 // 육각형 중심/반지름 (viewBox 300×262, 스케일 1)
const hexPt = (i: number, f: number): [number, number] => {
  const a = -Math.PI / 2 + (Math.PI * 2 * i) / 6;
  return [+(HX + Math.cos(a) * HR * f).toFixed(1), +(HY + Math.sin(a) * HR * f).toFixed(1)];
};
const HEX_RINGS = [1, .875, .75, .625, .5, .375, .25, .125].map(f =>
  TRAITS.map((_, i) => hexPt(i, f).join(',')).join(' '));
const HEX_SPOKES = TRAITS.map((_, i) => hexPt(i, 1));
const HEX_AREA = TRAITS.map((t, i) => hexPt(i, t.value / 100).join(',')).join(' ');
/** 축 라벨은 SVG 스케일 영향을 받으니 리터럴 좌표로 배치 */
const HEX_LABELS: [number, number, 'start' | 'middle' | 'end'][] = [
  [150, 26, 'middle'], [232, 78, 'start'], [232, 170, 'start'],
  [150, 222, 'middle'], [68, 170, 'end'], [68, 78, 'end'],
];

const H2H_X0 = 34.3, H2H_X1 = 549.7;
const h2hY = (share: number) => 262 - ((Math.max(30, Math.min(70, share)) - 30) / 40) * 236;
const H2H_WEEK_LABELS = ['9/3', '9/10', '9/17', '9/24', '10/1'];   // 9/3 시작 → 10/1 종료, 주 단위

/* ═══════════════════════════════════════════════════════════
   6. 스타일
   ═══════════════════════════════════════════════════════════ */
const s = {
  page: { width: '100%', minHeight: '100vh', background: C.pageBg, color: C.text, fontFamily: "'Chakra Petch','Noto Sans KR',system-ui,sans-serif", letterSpacing: '.01em', WebkitFontSmoothing: 'antialiased' },
  spacer: { flex: 1 },

  barWrap: { padding: '14px 24px 0' },
  bar: { maxWidth: 1180, margin: '0 auto', height: 68, display: 'flex', alignItems: 'center', gap: 36, padding: '0 24px', boxSizing: 'border-box', background: C.bar, border: `1px solid ${C.barBorder}`, borderRadius: 14 },
  tabBarWrap: { padding: '10px 24px 0' },
  tabBar: { maxWidth: 1180, margin: '0 auto', height: 54, display: 'flex', alignItems: 'stretch', padding: '0 12px', boxSizing: 'border-box', background: C.bar, border: `1px solid ${C.barBorder}`, borderRadius: 14, overflow: 'hidden' },
  tab: { display: 'flex', alignItems: 'center', margin: '9px 3px', padding: '0 20px', borderRadius: 9, fontSize: 14 },

  body: { maxWidth: 1420, margin: '0 auto', padding: '0 90px 90px', boxSizing: 'border-box' },
  inner: { background: 'transparent', padding: '0 46px 70px' },

  clanTabs: { paddingTop: 22, display: 'flex', alignItems: 'stretch', gap: 6 },
  clanTab: { padding: '9px 20px', borderRadius: 9, fontSize: 13.5 },

  /** (B) 상단 클랜 띠 — border-top 이 theme.edge */
  band: { position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 13, padding: '14px 18px', borderBottom: `1px solid ${C.divider}` },

  card: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: C.radiusCard },
  cardHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${C.divider}` },
  ribbon: { width: 22, height: 2, background: C.blue },
  cardTitle: { fontSize: 13, fontWeight: 700, color: C.textStrong, whiteSpace: 'nowrap' },

  /** (A) 성향 분석 본문 — 클랜 테마 배경이 깔리는 영역 */
  traitBody: { position: 'relative', overflow: 'hidden', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '14px 22px 20px' },
  kpiCol: { position: 'relative', flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column' },
  kpiRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', alignItems: 'baseline', gap: 12, padding: '13px 4px', borderBottom: '1px solid #18222f' },
  kpiLabel: { fontSize: 11.5, color: C.textDim, letterSpacing: '.06em', whiteSpace: 'nowrap' },
  kpiValue: { fontSize: 22, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' },
  kpiSub: { fontSize: 11.5, color: C.textGhost, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  stepBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flex: 'none', fontSize: 10, color: '#8fa2c4', background: C.chip, border: `1px solid ${C.chipBorder}`, borderRadius: C.radiusChip, cursor: 'pointer', fontFamily: 'inherit' },

  matchRow: { display: 'grid', gridTemplateColumns: '70px 150px minmax(0,1fr) 108px', alignItems: 'center', gap: 14, padding: '13px 18px', background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: C.radiusCard, overflow: 'hidden' },
  playerRow: { position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 108px 64px 78px', gap: 10, alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${C.rowDivider2}` },
} satisfies Record<string, CSSProperties>;

/* ═══════════════════════════════════════════════════════════
   7. 하위 컴포넌트
   ═══════════════════════════════════════════════════════════ */

const Astra = ({ size = 10 }: { size?: number }) => (
  <span style={{ ...ASTRA_STYLE, fontSize: size, whiteSpace: 'nowrap' }}>ASTRA</span>
);

/** (A) 클랜 테마 배경 레이어 — 성향 분석 카드 본문에 깔린다 */
function ClanBackdrop({ theme, mark }: { theme: ClanTheme; mark: string }) {
  return (
    <>
      {/* 마크 워터마크 (좌측, 아주 옅게) */}
      <span aria-hidden style={{ position: 'absolute', left: '-4%', top: '8%', width: '58%', height: '112%', backgroundImage: `url(${mark})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'left center', opacity: .13, pointerEvents: 'none' }} />
      {/* 위쪽 = 마크의 밝은 색 */}
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '62%', background: `linear-gradient(180deg, ${theme.light}33, ${theme.main}1a 55%, transparent)`, pointerEvents: 'none' }} />
      {/* 아래쪽 = 마크의 짙은 색 */}
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%', background: `linear-gradient(0deg, ${theme.deep}38, ${theme.main}12 60%, transparent)`, pointerEvents: 'none' }} />
      {/* 능선 실루엣 (igloo=빙산). clip-path 로 지형을 만든다 */}
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', background: `linear-gradient(0deg, ${theme.main}57, ${theme.main}0d)`, clipPath: 'polygon(0% 100%, 0% 46%, 13% 30%, 27% 52%, 41% 22%, 56% 48%, 70% 26%, 84% 50%, 100% 34%, 100% 100%)', pointerEvents: 'none' }} />
    </>
  );
}

function TraitHexagon() {
  return (
    <svg viewBox="0 0 300 262" style={{ width: 300, height: 262, flex: '0 0 300px', display: 'block' }}>
      <defs>
        <radialGradient id="hexFill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6a6a" stopOpacity=".22" />
          <stop offset="100%" stopColor="#e01b24" stopOpacity=".04" />
        </radialGradient>
        <filter id="hexGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="b1" />
          <feGaussianBlur stdDeviation="13" result="b2" />
          <feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {HEX_RINGS.map((p, i) => <polygon key={i} points={p} fill="none" stroke="#41527a" strokeWidth={1.1} />)}
      {HEX_SPOKES.map(([x, y], i) => <line key={i} x1={HX} y1={HY} x2={x} y2={y} stroke="#41527a" strokeWidth={1.1} />)}
      <polygon points={HEX_AREA} fill="url(#hexFill)" stroke="#ff5c5c" strokeWidth={1.8} strokeOpacity={.85} strokeLinejoin="round" filter="url(#hexGlow)" />
      {TRAITS.map((t, i) => {
        const [x, y, anchor] = HEX_LABELS[i];
        return (
          <g key={t.label}>
            <text x={x} y={y} textAnchor={anchor} fontSize="12" fontWeight="700" fill="#a4b0c8">{t.label}</text>
            <text x={x} y={y + 14} textAnchor={anchor} fontSize="11.5" fontWeight="700" fill={t.noteColor}>{t.note}</text>
          </g>
        );
      })}
    </svg>
  );
}

function H2HChart() {
  const share = buildH2HShare();
  const pts = share.map((v, i) => {
    const x = H2H_X0 + ((H2H_X1 - H2H_X0) * i) / (share.length - 1);
    return { x: +x.toFixed(1), blue: +h2hY(v).toFixed(1), red: +h2hY(100 - v).toFixed(1) };
  });
  const blue = pts.map(p => `${p.x},${p.blue}`).join(' ');
  const red = pts.map(p => `${p.x},${p.red}`).join(' ');
  const end = pts[pts.length - 1];
  const xs = H2H_WEEK_LABELS.map((_, i) => +(H2H_X0 + ((H2H_X1 - H2H_X0) * i) / (H2H_WEEK_LABELS.length - 1)).toFixed(1));

  return (
    <div style={{ padding: '6px 12px 10px', background: C.plot }}>
      <svg viewBox="0 0 640 330" style={{ width: '100%', height: 330, display: 'block' }}>
        <defs>
          <filter id="h2hGlowB" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="b1" /><feGaussianBlur stdDeviation="16" result="b2" />
            <feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="h2hGlowR" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="r1" /><feGaussianBlur stdDeviation="16" result="r2" />
            <feMerge><feMergeNode in="r2" /><feMergeNode in="r1" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width="640" height="330" fill={C.plot} />
        {[30, 40, 50, 60, 70].map(g => (
          <g key={g}>
            <line x1={H2H_X0} y1={h2hY(g)} x2={H2H_X1} y2={h2hY(g)} stroke="#111826" />
            <text x={H2H_X0 - 8} y={h2hY(g) + 4} textAnchor="end" fill="#7c88a4" fontSize="11">{g}%</text>
          </g>
        ))}
        {xs.slice(1, -1).map(x => <line key={x} x1={x} y1={26} x2={x} y2={262} stroke="#111826" strokeDasharray="3 5" />)}
        {xs.map((x, i) => (
          <text key={x} x={x} y={292} textAnchor={i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'} fill="#7c88a4" fontSize="11">
            {H2H_WEEK_LABELS[i]}
          </text>
        ))}
        <line x1={H2H_X1} y1={20} x2={H2H_X1} y2={268} stroke="#2b3a58" />
        <text x={H2H_X1} y={16} textAnchor="middle" fill="#8f9bb5" fontSize="14" fontWeight="700">now</text>

        {/* 데이터 선: 헤일로(13) → 중간(7) → 코어(3.4). 상대 클랜 선은 그 클랜 테마색 */}
        <polyline points={red} fill="none" stroke={VERITAS.deep} strokeWidth={13} strokeLinejoin="miter" strokeLinecap="round" filter="url(#h2hGlowR)" opacity={0.5} />
        <polyline points={blue} fill="none" stroke={C.blue} strokeWidth={13} strokeLinejoin="miter" strokeLinecap="round" filter="url(#h2hGlowB)" opacity={0.55} />
        <polyline points={red} fill="none" stroke={VERITAS.deep} strokeWidth={7} strokeLinejoin="miter" strokeLinecap="round" opacity={0.42} />
        <polyline points={blue} fill="none" stroke="#7fa9ff" strokeWidth={7} strokeLinejoin="miter" strokeLinecap="round" opacity={0.45} />
        <polyline points={red} fill="none" stroke={VERITAS.main} strokeWidth={3.4} strokeLinejoin="miter" strokeLinecap="round" opacity={0.95} />
        <polyline points={blue} fill="none" stroke="#dbe8ff" strokeWidth={3.4} strokeLinejoin="miter" strokeLinecap="round" opacity={0.95} />

        {/* 엔드 마커 — 링 색도 각 클랜 테마 */}
        <circle cx={H2H_X1} cy={end.blue} r={26} fill="none" stroke={C.blue} strokeWidth={7} filter="url(#h2hGlowB)" opacity={0.55} />
        <circle cx={H2H_X1} cy={end.blue} r={22} fill={C.chip} stroke="#7fa9ff" strokeWidth={2} />
        <image href="/assets/clans/igloo-fit.png" x={H2H_X1 - 18} y={end.blue - 18} width="36" height="36" clipPath="circle(18px at 18px 18px)" />
        <text x={H2H_X1 + 30} y={end.blue + 10} fill="#ffffff" fontSize="20" fontWeight="700">61.9%</text>

        <circle cx={H2H_X1} cy={end.red} r={26} fill="none" stroke={VERITAS.deep} strokeWidth={7} filter="url(#h2hGlowR)" opacity={0.5} />
        <circle cx={H2H_X1} cy={end.red} r={22} fill={C.chip} stroke={VERITAS.main} strokeWidth={2} />
        <image href="/assets/clans/veritas.png" x={H2H_X1 - 18} y={end.red - 18} width="36" height="36" clipPath="circle(18px at 18px 18px)" />
        <text x={H2H_X1 + 30} y={end.red + 10} fill="#ffffff" fontSize="20" fontWeight="700">38.1%</text>

        <g>
          <line x1={H2H_X0} y1={312} x2={H2H_X0 + 16} y2={312} stroke="#7fa9ff" strokeWidth={3} filter="url(#h2hGlowB)" />
          <line x1={H2H_X0} y1={312} x2={H2H_X0 + 16} y2={312} stroke="#dbe8ff" strokeWidth={1.6} />
          <text x={H2H_X0 + 22} y={319} fill={IGLOO.ink} fontSize="14">igloo</text>
          <line x1={H2H_X0 + 90} y1={312} x2={H2H_X0 + 106} y2={312} stroke={VERITAS.deep} strokeWidth={3} filter="url(#h2hGlowR)" />
          <line x1={H2H_X0 + 90} y1={312} x2={H2H_X0 + 106} y2={312} stroke={VERITAS.main} strokeWidth={1.6} />
          <text x={H2H_X0 + 112} y={319} fill={VERITAS.ink} fontSize="14">// veritas</text>
        </g>
      </svg>
    </div>
  );
}

/** 스코어보드 한 행 — MVP 는 뱃지 대신 행 배경으로 표시, 스나이퍼는 SNIPER 워터마크 */
function PlayerRow({ name, k, d, a, mvp }: { name: string; k: number; d: number; a: number; mvp: boolean }) {
  const kd = (k / (k + d)) * 100;
  const save = SAVES[name] ?? 0;
  const sniper = SNIPERS.includes(name);
  return (
    <div style={{
      ...s.playerRow,
      background: mvp ? 'linear-gradient(100deg,rgba(255,216,61,.10),rgba(255,216,61,.02) 55%,transparent)' : 'transparent',
      boxShadow: mvp ? 'inset 3px 0 0 #ffd83d, inset 0 0 26px rgba(255,216,61,.10)' : 'none',
    }}>
      {/* 워터마크: SNIPER 는 왼쪽(34%), MVP 는 오른쪽(64%) — 서로 겹치지 않게 */}
      {sniper && (
        <span aria-hidden style={{ position: 'absolute', left: '34%', top: '50%', transform: 'translate(-50%,-50%) skewX(-16deg) scaleY(0.9) scaleX(1.16)', fontSize: 26, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.5em', color: C.red, opacity: .17, WebkitTextStroke: `3.4px ${C.red}`, whiteSpace: 'nowrap', pointerEvents: 'none' }}>SNIPER</span>
      )}
      {mvp && (
        <span aria-hidden style={{ position: 'absolute', left: '64%', top: '50%', transform: 'translateY(-50%) skewX(-12deg) scaleY(0.92)', fontSize: 26, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.24em', color: C.gold, opacity: .15, WebkitTextStroke: `2.4px ${C.gold}`, whiteSpace: 'nowrap', pointerEvents: 'none' }}>MVP</span>
      )}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {/* 닉네임 앞 = 소속 클랜마크 */}
        <span style={{ width: 20, height: 20, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(/assets/clans/${PLAYER_EMB[name] ?? 'igloo-fit'}.png)`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
        <span style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', color: mvp ? '#ffe89a' : '#c3cbdb' }}>{name}</span>
      </span>
      {/* 킬·어시 흰색 / 데스 빨강 */}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap' }}>
        <span style={{ color: '#eef4ff' }}>{k}</span>
        <span style={{ color: '#3a4560' }}>/</span>
        <span style={{ color: '#ff5a63' }}>{d}</span>
        <span style={{ color: '#3a4560' }}>/</span>
        <span style={{ color: '#eef4ff' }}>{a}</span>
      </span>
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', color: save >= 3 ? '#8ff0ff' : save > 0 ? '#a4b0c8' : '#3f4c66' }}>{save}회</span>
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', color: statColor(kd) }}>{kd.toFixed(1)}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   8. 페이지
   ═══════════════════════════════════════════════════════════ */
export default function ClanDetailV3() {
  const [clanTab, setClanTab] = useState<(typeof CLAN_TABS)[number]>('기록실');
  const [regionIdx, setRegionIdx] = useState(0);
  const [openMatch, setOpenMatch] = useState<number | null>(0);

  const theme = IGLOO;                       // ★ 이 클랜의 테마 (클랜마크 색)
  const oppTheme = VERITAS;                  // ★ 상대 클랜의 테마
  const mark = '/assets/clans/igloo-fit.png';
  const ink = rankColor(CLAN.rank);

  const rw = REGION_WINS[regionIdx % REGION_WINS.length];
  const rRate = (rw[1] / (rw[1] + rw[2])) * 100;

  const kpis = [
    { label: '래더', value: '3,725점', sub: '', astra: false, color: '#ffffff' },
    { label: '구간 승률', value: `${rRate.toFixed(1)}%`, sub: `${rw[1]}승 ${rw[2]}패`, astra: true, picker: true, color: statColor(rRate) },
    { label: '순위', value: '1위', sub: `/ ${CLAN.pool}`, astra: true, color: ink },
    { label: '최다연승', value: '10연승', sub: '', astra: false, color: '#f5c518' },
  ];

  const BLUE_SHARE = 61.9;                   // (C)(D) 좌우 분할 비율

  return (
    <div style={s.page}>
      <style>{`
        @keyframes sacAstra{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes sacSweep{0%{transform:translateX(-120%)}55%,100%{transform:translateX(320%)}}
      `}</style>

      {/* 상단 로고 바 — 라운드 카드형 */}
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

      {/* 리그 탭 — 라운드 필 */}
      <div style={s.tabBarWrap}>
        <nav style={s.tabBar}>
          {LEAGUE_TABS.map(t => {
            const on = t === '클랜랭킹';
            return (
              <div key={t} style={{ ...s.tab, color: on ? '#fff' : '#7c8092', fontWeight: on ? 700 : 400, background: on ? 'rgba(91,141,255,.14)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px rgba(91,141,255,.42)' : 'none' }}>{t}</div>
            );
          })}
        </nav>
      </div>

      <main style={s.body}>
        <div style={s.inner}>
          {/* 클랜 탭 */}
          <div style={s.clanTabs}>
            {CLAN_TABS.map(t => {
              const on = t === clanTab;
              return (
                <div key={t} onClick={() => setClanTab(t)} style={{ ...s.clanTab, cursor: 'pointer', color: on ? '#fff' : '#7c8092', fontWeight: on ? 700 : 400, background: on ? 'rgba(91,141,255,.14)' : 'transparent', boxShadow: on ? 'inset 0 0 0 1px rgba(91,141,255,.42)' : 'none' }}>{t}</div>
              );
            })}
          </div>

          {/* ═══ 클랜 카드: (B) 상단 엣지 = theme.edge, (A) 본문 = 클랜 테마 배경 ═══ */}
          <section style={{ ...s.card, marginTop: 16, borderTop: `2px solid ${theme.edge}` }}>
            <div style={s.band}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ position: 'relative', width: 42, height: 42, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${mark})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', boxShadow: `0 0 0 1px ${theme.edge}a6, 0 0 20px ${theme.main}6b` }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  {/* (E) 클랜명 = theme.ink + 테마 글로우 */}
                  <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', color: theme.ink, textShadow: `0 0 16px ${theme.main}80` }}>{CLAN.name}</span>
                  <span style={{ fontSize: 11, color: '#6f93b4', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>시즌 Cloud 0 · 121전 기준</span>
                </span>
              </span>
              {/* IPL 은 in-flow 중앙 열 — absolute 로 두면 좌우 콘텐츠와 겹친다 */}
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 26, height: 1, background: 'linear-gradient(90deg,rgba(91,141,255,0),#5b8dff)' }} />
                  <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: '.22em', color: '#fff', lineHeight: 1, textShadow: '0 0 18px rgba(91,141,255,.55),0 0 40px rgba(91,141,255,.22)', whiteSpace: 'nowrap' }}>IPL</span>
                  <span style={{ width: 26, height: 1, background: 'linear-gradient(90deg,#5b8dff,rgba(91,141,255,0))' }} />
                </span>
                <span style={{ fontSize: 9, letterSpacing: '.34em', color: C.textGhost2, whiteSpace: 'nowrap' }}>SEASON CLOUD 0</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#cfeeff', border: `1px solid ${theme.main}8c`, borderRadius: 999, background: `${theme.main}1f`, boxShadow: `0 0 14px ${theme.main}38`, padding: '5px 11px', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 5, height: 5, background: theme.edge }} />공식
                </span>
                <span style={{ fontSize: 11.5, color: '#cfeeff', border: `1px solid ${theme.main}73`, borderRadius: C.radiusCtl, background: `${theme.main}1a`, padding: '6px 13px', whiteSpace: 'nowrap' }}>전적갱신</span>
                <span style={{ fontSize: 11.5, color: '#a4b6c8', border: '1px solid #24384c', borderRadius: C.radiusCtl, background: '#0e1a28', padding: '6px 13px', whiteSpace: 'nowrap' }}>기본정보</span>
              </span>
            </div>

            <div style={s.traitBody}>
              <ClanBackdrop theme={theme} mark={mark} />

              <div style={s.kpiCol}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', padding: '0 4px 12px', borderBottom: '1px solid #18222f' }}>
                  <span style={{ fontSize: 11, color: C.textMuted, border: `1px solid ${C.chipBorder}`, borderRadius: C.radiusChip, background: C.chip, padding: '3px 8px', whiteSpace: 'nowrap' }}>{CLAN.tier}</span>
                  <span style={{ fontSize: 11, border: '1px solid rgba(143,240,255,.35)', borderRadius: C.radiusChip, background: 'rgba(143,240,255,.06)', padding: '3px 9px', whiteSpace: 'nowrap', ...ASTRA_STYLE }}>ASTRA</span>
                  <span style={{ fontSize: 11, color: C.textFaint, whiteSpace: 'nowrap' }}>클랜원 {CLAN.members}명</span>
                  <span style={{ fontSize: 11, color: C.textGhost2, whiteSpace: 'nowrap' }}>· 최근갱신 기록 없음</span>
                </div>

                {kpis.map(k => (
                  <div key={k.label} style={s.kpiRow}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {k.picker && <button type="button" style={s.stepBtn} onClick={() => setRegionIdx(i => (i + REGION_WINS.length - 1) % REGION_WINS.length)}>‹</button>}
                      <span style={s.kpiLabel}>{k.label}</span>
                      {k.picker && <button type="button" style={s.stepBtn} onClick={() => setRegionIdx(i => (i + 1) % REGION_WINS.length)}>›</button>}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                        {k.astra && <Astra size={11} />}
                        <span style={s.kpiSub}>{k.sub}</span>
                      </span>
                      <span style={{ ...s.kpiValue, flex: 'none', color: k.color }}>{k.value}</span>
                    </span>
                  </div>
                ))}
              </div>

              <TraitHexagon />
            </div>
          </section>

          {/* vs ASTRA 스트립 — nowrap + 엠블럼 영역만 축소 */}
          <section style={{ ...s.card, marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', flexWrap: 'nowrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
                <span style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${mark})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: theme.ink, whiteSpace: 'nowrap' }}>igloo</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 'none', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 12, color: C.textFaint }}>vs</span>
                <Astra size={14} />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'nowrap', flex: '0 1 auto', minWidth: 0, overflow: 'hidden' }}>
                {ASTRA_CLANS.map(n => {
                  const on = n === 'veritas';   // 지금 펼쳐 보는 상대 클랜만 강조
                  return (
                    <span key={n} style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(/assets/clans/${n}.png)`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', boxShadow: on ? '0 0 14px rgba(91,141,255,.75), 0 0 30px rgba(91,141,255,.35)' : 'none', outline: on ? '2px solid #7fa9ff' : '1px solid transparent', outlineOffset: 2, opacity: on ? 1 : .55 }} />
                  );
                })}
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8, flex: 'none' }}>
                <span style={{ fontSize: 11.5, color: C.textFaint, whiteSpace: 'nowrap' }}>238승 172패</span>
                <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', color: statColor(61.2) }}>61.2%</span>
              </span>
            </div>
          </section>

          {/* ═══ 상대전적 — (C) SET SCORE 헤더 배경을 두 클랜 테마로 분할 ═══ */}
          <section style={{ ...s.card, marginTop: 14, borderTop: `2px solid ${C.blue}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${C.cardBorder}` }}>
              <div style={s.ribbon} />
              <span style={s.cardTitle}>상대전적</span>
              <span style={{ fontSize: 11, color: C.textFaint, whiteSpace: 'nowrap' }}>igloo vs // veritas</span>
              <div style={s.spacer} />
              <span style={{ fontSize: 11, color: C.textFaint, whiteSpace: 'nowrap' }}>시즌 Cloud 0 · 21전</span>
            </div>

            <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, padding: '26px 18px 22px' }}>
              {/* 좌: 우리 클랜 테마, 우: 상대 클랜 테마 — 폭이 세트 승률 비율 */}
              <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${BLUE_SHARE}%`, background: `linear-gradient(100deg, ${theme.light}42, ${theme.main}29 40%, ${theme.deep}0f 78%, transparent)`, pointerEvents: 'none' }} />
              <span aria-hidden style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${100 - BLUE_SHARE}%`, background: `linear-gradient(260deg, ${oppTheme.light}3d, ${oppTheme.main}29 40%, ${oppTheme.deep}0f 78%, transparent)`, pointerEvents: 'none' }} />
              <span aria-hidden style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 150, height: 150, backgroundImage: `url(${mark})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: .15, pointerEvents: 'none' }} />
              <span aria-hidden style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 150, height: 150, backgroundImage: 'url(/assets/clans/veritas.png)', backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', opacity: .15, pointerEvents: 'none' }} />
              <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: `${BLUE_SHARE}%`, height: 2, background: `linear-gradient(90deg,${theme.light},${theme.main} 55%,${theme.main}40)`, pointerEvents: 'none' }} />
              <span aria-hidden style={{ position: 'absolute', right: 0, top: 0, width: `${100 - BLUE_SHARE}%`, height: 2, background: `linear-gradient(270deg,${oppTheme.main},${oppTheme.main}33)`, pointerEvents: 'none' }} />
              <span aria-hidden style={{ position: 'absolute', left: `${BLUE_SHARE}%`, top: 0, bottom: 0, width: 1, background: 'linear-gradient(180deg,rgba(255,255,255,.35),rgba(255,255,255,.04))', pointerEvents: 'none' }} />

              <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: theme.ink, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>igloo</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}><Astra size={11} /><span style={{ fontSize: 11, color: C.textFaint }}>1위</span></span>
                </span>
                <span style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${mark})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
              </span>
              <span style={{ position: 'relative', fontSize: 40, fontWeight: 600, lineHeight: 1, color: theme.ink, letterSpacing: '-.02em' }}>13</span>
              <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 88 }}>
                <span style={{ fontSize: 10.5, color: C.textFaint, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>SET SCORE</span>
                <span style={{ fontSize: 11, color: C.textGhost2, whiteSpace: 'nowrap' }}>Cloud0 시즌</span>
              </span>
              <span style={{ position: 'relative', fontSize: 40, fontWeight: 600, lineHeight: 1, color: oppTheme.ink, letterSpacing: '-.02em' }}>8</span>
              <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 52, height: 52, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: 'url(/assets/clans/veritas.png)', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: oppTheme.ink, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>// veritas</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}><Astra size={11} /><span style={{ fontSize: 11, color: C.textFaint }}>8위</span></span>
                </span>
              </span>
            </div>

            {/* (D) 세트 승률 막대 — 좌우 각각 클랜 테마 */}
            <div style={{ padding: '0 18px 14px' }}>
              <div style={{ display: 'flex', height: 8, gap: 4, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${BLUE_SHARE}%`, borderTop: `2px solid ${theme.edge}`, background: `linear-gradient(100deg, ${theme.light}6b, ${theme.main}3d 46%, ${theme.deep}1a)` }} />
                <div style={{ width: `${100 - BLUE_SHARE}%`, borderTop: `2px solid ${oppTheme.edge}`, background: `linear-gradient(260deg, ${oppTheme.light}6b, ${oppTheme.main}3d 46%, ${oppTheme.deep}1a)` }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 7 }}>
                <span style={{ fontSize: 11.5, color: '#8f9bb5', whiteSpace: 'nowrap' }}>SET WIN RATE <span style={{ fontWeight: 700, color: theme.ink }}>61.9%</span></span>
                <span style={{ fontSize: 11.5, color: '#8f9bb5', whiteSpace: 'nowrap' }}><span style={{ fontWeight: 700, color: oppTheme.ink }}>38.1%</span> · 21전 기준</span>
              </div>
            </div>

            <H2HChart />

            {/* 맞대결 기록 + 경기상세 펼침 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderTop: `1px solid ${C.rowDivider}` }}>
              <div style={s.ribbon} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>맞대결 기록</span>
              <div style={s.spacer} />
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 10.5, color: C.textGhost2, letterSpacing: '.1em' }}>시즌 CLOUD0 상대전적</span>
                <span style={{ fontSize: 11.5, color: C.textFaint }}>13승 8패</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: statColor(61.9) }}>61.9%</span>
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {H2H_MATCHES.map(([result, map, time, mvp, round], i) => {
                const win = result === '승리';
                const open = openMatch === i;
                const edge = win ? C.blue : C.red;
                const roster = (names: string[], teamWon: boolean, mvpName: string | null) =>
                  names.map((n, j) => teamWon
                    ? { n, k: 18 - j * 3, d: 6 + j * 2, a: 4 - Math.floor(j / 2), mvp: n === mvpName }
                    : { n, k: 9 - j * 2, d: 15 + j * 2, a: 3 - Math.floor(j / 2), mvp: n === mvpName });
                const teams = [
                  { name: 'igloo', emb: mark, ink: theme.ink, result: win ? '승리' : '패배', score: round, players: roster(['늄냠','밤빵걸','반짝명이','푸씨맨','반짝굴비'], win, win ? mvp : null) },
                  { name: '// veritas', emb: '/assets/clans/veritas.png', ink: oppTheme.ink, result: win ? '패배' : '승리', score: round.split(':').reverse().join(':'), players: roster(['베리타스차코','삐패','메이져강산','루니트','하늘색우산'], !win, null) },
                ];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${C.rowDivider}`, borderRadius: C.radiusCard, overflow: 'hidden', borderLeft: `2px solid ${edge}`, background: open ? 'rgba(91,141,255,.04)' : 'transparent' }}>
                    <div onClick={() => setOpenMatch(open ? null : i)} style={{ display: 'grid', gridTemplateColumns: '46px 110px minmax(0,1fr) minmax(0,196px) 70px', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{result}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>{map}</span>
                        <span style={{ fontSize: 10.5, color: C.textGhost2, whiteSpace: 'nowrap' }}>{time}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span style={{ width: 20, height: 20, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${mark})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: theme.ink, whiteSpace: 'nowrap' }}>igloo</span>
                        <span style={{ fontSize: 10.5, color: '#3a4560', flex: 'none' }}>VS</span>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: oppTheme.ink, whiteSpace: 'nowrap' }}>// veritas</span>
                        <span style={{ width: 20, height: 20, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: 'url(/assets/clans/veritas.png)', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0, overflow: 'hidden' }}>
                        {win && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 1 116px', minWidth: 0, overflow: 'hidden' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none', padding: '3px 7px', whiteSpace: 'nowrap', background: 'rgba(255,216,61,.10)', border: '1px solid rgba(255,216,61,.55)', borderRadius: C.radiusChip, boxShadow: '0 0 12px rgba(255,216,61,.22)' }}>
                              <span style={{ fontSize: 10.5, color: C.gold }}>★</span>
                              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color: C.gold }}>MVP</span>
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#ffe89a', whiteSpace: 'nowrap' }}>{mvp}</span>
                          </span>
                        )}
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none', minWidth: 64 }}>
                          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '.02em', lineHeight: 1, whiteSpace: 'nowrap', color: edge }}>{round}</span>
                          <span style={{ fontSize: 9, color: '#4e5b76', letterSpacing: '.09em', whiteSpace: 'nowrap' }}>ROUND SCORE</span>
                        </span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, whiteSpace: 'nowrap', fontSize: 10.5, color: open ? '#a9c3ff' : C.textGhost }}>
                        경기상세 <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
                      </span>
                    </div>

                    {open && (
                      <div style={{ background: '#0a0f1a', borderTop: `1px solid ${C.rowDivider}`, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {teams.map(t => (
                          <div key={t.name} style={{ border: `1px solid ${C.divider}`, borderRadius: C.radiusBlock, background: 'linear-gradient(160deg,#111b2c,#0c1420)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', borderBottom: `1px solid ${C.rowDivider}`, borderLeft: `2px solid ${t.ink}` }}>
                              <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${t.emb})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                              <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: t.ink }}>{t.name}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: t.ink }}>{t.result}</span>
                              <div style={s.spacer} />
                              <span style={{ fontSize: 11, color: '#4e5b76', whiteSpace: 'nowrap' }}>{t.score}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 108px 64px 78px', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${C.rowDivider}`, fontSize: 9.5, color: '#3f4c66', letterSpacing: '.08em' }}>
                              <span>플레이어</span><span>K / D / A</span>
                              <span style={{ textAlign: 'right' }}>세이브</span>
                              <span style={{ textAlign: 'right' }}>킬뎃</span>
                            </div>
                            {t.players.map(p => <PlayerRow key={p.n} name={p.n} k={p.k} d={p.d} a={p.a} mvp={p.mvp} />)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 최근 경기 */}
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ ...s.ribbon, flex: 'none' }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>최근 경기</span>
            <div style={{ flex: 1, height: 1, background: '#1a2438' }} />
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RECENT.map((m, i) => {
              const win = m.result === '승리';
              const edge = win ? C.blue : C.red;
              const isAstra = m.label === 'ASTRA';
              return (
                <div key={i} style={{ ...s.matchRow, borderLeft: `2px solid ${edge}` }}>
                  <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.result}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: C.textMuted, whiteSpace: 'nowrap' }}>{m.map}</span>
                    <span style={{ fontSize: 10.5, color: '#4e515d', whiteSpace: 'nowrap' }}>{m.time}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(${mark})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: theme.ink, whiteSpace: 'nowrap', flex: 'none' }}>igloo</span>
                    <Astra />
                    <span style={{ fontSize: 11, color: '#3a3d47' }}>VS</span>
                    <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', backgroundColor: C.chip, backgroundImage: `url(/assets/clans/${m.emb}.png)`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
                    <span style={{ fontSize: 13, color: '#9a9eb0', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.opp}</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap', flex: 'none' }}>
                      {isAstra ? <Astra /> : (
                        <>
                          <span style={{ fontSize: 10, ...CHAL_STYLE }}>CHALLENGER</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#c2a07a' }}>{m.label}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 10.5, color: '#4e515d', whiteSpace: 'nowrap' }}>래더</span>
                    <span style={{ fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', color: m.delta > 0 ? '#22c55e' : C.red }}>
                      {m.delta > 0 ? '+' : ''}{m.delta}점
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
