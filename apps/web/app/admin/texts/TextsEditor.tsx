'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * ★★화면 글 편집기★★ (2026-09-21 사장님)
 *
 * ── 한 자리씩 따로 저장한다
 *   한 번에 다 저장하면 ★어디를 고쳤는지 모른 채★ 전부 덮어쓴다.
 *   자리마다 저장 단추를 둔다 — 고친 것만 나간다.
 *
 * ── ★저장했는지 분명히 말한다★
 *   「저장됨」 이라고만 하고 사라지면 진짜 됐는지 알 수 없다.
 *   저장한 뒤 ★서버에서 다시 읽어★ 그 값을 칸에 다시 채운다.
 */

interface Slot {
  key: string
  where: string
  hint: string
}

interface Row {
  key: string
  title: string | null
  body: string
  hidden: boolean
  updatedAt: string
}

type Save = 'idle' | 'saving' | 'saved' | 'failed'

export function TextsEditor({ slots }: { slots: Slot[] }) {
  const [rows, setRows] = useState<Record<string, Row | null>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/texts', { cache: 'no-store' })
      const json = (await res.json()) as { data?: Row[] }
      const next: Record<string, Row | null> = {}
      for (const s of slots) next[s.key] = null
      for (const r of json.data ?? []) next[r.key] = r
      setRows(next)
    } finally {
      setLoading(false)
    }
  }, [slots])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <p className="text-[13px] text-meta">불러오는 중…</p>

  return (
    <div className="flex flex-col gap-8">
      {slots.map((slot) => (
        <SlotEditor key={slot.key} slot={slot} row={rows[slot.key] ?? null} onSaved={load} />
      ))}
    </div>
  )
}

function SlotEditor({
  slot,
  row,
  onSaved,
}: {
  slot: Slot
  row: Row | null
  onSaved: () => void
}) {
  const [title, setTitle] = useState(row?.title ?? '')
  const [body, setBody] = useState(row?.body ?? '')
  const [state, setState] = useState<Save>('idle')

  /* 서버에서 다시 읽어 온 값으로 칸을 맞춘다 */
  useEffect(() => {
    setTitle(row?.title ?? '')
    setBody(row?.body ?? '')
  }, [row])

  const save = async () => {
    setState('saving')
    try {
      const res = await fetch('/api/admin/texts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: slot.key, title, body, hidden: false }),
      })
      if (!res.ok) throw new Error('실패')
      setState('saved')
      onSaved()
      window.setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('failed')
    }
  }

  const lines = body.split('\n').filter((l) => l.trim() !== '')

  return (
    <section className="border-t border-line-soft pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold text-text-strong">{slot.where}</h2>
        <span className="font-num text-[11px] text-faint">{slot.key}</span>
      </div>
      <p className="mt-1 text-[12px] text-meta">{slot.hint}</p>
      {row === null ? (
        <p className="mt-1 text-[12px] text-faint">
          지금은 <b>코드에 박힌 기본 글</b>이 나오고 있습니다. 저장하면 이 글이 대신 나옵니다.
        </p>
      ) : (
        <p className="mt-1 text-[12px] text-faint">
          마지막 저장 {new Date(row.updatedAt).toLocaleString('ko-KR')}
        </p>
      )}

      <label className="mt-3 block text-[12px] text-meta" htmlFor={`${slot.key}-title`}>
        제목 (비우면 제목 없이 나옵니다)
      </label>
      <input
        id={`${slot.key}-title`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="예) 리그 참가 신청"
        className="mt-1 h-10 w-full rounded-[2px] border border-line bg-card px-3 text-[14px] text-text focus:border-accent focus:outline-none"
      />

      <label className="mt-3 block text-[12px] text-meta" htmlFor={`${slot.key}-body`}>
        본문 — 줄바꿈 한 번이 한 항목 ({lines.length}개)
      </label>
      <textarea
        id={`${slot.key}-body`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder={'한 줄에 한 항목씩 적어 주세요.\n비우고 저장하면 원래 글로 돌아갑니다.'}
        className="mt-1 w-full rounded-[2px] border border-line bg-card px-3 py-2 text-[14px] leading-[1.7] text-text focus:border-accent focus:outline-none"
      />

      {/* 미리보기 — 화면에 어떻게 나오는지 그대로 보여 준다 */}
      {lines.length > 0 ? (
        <div className="mt-3 rounded-[2px] border border-line-soft p-3">
          <div className="text-[11px] text-faint">미리보기</div>
          {title.trim() !== '' ? (
            <div className="mt-1.5 text-[14px] font-bold text-accent">{title}</div>
          ) : null}
          <ul className="mt-1.5 flex flex-col gap-1">
            {lines.map((l, i) => (
              <li key={i} className="text-[13px] leading-[1.7] text-meta">
                · {l}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={state === 'saving'}
          className="h-9 rounded-[2px] border border-line px-4 text-[13px] text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {state === 'saving' ? '저장중…' : '저장'}
        </button>
        {state === 'saved' ? <span className="text-[12px] text-accent">저장했습니다</span> : null}
        {state === 'failed' ? (
          <span className="text-[12px] text-accent">저장에 실패했습니다</span>
        ) : null}
      </div>
    </section>
  )
}
