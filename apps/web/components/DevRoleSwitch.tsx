'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { resolveApiMode } from '@sacloud/contract'
import { MOCK_ROLES, MOCK_ROLE_LABEL, getMockRole, setMockRole, type MockRole } from '@sacloud/mock/session'

/**
 * 개발용 세션 전환 스위치.
 *
 * **원본에는 없는 개발 편의 장치다** (Phase 6 계획 5항: "Mock 사용자 3종 전환 스위치").
 * Mock 단계에는 실제 로그인이 없어서, 역할별 화면을 확인하려면 전환 수단이 필요하다.
 *
 * `NEXT_PUBLIC_API_MODE=mock` 일 때만 렌더한다. Phase 7에서 실제 인증이 붙으면 제거한다.
 * 원본과 비교 검수할 때는 이 요소를 "차이 아님"으로 본다.
 */
const API_MODE = resolveApiMode({ NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE })

export function DevRoleSwitch() {
  const queryClient = useQueryClient()
  const [role, setRole] = useState<MockRole>('guest')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setRole(getMockRole())
  }, [])

  if (API_MODE !== 'mock') return null

  const change = (next: MockRole) => {
    setMockRole(next)
    setRole(next)
    setOpen(false)
    // 로그인 상태에 따라 응답이 달라지므로 전부 다시 받는다
    void queryClient.invalidateQueries()
  }

  return (
    <div className="fixed bottom-3 right-3 z-[100] text-sm">
      {open ? (
        <div className="mb-1 rounded border border-line bg-card shadow-card">
          {MOCK_ROLES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => change(item)}
              className={`block w-40 px-3 py-2 text-left hover:bg-page ${
                item === role ? 'font-bold' : ''
              }`}
            >
              {MOCK_ROLE_LABEL[item]}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded border border-line bg-card px-3 py-2 shadow-card"
      >
        Mock 세션: {MOCK_ROLE_LABEL[role]}
      </button>
    </div>
  )
}
