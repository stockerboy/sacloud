import { PAGE_SIZE } from '@sacloud/contract'

/** 쿼리스트링 한 개. 없으면 null. */
export function query(request: Request, name: string): string | null {
  return new URL(request.url).searchParams.get(name)
}

/** 정수 쿼리스트링. 없거나 숫자가 아니면 기본값. */
export function intQuery(request: Request, name: string, fallback: number): number {
  const raw = query(request, name)
  if (raw === null) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : fallback
}

/** 커서 페이지네이션 파라미터 (크기는 원본 관측값 고정) */
export function pageParams(request: Request, size: number = PAGE_SIZE.DEFAULT) {
  return { cursor: query(request, 'cursor'), size }
}

/**
 * Next 15의 동적 라우트 파라미터는 Promise다.
 * 디코딩까지 한 번에 처리한다 (한글 클랜명·닉네임이 경로에 들어온다).
 */
export async function routeParam(
  context: { params: Promise<Record<string, string | string[] | undefined>> },
  name: string,
): Promise<string> {
  const params = await context.params
  const value = params[name]
  const raw = Array.isArray(value) ? value[0] : value
  return raw ? decodeURIComponent(raw) : ''
}

/** JSON 본문. 형식이 깨졌으면 null. */
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
