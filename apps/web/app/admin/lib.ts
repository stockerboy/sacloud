/**
 * 관리자 화면 공용 유틸.
 *
 * 화면은 **보여 주기만** 한다. 권한 판정은 전부 서버가 한다 (정책 22).
 * 그래서 여기서 403을 받으면 그대로 "권한 없음"을 보여 준다 — 버튼을 감춰서 막지 않는다.
 */
export class AdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function adminFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  })
  const payload = (await response.json()) as { message: string; data: T }
  if (!response.ok) throw new AdminError(payload.message, response.status)
  return payload.data
}

/**
 * 데이터 출처 배지 — mock을 운영 데이터로 착각하지 않게 한다 (정책 25).
 *
 * 색을 넷으로 나누던 것을 그만뒀다 (`적진` 은 색이 하나뿐이다). 대신 **`MOCK` 하나만**
 * 진홍 테두리로 튀게 두고 나머지는 회색으로 가라앉힌다 — 실수를 막아야 하는 것은
 * "이건 가짜다" 하나이지, 출처 네 갈래의 구분이 아니다.
 */
export function originLabel(origin: string): { text: string; className: string } {
  switch (origin) {
    case 'mock':
      return { text: 'MOCK', className: 'border-accent bg-card text-accent' }
    case 'nexon':
      return { text: 'NEXON', className: 'border-line bg-card text-text' }
    case '3rd.supply':
      return { text: 'LEGACY', className: 'border-line bg-card text-meta' }
    default:
      return { text: 'MANUAL', className: 'border-line bg-card text-meta' }
  }
}
