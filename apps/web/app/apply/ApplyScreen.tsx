'use client'

/**
 * ★리그 참가 신청★ (2026-09-14 사장님).
 *
 *   «마지막에 어느 리그에 참가하시겠습니까 / 하고 참가대기 클랜들 하고 보여줘
 *     (Ipl Spl 활동량 가장 많은 클랜 마크 4개씩 하고 등등 으로 써줘) /
 *     그리고 참가신청은 IPL SPL 둘중에 하나 가능하고 / (…) 신청양식은 클랜명 /
 *     클랜병영 / 주요멤버 포지별 5명 병영 / 숏 이층 비리베 바리베 스나 /
 *     이렇게 만들어줘 ★로그인 회원가입 없이★ 신청 할 수 있게»
 *   «열산도 신청 양식에 넣어 ★예시도 보여주고★»
 *
 * ── 화면이 하는 일
 *   ① 어느 리그에 참가하시겠습니까 — 셋 중 하나. 리그마다 ★무엇을 주는지★ 를 같이 적는다
 *   ② 참가대기 클랜 — 그 리그에서 요즘 가장 많이 뛰는 클랜 마크 넷 + «외 N곳»
 *   ③ 신청서 — 클랜명 · 클랜 병영수첩 · 다섯 자리 멤버
 *
 * ── ★예시는 흐린 글자(placeholder)로만 둔다★
 *   진짜 값처럼 미리 채워 두면 그대로 내는 사람이 반드시 있다. 예시는 예시로 보여야 한다.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  APPLICATION_LEAGUES,
  APPLICATION_POSITIONS,
  LeagueApplicationInput,
  WAITING_WINDOW_DAYS,
  type ApplicationLeague,
  type ApplicationWaitingLeague,
} from '@sacloud/contract'
import { MarkCircle, V3, LEAGUE_NAME } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * ★리그마다 무엇을 주는가★ — 2026-09-14 회의에서 정한 규칙 그대로다.
 * 이 글은 `leagueScreen` 의 규칙을 사람 말로 옮긴 것이다. 두 곳이 어긋나면 안 된다.
 */
const LEAGUE_CARD: Record<
  ApplicationLeague,
  { name: string; head: string; gives: string[]; tone: string }
> = {
  nolink: {
    name: LEAGUE_NAME.nolink ?? 'IPL',
    head: '개인·클랜 승률만 기록',
    gives: ['경기 분석 · 플레이 분석', '개인/클랜 승률', '개인 킬데스는 공개하지 않습니다', '래더(점수) 미제공'],
    tone: '#9cc0ff',
  },
  supply: {
    name: LEAGUE_NAME.supply ?? 'LLM',
    head: '모든 기록 100% 제공',
    gives: ['경기 분석 · 플레이 분석', '승률 · 킬데스 전부 기록', '랭킹 제도(래더) 적용'],
    tone: '#ffd98a',
  },
  sanply: {
    name: LEAGUE_NAME.sanply ?? 'YSL',
    head: '고용 가능 클랜으로 진행',
    gives: ['개인 킬데스 · 개인 승률', '개인 플레이 스타일 분석', '경기 분석', '클랜 기록은 제공하지 않습니다'],
    tone: '#a6e3c4',
  },
}

/** 자리마다 어떤 예시를 흐린 글자로 보여 줄까 (사장님: «예시도 보여주고») */
const PLACEHOLDER_NAME: Readonly<Record<string, string>> = {
  숏: '예) 짧은거리 담당 닉네임',
  이층: '예) 2층 담당 닉네임',
  비리베: '예) 비리베 담당 닉네임',
  바리베: '예) 바리베 담당 닉네임',
  스나: '예) 스나 담당 닉네임',
}
const URL_EXAMPLE = '예) https://barracks.sa.nexon.com/clan/123456'
const MEMBER_URL_EXAMPLE = '예) https://barracks.sa.nexon.com/userinfo/...'

type Member = { position: string; name: string; url: string }

export function ApplyScreen() {
  const ready = useApiReady()
  const [league, setLeague] = useState<ApplicationLeague | null>(null)
  const [clanName, setClanName] = useState('')
  const [clanUrl, setClanUrl] = useState('')
  const [members, setMembers] = useState<Member[]>(
    APPLICATION_POSITIONS.map((p) => ({ position: p, name: '', url: '' })),
  )
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<null | { updated: boolean }>(null)

  const waiting = useQuery({
    queryKey: ['league-applications', 'waiting'],
    queryFn: () => apiGet('leagueApplicationWaiting', {}),
    enabled: ready,
  })
  const waitingOf = useMemo(() => {
    const map = new Map<string, ApplicationWaitingLeague>()
    for (const l of waiting.data?.data.leagues ?? []) map.set(l.league, l)
    return map
  }, [waiting.data])

  const setMember = (i: number, patch: Partial<Member>) => {
    setMembers((prev) => prev.map((m, k) => (k === i ? { ...m, ...patch } : m)))
  }

  async function submit() {
    setError(null)
    if (league === null) {
      setError('참가할 리그를 골라 주세요')
      return
    }
    const parsed = LeagueApplicationInput.safeParse({
      league,
      clan_name: clanName,
      clan_url: clanUrl,
      members,
      ...(note.trim() === '' ? {} : { note }),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '신청서를 다시 확인해 주세요')
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/league-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const payload = (await res.json()) as { message: string; data?: { updated: boolean } }
      if (!res.ok) {
        setError(payload.message)
        return
      }
      setDone({ updated: payload.data?.updated ?? false })
    } catch {
      setError('보내지 못했습니다. 잠시 뒤 다시 눌러 주세요')
    } finally {
      setSending(false)
    }
  }

  if (done !== null) {
    return (
      <div className="pc-container" style={{ padding: '60px 2px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>
          {done.updated ? '신청서를 고쳤습니다' : '신청이 접수되었습니다'}
        </p>
        <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.9, color: V3.textFaint }}>
          운영진이 확인한 뒤 클랜 병영수첩으로 연락드립니다.
          <br />
          잘못 적으셨다면 <b style={{ color: '#9cc0ff' }}>같은 클랜명으로 다시 신청</b>하시면
          <br />
          새로 쌓이지 않고 이 신청서가 고쳐집니다.
        </p>
      </div>
    )
  }

  return (
    <div className="pc-container pb-[var(--section-gap)]">
      <header style={{ padding: '26px 2px 18px' }}>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: '#fff', letterSpacing: '-.01em' }}>
          어느 리그에 참가하시겠습니까?
        </h1>
        <p style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.8, color: V3.textFaint }}>
          리그마다 제공하는 기록이 다릅니다. 하나만 고를 수 있습니다.
          <br />
          <b style={{ color: '#9cc0ff' }}>로그인 없이</b> 신청할 수 있습니다.
        </p>
      </header>

      {/* ① 리그 고르기 + ② 참가대기 클랜 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {APPLICATION_LEAGUES.map((slug) => {
          const card = LEAGUE_CARD[slug]
          const picked = league === slug
          const w = waitingOf.get(slug)
          return (
            <button
              key={slug}
              type="button"
              onClick={() => setLeague(slug)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                padding: '16px 16px 14px',
                borderRadius: 12,
                background: picked ? 'rgba(156,192,255,.08)' : 'rgba(16,26,44,.62)',
                border: `1px solid ${picked ? card.tone : V3.divider}`,
                boxShadow: picked ? `0 0 0 1px ${card.tone} inset` : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: card.tone }}>{card.name}</span>
                <span style={{ fontSize: 11.5, color: V3.textFaint }}>{card.head}</span>
              </div>
              <ul style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {card.gives.map((line) => (
                  <li key={line} style={{ fontSize: 11.5, lineHeight: 1.5, color: V3.textMuted }}>
                    · {line}
                  </li>
                ))}
              </ul>

              {/* 참가대기 클랜 — 최근 7일에 가장 많이 뛴 넷 */}
              {w === undefined || w.clans.length === 0 ? null : (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${V3.divider}` }}>
                  <p style={{ fontSize: 10.5, color: V3.textGhost2, marginBottom: 7 }}>
                    최근 {WAITING_WINDOW_DAYS}일 가장 많이 뛴 클랜
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {w.clans.map((c) => (
                      <MarkCircle
                        key={c.slug}
                        clan={{ slug: c.slug, mark: c.mark }}
                        size={26}
                        title={`${c.name} · ${c.recent_matches}판`}
                      />
                    ))}
                    {w.total > w.clans.length ? (
                      <span style={{ fontSize: 11, color: V3.textFaint }}>
                        외 {w.total - w.clans.length}곳
                      </span>
                    ) : null}
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* ③ 신청서 */}
      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#fff', padding: '0 2px 12px' }}>
          신청서
        </h2>

        <Field label="클랜명">
          <input
            value={clanName}
            onChange={(e) => setClanName(e.target.value)}
            placeholder="예) sometimes"
            style={inputStyle}
          />
        </Field>
        <Field label="클랜 병영수첩 주소">
          <input
            value={clanUrl}
            onChange={(e) => setClanUrl(e.target.value)}
            placeholder={URL_EXAMPLE}
            style={inputStyle}
          />
        </Field>

        <p style={{ margin: '18px 2px 10px', fontSize: 12.5, fontWeight: 700, color: '#fff' }}>
          주요 멤버 5명
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: V3.textGhost2 }}>
            자리마다 한 명씩 · 병영수첩 주소로 적어 주세요
          </span>
        </p>
        {members.map((m, i) => (
          <div
            key={m.position}
            style={{
              display: 'grid',
              gridTemplateColumns: '58px minmax(0,1fr)',
              gap: 8,
              alignItems: 'start',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                marginTop: 9,
                fontSize: 12,
                fontWeight: 700,
                color: '#ffd98a',
                whiteSpace: 'nowrap',
              }}
            >
              {m.position}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <input
                value={m.name}
                onChange={(e) => setMember(i, { name: e.target.value })}
                placeholder={PLACEHOLDER_NAME[m.position] ?? '닉네임'}
                style={inputStyle}
              />
              <input
                value={m.url}
                onChange={(e) => setMember(i, { url: e.target.value })}
                placeholder={MEMBER_URL_EXAMPLE}
                style={inputStyle}
              />
            </div>
          </div>
        ))}

        <Field label="남기실 말 (선택)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="예) 주 3회 이상 활동합니다"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        {error === null ? null : (
          <p style={{ marginTop: 12, fontSize: 12.5, color: '#ff8a90' }}>{error}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={sending}
          style={{
            marginTop: 18,
            width: '100%',
            padding: '14px 0',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 800,
            cursor: sending ? 'default' : 'pointer',
            color: '#0b1220',
            background: sending ? '#5b708f' : '#9cc0ff',
            border: 'none',
          }}
        >
          {sending ? '보내는 중…' : '참가 신청하기'}
        </button>
      </section>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  fontSize: 13,
  color: '#e7eefc',
  background: 'rgba(10,17,30,.7)',
  border: '1px solid #24314a',
  outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', marginBottom: 6, fontSize: 12, color: V3.textFaint }}>
        {label}
      </span>
      {children}
    </label>
  )
}
