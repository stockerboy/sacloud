'use client'

/**
 * ★리그 참가 신청★ — 2026-09-14 저녁 사장님이 새로 적어 주신 양식 그대로다.
 *
 *   ```
 *   신청서 양식
 *   클랜명(명단있는 클랜은 자동완성) 검색하기
 *
 *   안나오는 클랜은 여기에 따로 적기
 *   클랜명 / 클랜병영수첩
 *
 *   관리자와 연락 가능한 카톡ID or Discord ID
 *     (클랜디스코드 마스터인증 돼 있어야합니다)
 *
 *   IPL > LLM 전환등록 (혜택: 전환비 무료, 자격심사없음)
 *   LLM 신규등록 (등록책임비용: 10/1까지 전원무료)
 *   YSL 신규등록 (등록책임비용: 10/1까지 전원무료)
 *   IPL 신규등록 (등록책임비용: 10/1까지 전원무료)
 *   ```
 *
 * ── 옛 양식과 무엇이 다른가
 *   · 「리그 고르기」 → ★「등록 종류 고르기」★. «IPL → LLM 전환» 은 리그가 둘이라
 *     리그 하나로는 표현이 안 된다
 *   · 클랜을 ★우리 명단에서 골라 넣는다★ — 오타와 중복 신청이 사라진다.
 *     명단에 없으면 그때만 직접 적는다
 *   · ★연락처★ 를 받는다. 로그인이 없어서 우리가 먼저 연락할 길이 이것뿐이다
 *   · 주요 멤버 다섯은 ★선택★ 으로 내렸다 (새 양식에 안 적혀 있다). 접어 두었다
 *
 * ★로그인 없이★ 낼 수 있다 — 그건 그대로다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  APPLICATION_KINDS,
  CONTACT_KINDS,
  CONTACT_KIND_LABEL,
  LeagueApplicationInput,
  WAITING_WINDOW_DAYS,
  type ApplicationKindKey,
  type ApplicationWaitingLeague,
} from '@sacloud/contract'
import { LEAGUE_NAME, MarkCircle, V3 } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** 등록 종류마다 색 — 가는 리그의 색을 따른다 */
const TONE: Readonly<Record<string, string>> = {
  nolink: '#9cc0ff',
  supply: '#ffd98a',
  sanply: '#a6e3c4',
}

type PickedClan = { slug: string; name: string; mark: { bg: string | null; front: string | null } }

/**
 * `initialKind` — 첫 화면의 ★리그별 신청 버튼★ 이 실어 보낸 종류 (2026-09-16 사장님).
 * 없거나 모르는 값이면 `null` 로 떨어져 여태처럼 «고르세요» 로 연다.
 * ★지어내지 않는다★ — `APPLICATION_KINDS` 에 있는 key 만 받아들인다.
 */
export function ApplyScreen({ initialKind = null }: { initialKind?: string | null }) {
  const ready = useApiReady()

  const [kind, setKind] = useState<ApplicationKindKey | null>(
    () => APPLICATION_KINDS.find((k) => k.key === initialKind)?.key ?? null,
  )
  const [clan, setClan] = useState<PickedClan | null>(null)
  /** 명단에 없어 직접 적는 중인가 */
  const [manual, setManual] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [contactKind, setContactKind] = useState<(typeof CONTACT_KINDS)[number]>('discord')
  const [contactId, setContactId] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<null | { updated: boolean }>(null)

  const picked = useMemo(() => APPLICATION_KINDS.find((k) => k.key === kind) ?? null, [kind])

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

  async function submit() {
    setError(null)
    if (kind === null) {
      setError('등록 종류를 골라 주세요')
      return
    }
    const parsed = LeagueApplicationInput.safeParse({
      kind,
      clan_slug: manual ? null : (clan?.slug ?? null),
      clan_name: manual ? manualName : (clan?.name ?? ''),
      /* 명단에서 고른 클랜은 주소를 안 받는다 — 우리가 이미 아는 값이다 */
      clan_url: manual ? manualUrl : null,
      contact_kind: contactKind,
      contact_id: contactId,
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
          적어 주신 <b style={{ color: '#9cc0ff' }}>{CONTACT_KIND_LABEL[contactKind]}</b> 로
          운영진이 연락드립니다.
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
          리그 참가 신청
        </h1>
        <p style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.8, color: V3.textFaint }}>
          <b style={{ color: '#9cc0ff' }}>로그인 없이</b> 신청하실 수 있습니다.
        </p>
      </header>

      {/* ① 등록 종류 */}
      <Step no="1" title="등록 종류를 골라 주세요">
        <div className="about-split" style={{ marginTop: 2 }}>
          {APPLICATION_KINDS.map((k) => {
            const on = k.key === kind
            const tone = TONE[k.to] ?? '#9cc0ff'
            const w = waitingOf.get(k.to)
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: '14px 15px 13px',
                  borderRadius: 12,
                  background: on ? 'rgba(156,192,255,.09)' : 'rgba(16,26,44,.62)',
                  border: `1px solid ${on ? tone : V3.divider}`,
                  minWidth: 0,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: tone }}>{k.label}</span>
                  {k.from === null ? null : (
                    <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>
                      {LEAGUE_NAME[k.from] ?? k.from} 에서 옮겨 옵니다
                    </span>
                  )}
                </span>
                <p style={{ marginTop: 7, fontSize: 11.5, lineHeight: 1.6, color: '#9fd3b4' }}>
                  {k.benefit}
                </p>
                {w === undefined || w.clans.length === 0 ? null : (
                  <div style={{ marginTop: 11, paddingTop: 9, borderTop: `1px solid ${V3.divider}` }}>
                    <p style={{ fontSize: 10, color: V3.textGhost2, marginBottom: 6 }}>
                      최근 {WAITING_WINDOW_DAYS}일 가장 많이 뛴 클랜
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {w.clans.map((c) => (
                        <MarkCircle
                          key={c.slug}
                          clan={{ slug: c.slug, mark: c.mark }}
                          size={24}
                          title={`${c.name} · ${c.recent_matches}판`}
                        />
                      ))}
                      {w.total > w.clans.length ? (
                        <span style={{ fontSize: 10.5, color: V3.textFaint }}>
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
      </Step>

      {/* ② 클랜 */}
      <Step no="2" title="클랜을 찾아 주세요">
        {manual ? (
          <>
            <p style={{ fontSize: 11.5, lineHeight: 1.7, color: V3.textGhost2, marginBottom: 10 }}>
              명단에 없는 클랜입니다. 클랜명과 병영수첩 주소를 직접 적어 주세요.
            </p>
            <Field label="클랜명">
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="예) sometimes"
                style={inputStyle}
              />
            </Field>
            <Field label="클랜 병영수첩 주소">
              <input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="예) https://barracks.sa.nexon.com/clan/123456"
                style={inputStyle}
              />
            </Field>
            <button type="button" onClick={() => setManual(false)} style={linkButtonStyle}>
              ← 명단에서 다시 찾기
            </button>
          </>
        ) : (
          <>
            <ClanSearch picked={clan} onPick={setClan} ready={ready} />
            <button type="button" onClick={() => setManual(true)} style={linkButtonStyle}>
              찾는 클랜이 안 나오나요? 직접 적기
            </button>
          </>
        )}
      </Step>

      {/* ③ 연락처 */}
      <Step no="3" title="관리자와 연락할 수 있는 ID">
        <p style={{ fontSize: 11.5, lineHeight: 1.7, color: V3.textGhost2, marginBottom: 10 }}>
          클랜 디스코드에 <b style={{ color: '#ffb9bd' }}>마스터 인증</b>이 되어 있어야 합니다.
        </p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
          {CONTACT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setContactKind(k)}
              style={{
                cursor: 'pointer',
                padding: '7px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                color: contactKind === k ? '#0b1220' : V3.textFaint,
                background: contactKind === k ? '#9cc0ff' : 'transparent',
                border: `1px solid ${contactKind === k ? '#9cc0ff' : V3.divider}`,
              }}
            >
              {CONTACT_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <input
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          placeholder={contactKind === 'kakao' ? '예) sacloud_master' : '예) sacloud#0001'}
          style={inputStyle}
        />
      </Step>

      {/* ⚠ ★주요 멤버 5명 칸은 뺐다★ (2026-09-14 저녁 사장님: «주요멤버5명은 빼»).
          관리자 화면은 옛 신청서의 멤버를 그대로 읽어 그린다 — 그쪽은 안 건드렸다 */}

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
        {sending ? '보내는 중…' : picked === null ? '참가 신청하기' : `${picked.label} 신청하기`}
      </button>
    </div>
  )
}

/* ── 클랜 자동완성 ─────────────────────────────────────────── */

/**
 * ★명단에 있는 클랜은 골라 넣는다★ (2026-09-14 저녁 사장님: «클랜명(명단있는 클랜은
 * 자동완성) 검색하기»).
 *
 * 고르면 오타도, 같은 클랜이 이름을 달리 적어 두 번 들어오는 일도 사라진다.
 * 검색은 이미 있는 통로(`clansSearch`)를 그대로 쓴다 — 새로 만들지 않는다.
 */
function ClanSearch({
  picked,
  onPick,
  ready,
}: {
  picked: PickedClan | null
  onPick: (c: PickedClan | null) => void
  ready: boolean
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  /* 두 글자부터 찾는다 — 한 글자로는 온 리그가 걸린다 */
  const term = q.trim()
  const hits = useQuery({
    queryKey: ['clans', 'search', term],
    queryFn: () => apiGet('clansSearch', { params: { q: term } }),
    enabled: ready && term.length >= 2 && picked === null,
  })

  /* 바깥을 누르면 목록을 닫는다 */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (picked !== null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 13px',
          borderRadius: 10,
          background: 'rgba(156,192,255,.08)',
          border: '1px solid #9cc0ff',
        }}
      >
        <MarkCircle clan={{ slug: picked.slug, mark: picked.mark }} size={26} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', minWidth: 0 }}>
          {picked.name}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => {
            onPick(null)
            setQ('')
          }}
          style={{ ...linkButtonStyle, margin: 0 }}
        >
          바꾸기
        </button>
      </div>
    )
  }

  const rows = hits.data?.data ?? []

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="클랜 이름으로 찾기 (두 글자부터)"
        style={inputStyle}
      />
      {!open || term.length < 2 ? null : (
        <div
          style={{
            position: 'absolute',
            zIndex: 10,
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 260,
            overflowY: 'auto',
            borderRadius: 10,
            background: '#0d1526',
            border: `1px solid ${V3.divider}`,
            boxShadow: '0 10px 30px rgba(0,0,0,.5)',
          }}
        >
          {hits.isLoading ? (
            <p style={{ padding: '12px 14px', fontSize: 12, color: V3.textGhost }}>찾는 중…</p>
          ) : rows.length === 0 ? (
            <p style={{ padding: '12px 14px', fontSize: 12, color: V3.textGhost, lineHeight: 1.7 }}>
              명단에 없습니다.
              <br />
              아래 <b style={{ color: '#9cc0ff' }}>직접 적기</b> 로 넣어 주세요.
            </p>
          ) : (
            rows.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => {
                  onPick({ slug: c.slug, name: c.name, mark: c.mark })
                  setOpen(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '9px 13px',
                  cursor: 'pointer',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${V3.divider}`,
                  textAlign: 'left',
                }}
              >
                <MarkCircle clan={{ slug: c.slug, mark: c.mark }} size={22} />
                <span style={{ fontSize: 13, color: V3.textStrong, minWidth: 0 }}>{c.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ── 조각들 ───────────────────────────────────────────────── */

function Step({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 10px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', color: '#4e6ea8' }}>
          {no}
        </span>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{title}</h2>
      </div>
      {children}
    </section>
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

const linkButtonStyle: React.CSSProperties = {
  marginTop: 8,
  padding: 0,
  fontSize: 11.5,
  color: '#9cc0ff',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
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
