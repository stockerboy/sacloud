'use client'

import { useEffect, useState } from 'react'
import { buildPath, endpoints, type EndpointKey } from '@sacloud/contract'
import { API_BASE_URL } from './dev-mock-provider'

/**
 * Phase 0 완료 조건 확인용 개발 프로브.
 *
 * "브라우저에서 Mock API 호출이 계약대로 응답한다"를 눈으로 확인하기 위한 임시 화면이다.
 * Phase 1에서 실제 홈 화면을 만들 때 제거한다. 원본에는 없는 화면이므로 재현 대상이 아니다.
 */

interface ProbeCase {
  key: EndpointKey
  params?: Record<string, string>
  search?: Record<string, string>
}

const CASES: ProbeCase[] = [
  { key: 'infos' },
  { key: 'leagueList' },
  { key: 'leagueShow', params: { leagueSlug: 'officialmain' } },
  { key: 'leagueRankClans', params: { leagueId: 'officialmain' }, search: { division: '1' } },
  { key: 'leagueRankPlayers', params: { leagueId: 'officialmain' } },
  { key: 'boardList', search: { category: 'hot' } },
  { key: 'mapList' },
]

interface ProbeResult {
  key: EndpointKey
  url: string
  status: number
  contractOk: boolean
  detail: string
}

export function DevMockProbe() {
  const [results, setResults] = useState<ProbeResult[] | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const collected: ProbeResult[] = []

      for (const probe of CASES) {
        const endpoint = endpoints[probe.key]
        const search = probe.search ? `?${new URLSearchParams(probe.search).toString()}` : ''
        const url = `${API_BASE_URL}${buildPath(endpoint.path, probe.params ?? {})}${search}`

        try {
          const response = await fetch(url)
          const payload: unknown = await response.json()
          const parsed = endpoint.response.safeParse(payload)
          collected.push({
            key: probe.key,
            url,
            status: response.status,
            contractOk: parsed.success,
            detail: parsed.success
              ? describe(payload)
              : parsed.error.issues.slice(0, 2).map((issue) => issue.message).join(' / '),
          })
        } catch (error) {
          collected.push({
            key: probe.key,
            url,
            status: 0,
            contractOk: false,
            detail: error instanceof Error ? error.message : '요청 실패',
          })
        }
      }

      if (cancelled) return
      setResults(collected)
      console.info('[sacloud] Mock API 계약 검증 결과', collected)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (!results) return <p>Mock API 호출 중…</p>

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 960 }}>
      <thead>
        <tr>
          <th style={cell}>엔드포인트</th>
          <th style={cell}>상태</th>
          <th style={cell}>계약</th>
          <th style={cell}>응답 요약</th>
        </tr>
      </thead>
      <tbody>
        {results.map((result) => (
          <tr key={result.key}>
            <td style={cell}>{result.key}</td>
            <td style={cell}>{result.status}</td>
            <td style={cell}>{result.contractOk ? 'OK' : 'FAIL'}</td>
            <td style={cell}>{result.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const cell: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  padding: '4px 8px',
  textAlign: 'left',
  verticalAlign: 'top',
}

function describe(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ''
  const data = (payload as { data?: unknown }).data
  if (Array.isArray(data)) return `${data.length}건`
  if (data && typeof data === 'object') return Object.keys(data).slice(0, 5).join(', ')
  return ''
}
