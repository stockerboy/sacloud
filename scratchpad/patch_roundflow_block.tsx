      {/*
        ★★2026-09-23 오후 — 진영판★★ (사장님 손그림 3장 · 시안 아티팩트 「그대로 넣어」)

          ┌ 사람 아이콘 5 (레드)  │ 후반전 · 12R  │  사람 아이콘 5 (블루) ┐   ← 죽으면 흐린 윤곽만
          │ [레드] evermore        1 : 2         hardcores [블루]      │   ← 그 반의 점수 (후반 0:0 부터)
          ├───────────────────────────┬───────────────────────────────┤
          │ evermore가 잡음            │              hardcores가 잡음  │
          │ 선짤 wytysmore ▸ 임소혜    │      Peyz; ▸ 리라몬모어 다운   │   ← 왼쪽 = 레드가 잡은 것
          └───────────────────────────┴───────────────────────────────┘

        ── 진영은 `hud.attack`(그 라운드의 공격 팀)이 정한다 — 레드 = 공격. 이름 색은 ★승패가 아니라 진영★ 이라
           같은 선수가 전반엔 파랑, 후반엔 빨강이 된다 (사장님 그림 2).
        ── 공수를 모르는 라운드(`attack === null`)는 이 판을 못 그린다 → 아래 옛 세로 목록으로 떨어진다.
           모르는 것을 블루라고 적지 않는다 (D-106).
      */}
      {hud && sidesKnown ? (() => {
        const leftKey: 'W' | 'L' = hud.attack as 'W' | 'L'
        const rightKey: 'W' | 'L' = leftKey === 'W' ? 'L' : 'W'
        const teamOf = (k: 'W' | 'L') => (k === 'W' ? winner : loser)
        const aliveOf = (k: 'W' | 'L') => (k === 'W' ? hud.aliveW : hud.aliveL)
        const sizeOf = (k: 'W' | 'L') => (k === 'W' ? sizeW : sizeL)
        const halfScoreOf = (k: 'W' | 'L') => (k === 'W' ? hud.halfScoreW : hud.halfScoreL)
        const inkOf = (k: 'W' | 'L') => (k === leftKey ? RED_INK : BLUE_INK)
        /* 왼쪽 칸 = 레드가 잡은 것(죽은 쪽이 블루) · 오른쪽 칸 = 블루가 잡은 것 */
        const killedBy = (k: 'W' | 'L') => hud.fallen.filter((f) => f.side !== k)
        const firstAt = hud.fallen[0]?.at
        const killRow = (f: Pt['fallen'][number], i: number, align: 'left' | 'right') => (
          <span key={`${f.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', minWidth: 0, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
            {f.at === firstAt ? <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 11.5, flex: 'none' }}>선짤</span> : null}
            {f.by ? (<><span style={{ color: inkOf(f.side === 'W' ? 'L' : 'W'), fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{f.by}</span><span style={{ color: tone.textGhost, fontSize: 11, flex: 'none' }}>▸</span></>) : null}
            <span style={{ color: inkOf(f.side), fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{f.name ?? '—'}</span>
            {f.at === firstAt ? null : <span style={{ color: tone.textDim, fontSize: 11, flex: 'none' }}>다운</span>}
          </span>
        )
        const col = (k: 'W' | 'L', align: 'left' | 'right') => {
          const list = killedBy(k)
          return (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '.08em', color: tone.textGhost, marginBottom: 3, textAlign: align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamOf(k).name}가 잡음</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5 }}>
                {list.length === 0 ? <span style={{ color: tone.textGhost, fontSize: 12, textAlign: align }}>{hud.round > 0 ? '아직 없음' : ''}</span> : list.map((f, i) => killRow(f, i, align))}
              </div>
            </div>
          )
        }
        const secondFrom = flow.second_half_from
        const halfWord = secondFrom !== null && hud.round >= secondFrom ? '후반전' : '전반전'
        const leftPct = leftKey === 'W' ? hud.v : 100 - hud.v
        return (
          <>
            {/* ① 인원 — 사람 아이콘. 레드 왼쪽(가운데 쪽부터 꺼짐) · 블루 오른쪽(가운데 쪽부터 꺼짐) · 가운데 전반전/후반전 · 라운드 · 확률 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '9px 2px 5px', borderTop: `1px solid ${tone.cardBorder}`, marginTop: 4 }}>
              <CrewIcons alive={aliveOf(leftKey)} size={sizeOf(leftKey)} ink={RED_INK} glow={RED_GLOW} fromRight={true} />
              <div style={{ textAlign: 'center', padding: '0 9px', borderLeft: `1px solid ${tone.cardBorder}`, borderRight: `1px solid ${tone.cardBorder}`, whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: tone.textDim }}>{halfWord}{hud.round > 0 ? ` · ${hud.round}R` : ''}</div>
                <div style={{ fontSize: 10.5, color: tone.textGhost, fontVariantNumeric: 'tabular-nums' }}>{leftPct.toFixed(0)}% : {(100 - leftPct).toFixed(0)}%{hud.est ? ' · 어림' : ''}</div>
              </div>
              <CrewIcons alive={aliveOf(rightKey)} size={sizeOf(rightKey)} ink={BLUE_INK} glow={BLUE_GLOW} fromRight={false} />
            </div>
            {/* ② 레드 클랜 · 그 반의 점수 · 클랜 블루 — 후반이면 자리가 바뀐다 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'baseline', gap: 8, padding: '4px 2px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                <SideTag red />
                <span style={{ fontWeight: 800, fontSize: 13.5, color: RED_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{teamOf(leftKey).name}</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', padding: '0 8px', color: tone.textStrong }}>
                <span style={{ color: RED_INK }}>{halfScoreOf(leftKey)}</span><span style={{ color: tone.textGhost, margin: '0 4px', fontWeight: 500 }}>:</span><span style={{ color: BLUE_INK }}>{halfScoreOf(rightKey)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0, justifyContent: 'flex-end' }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: BLUE_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{teamOf(rightKey).name}</span>
                <SideTag red={false} />
              </div>
            </div>
            {/* ③ 죽은 차례 — 두 칸. 판 높이는 고정해 그래프가 위아래로 안 움직인다 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 10px', borderTop: `1px solid ${tone.cardBorder}`, paddingTop: 8, minHeight: phone ? 96 : 72 }}>
              {col(leftKey, 'left')}
              <div style={{ background: tone.cardBorder }} />
              {col(rightKey, 'right')}
            </div>
          </>
        )
      })() : null}
