'use client'

import { useState } from 'react'
import { AdminCard, AdminDenied, Stat } from '../AdminShell'
import { adminFetch, AdminError } from '../lib'

/**
 * 과거 시즌 기록 이관 화면 (Phase 11-F).
 *
 * 화려한 파일 관리 시스템이 아니다. 흐름은 다섯 단계뿐이다.
 *   파일 고르기 → 파싱 → 미리보기 → 문제 확인 → 확정
 *
 * **`확정`을 누르기 전에는 DB에 아무것도 쓰지 않는다.**
 * 파싱은 CLI와 같은 코어(`@sacloud/db/ops`)를 쓰므로 여기서 본 결과가 곧 저장 결과다.
 */

interface ImportResult {
  seasons: number[]
  counts: { create: number; duplicate: number; conflict: number; frozen: number }
  executed: boolean
  created: number
  warnings: string[]
  issues: {
    legacy_player_id: string
    nickname: string | null
    season: number
    verdict: string
    note: string | null
  }[]
  sample: {
    season: number
    legacyPlayerId: string
    nickname: string | null
    rank: number | null
    win: number | null
    lose: number | null
    rating: number | null
  }[]
}

const VERDICT_LABEL: Record<string, string> = {
  duplicate: '이미 같은 값이 있음',
  conflict: '값이 다름 — 운영자 확인 필요',
  frozen: '확정된 시즌이라 거부',
  identity_ambiguous: '동일인 확인 불가',
}

export default function LegacyImportPage() {
  const [leagueSlug, setLeagueSlug] = useState('supply')
  const [currentSeason, setCurrentSeason] = useState('')
  const [files, setFiles] = useState<{ name: string; text: string }[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [message, setMessage] = useState('')
  const [denied, setDenied] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const readFiles = async (list: FileList | null) => {
    if (!list) return
    const read = await Promise.all(
      [...list].map(async (file) => ({ name: file.name, text: await file.text() })),
    )
    setFiles(read)
    setResult(null)
    setMessage(`${read.length}개 파일을 읽었다`)
  }

  const send = async (confirm: boolean) => {
    if (files.length === 0) {
      setMessage('파일을 먼저 고른다')
      return
    }
    setBusy(true)
    try {
      const season = currentSeason.trim() === '' ? undefined : Number(currentSeason)
      const data = await adminFetch<ImportResult>('/legacy', {
        method: 'POST',
        body: { leagueSlug, files, currentSeason: season, confirm },
      })
      setResult(data)
      setMessage(
        confirm ? `${data.created}건 저장했다` : '미리보기다. 아직 아무것도 저장하지 않았다',
      )
    } catch (error) {
      if (error instanceof AdminError) setDenied(error.message)
      else setMessage(error instanceof Error ? error.message : '실패')
    } finally {
      setBusy(false)
    }
  }

  if (denied) return <AdminDenied message={denied} />

  return (
    <AdminCard title="과거 시즌 기록 이관">
      <p className="mb-3 text-sm text-meta">
        브라우저로 저장한 HTML, 또는 운영자가 준 CSV/JSON을 올린다. 여러 개를 한 번에 올리면
        같은 (선수·시즌) 카드끼리 합쳐진다 — 시즌 마감 <b>직전</b> 파일과 마감 <b>직후</b> 파일을
        같이 올리는 것이 정석이다. 원본에 없는 값은 채우지 않고 비워 둔다.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-sm">
          리그{' '}
          <input
            className="w-32 border border-divider px-2 py-1"
            value={leagueSlug}
            onChange={(event) => setLeagueSlug(event.target.value)}
          />
        </label>
        <label className="text-sm">
          진행 중 시즌 번호{' '}
          <input
            className="w-20 border border-divider px-2 py-1"
            placeholder="7"
            value={currentSeason}
            onChange={(event) => setCurrentSeason(event.target.value)}
          />
        </label>
        <input
          type="file"
          multiple
          accept=".html,.htm,.json,.csv"
          className="text-sm"
          onChange={(event) => void readFiles(event.target.files)}
        />
      </div>

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="cursor-pointer border border-divider px-3 py-1 text-sm"
          onClick={() => void send(false)}
        >
          미리보기
        </button>
        <button
          type="button"
          disabled={busy || !result || result.counts.create === 0}
          className="cursor-pointer border border-divider px-3 py-1 text-sm font-semibold"
          onClick={() => void send(true)}
        >
          확정 저장{result ? ` (${result.counts.create}건)` : ''}
        </button>
      </div>

      {message ? <p className="mb-3 text-sm">{message}</p> : null}

      {result ? (
        <>
          <div className="mb-3 flex flex-wrap gap-4">
            <Stat label="대상 시즌" value={result.seasons.join(', ') || '-'} />
            <Stat label="신규" value={result.counts.create} />
            <Stat label="중복" value={result.counts.duplicate} hint="건너뜀" />
            <Stat label="충돌" value={result.counts.conflict} hint="확인 필요" />
            <Stat label="확정 거부" value={result.counts.frozen} hint="이미 고정된 시즌" />
          </div>

          {result.warnings.length > 0 ? (
            <div className="mb-3 border border-lose-line p-2 text-sm text-lose">
              {result.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          {result.issues.length > 0 ? (
            <table className="mb-3 w-full text-sm">
              <thead>
                <tr className="border-b border-divider text-left">
                  <th>선수</th>
                  <th>시즌</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {result.issues.map((issue) => (
                  <tr key={`${issue.legacy_player_id}-${issue.season}`} className="border-b border-divider">
                    <td>
                      {issue.nickname ?? '-'}{' '}
                      <span className="text-xs text-meta">{issue.legacy_player_id}</span>
                    </td>
                    <td>{issue.season}</td>
                    <td className="text-lose">
                      {VERDICT_LABEL[issue.verdict] ?? issue.verdict}
                      {issue.note ? <span className="text-meta"> — {issue.note}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {result.sample.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-divider text-left">
                  <th>시즌</th>
                  <th>선수</th>
                  <th>순위</th>
                  <th>전적</th>
                  <th>래더</th>
                </tr>
              </thead>
              <tbody>
                {result.sample.map((row) => (
                  <tr key={`${row.legacyPlayerId}-${row.season}`} className="border-b border-divider">
                    <td>{row.season}</td>
                    <td>
                      {row.nickname ?? '-'}{' '}
                      <span className="text-xs text-meta">{row.legacyPlayerId}</span>
                    </td>
                    {/* 원본에 없으면 비워 둔다. 0으로 채우지 않는다 */}
                    <td>{row.rank ?? '기록 없음'}</td>
                    <td>
                      {row.win ?? '-'}승 {row.lose ?? '-'}패
                    </td>
                    <td>{row.rating ?? '기록 없음'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      ) : null}
    </AdminCard>
  )
}
