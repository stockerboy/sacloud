'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  LEAGUE_AGREEMENTS,
  Skeleton,
  validateLeagueDraft,
  validateLeagueName,
  validateLeagueSlug,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { AuthGuard } from '@/components/AuthGuard'

/**
 * 리그 만들기 `/leagues/create`.
 *
 입력 제약은 `packages/ui/src/league/leagueCreate.ts` 가 들고 있다.
 * **서든어택 계정 연동을 마친 회원만** 만들 수 있다 → `AuthGuard requireLinked`.
 * 캡차는 아직 없다 — 토큰 자리만 채운다.
 *
 * `적진` 톤 — 카드 그림자를 걷어내고 1px 선과 여백으로만 나눈다.
 * 선택된 칩은 면을 칠하지 않고 **진홍 테두리**로 표시한다. 버튼이 하는 일은 그대로다.
 */
function CreateForm() {
  const router = useRouter()
  const ready = useApiReady()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [divisionCount, setDivisionCount] = useState(1)
  const [mapIds, setMapIds] = useState<string[]>([])
  const [playerLimits, setPlayerLimits] = useState<number[]>([])
  const [agreements, setAgreements] = useState<boolean[]>(LEAGUE_AGREEMENTS.map(() => false))

  const maps = useQuery({
    queryKey: ['maps'],
    queryFn: () => apiGet('mapList'),
    enabled: ready,
  })

  const draft = { name, slug, divisionCount, mapIds, playerLimits, agreements }
  const formError = validateLeagueDraft(draft)

  const create = useMutation({
    mutationFn: () =>
      apiSend('leagueCreate', {
        body: {
          name: name.trim(),
          slug: slug.trim(),
          division_count: divisionCount,
          map_ids: mapIds,
          player_limits: playerLimits,
          agreements: agreements.map(() => true),
          captcha_token: 'mock',
        },
      }),
    onSuccess: (response) => router.push(`/league/${response.data.slug}/home/info`),
  })

  const toggle = <T,>(list: T[], value: T, set: (next: T[]) => void) => {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  return (
    <div className="pc-container py-[var(--section-gap)] pb-20">
      <h1 className="font-display text-3xl tracking-wide text-text-strong">리그 만들기</h1>

      <div className="mt-8 max-w-3xl rounded-[var(--radius)] border border-line px-8 py-8 max-md:px-4">
        <Field label="리그이름" hint="한글·영어·숫자 2~8자. 이름이 &quot;리그&quot;로 끝날 수 없습니다.">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 w-80 max-w-full rounded-[var(--radius)] border border-line bg-card-2 px-3 text-text"
          />
          <FieldError message={name ? validateLeagueName(name) : null} />
        </Field>

        <Field label="리그영문이름" hint="영문·숫자 4~16자. 주소로 사용됩니다.">
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            className="h-11 w-80 max-w-full rounded-[var(--radius)] border border-line bg-card-2 px-3 text-text"
          />
          <div className="mt-1.5 font-num text-sm text-faint">/league/{slug || 'yourleague'}</div>
          <FieldError message={slug ? validateLeagueSlug(slug) : null} />
        </Field>

        <Field label="리그타입">
          <div className="flex items-center">
            {[1, 2, 3, 4].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setDivisionCount(count)}
                className={`mr-2 rounded-[var(--radius)] border px-4 py-2 ${
                  divisionCount === count
                    ? 'border-accent font-semibold text-text-strong'
                    : 'border-line text-meta'
                }`}
              >
                {/* 「부리그」 는 안 쓴다 (지시 #23) */}
                {count === 1 ? '단일리그' : `${count}티어`}
              </button>
            ))}
          </div>
        </Field>

        <Field label="리그맵" hint="선택한 맵의 경기만 기록됩니다. 최소 1개.">
          {!maps.data ? (
            <Skeleton className="h-[40px] w-full" />
          ) : (
            <div className="flex flex-wrap">
              {maps.data.data.map((map) => (
                <button
                  key={map.id}
                  type="button"
                  onClick={() => toggle(mapIds, map.id, setMapIds)}
                  className={`mb-2 mr-2 rounded-[var(--radius)] border px-4 py-2 ${
                    mapIds.includes(map.id)
                      ? 'border-accent font-semibold text-text-strong'
                      : 'border-line text-meta'
                  }`}
                >
                  {map.name}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="대전인원" hint="선택한 종류의 경기만 기록됩니다. 최소 1개.">
          <div className="flex items-center">
            {[5, 6].map((limit) => (
              <button
                key={limit}
                type="button"
                onClick={() => toggle(playerLimits, limit, setPlayerLimits)}
                className={`mr-2 rounded-[var(--radius)] border px-4 py-2 ${
                  playerLimits.includes(limit)
                    ? 'border-accent font-semibold text-text-strong'
                    : 'border-line text-meta'
                }`}
              >
                {limit} vs {limit}
              </button>
            ))}
          </div>
        </Field>

        <Field label="동의 항목">
          {LEAGUE_AGREEMENTS.map((text, index) => (
            <label key={text} className="mb-2 flex items-start text-sm leading-relaxed text-meta">
              <input
                type="checkbox"
                checked={agreements[index] ?? false}
                onChange={(event) => {
                  const next = [...agreements]
                  next[index] = event.target.checked
                  setAgreements(next)
                }}
                className="mr-2 mt-1"
              />
              <span>{text}</span>
            </label>
          ))}
        </Field>

        {formError ? <div className="mt-2 text-lose">{formError}</div> : null}
        {create.isError ? <div className="mt-2 text-lose">리그를 만들지 못했습니다.</div> : null}

        <div className="mt-6">
          <button
            type="button"
            disabled={!!formError || create.isPending}
            onClick={() => create.mutate()}
            className="h-12 w-40 rounded-[var(--radius)] bg-accent font-semibold tracking-wide text-text-strong disabled:opacity-40"
          >
            리그 만들기
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-8">
      <div className="mb-2 font-semibold text-text-strong">{label}</div>
      {hint ? <div className="mb-2.5 text-sm leading-relaxed text-faint">{hint}</div> : null}
      {children}
    </div>
  )
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null
  return <div className="mt-1 text-sm text-lose">{message}</div>
}

export default function LeagueCreatePage() {
  return (
    <AuthGuard requireLinked>
      <CreateForm />
    </AuthGuard>
  )
}
