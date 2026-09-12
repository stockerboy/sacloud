import { z } from 'zod'

/**
 * 공통 응답 래퍼: { "message": "success", "data": ..., "metadata": {...} }
 */

export const CursorMetadata = z.object({
  prev: z.string().nullable(),
  next: z.string().nullable(),
})
export type CursorMetadata = z.infer<typeof CursorMetadata>

export const ResponseMetadata = z.object({
  cursor: CursorMetadata.optional(),
})
export type ResponseMetadata = z.infer<typeof ResponseMetadata>

/** 단건/객체 응답 */
export function apiResponse<TData extends z.ZodTypeAny>(data: TData) {
  return z.object({
    message: z.string(),
    data,
    metadata: ResponseMetadata.optional(),
  })
}

/**
 * 커서 목록 응답: data는 배열, metadata.cursor 필수.
 *
 * ★`total` 은 있을 수도 없을 수도 있다★ (2026-09-12 사장님: 개인랭킹 페이지 번호).
 * 페이지 번호를 그리려면 «모두 몇 줄인가» 를 알아야 한다. 커서 방식은 그 값을 안 센다 —
 * 세는 데 돈이 드니까 ★센 곳만★ 싣는다. 나머지 목록은 한 글자도 안 바뀐다.
 *
 * ⚠ zod 는 모르는 칸을 ★조용히 버린다.★ 여기에 안 적으면 서버가 보내도 화면엔 안 온다.
 */
export function paginatedResponse<TItem extends z.ZodTypeAny>(item: TItem) {
  return z.object({
    message: z.string(),
    data: z.array(item),
    metadata: z.object({ cursor: CursorMetadata, total: z.number().int().nullable().optional() }),
  })
}

/** 에러 응답. 원본 에러 포맷은 `[미확인]` — 우리 계약으로 확정한다. */
export const ErrorResponse = z.object({
  message: z.string(),
  data: z.null().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
})
export type ErrorResponse = z.infer<typeof ErrorResponse>

export const SUCCESS_MESSAGE = 'success'
