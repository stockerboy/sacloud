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

/** 커서 목록 응답: data는 배열, metadata.cursor 필수 */
export function paginatedResponse<TItem extends z.ZodTypeAny>(item: TItem) {
  return z.object({
    message: z.string(),
    data: z.array(item),
    metadata: z.object({ cursor: CursorMetadata }),
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
