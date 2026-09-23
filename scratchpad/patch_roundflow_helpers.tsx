/* 진영 색 — 인원 줄 · 클랜 이름 · 죽은 차례가 전부 같은 두 색을 쓴다 (인원 줄 옛 칩과 같은 값) */
const RED_INK = '#ff6b6b'
const BLUE_INK = '#8fb4ff'
const RED_GLOW = 'drop-shadow(0 0 2.5px rgba(255,80,80,.95)) drop-shadow(0 0 6px rgba(255,60,60,.55))'
const BLUE_GLOW = 'drop-shadow(0 0 2.5px rgba(90,150,255,.95)) drop-shadow(0 0 6px rgba(60,120,255,.55))'
const PERSON_PATH = 'M8 2.6a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Zm0 6.2c3 0 5.2 1.7 5.2 3.6V14H2.8v-1.6c0-1.9 2.2-3.6 5.2-3.6Z'

/**
 * ★인원 — 사람 아이콘★ (2026-09-23 오후 사장님 사진: 빨강·파랑 번지는 사람 모양).
 * 살아 있으면 진영 색 + 번짐, 죽으면 흐린 윤곽만. `fromRight` 면 오른쪽 끝(가운데 쪽)부터 꺼진다 —
 * 레드(왼쪽)도 블루(오른쪽)도 가운데 쪽부터 꺼져 양쪽이 대칭이다.
 */
function CrewIcons({ alive, size, ink, glow, fromRight }: { alive: number; size: number; ink: string; glow: string; fromRight: boolean }) {
  return (
    <span style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: fromRight ? 'flex-start' : 'flex-end' }}>
      {Array.from({ length: size }, (_, i) => {
        const on = (fromRight ? i : size - 1 - i) < alive
        return (
          <svg key={i} viewBox="0 0 16 16" style={{ width: 16, height: 16, display: 'block', filter: on ? glow : undefined }} aria-hidden>
            <path d={PERSON_PATH} fill={on ? ink : 'none'} stroke={on ? 'none' : '#33405f'} strokeWidth={on ? 0 : 1.6} />
          </svg>
        )
      })}
    </span>
  )
}

/** 「레드」 / 「블루」 작은 표 — 클랜 이름 옆 */
function SideTag({ red }: { red: boolean }) {
  return (
    <span style={{ flex: 'none', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', padding: '1px 5px', border: `1px solid ${red ? 'rgba(255,107,107,.55)' : 'rgba(143,180,255,.55)'}`, color: red ? RED_INK : BLUE_INK }}>{red ? '레드' : '블루'}</span>
  )
}

