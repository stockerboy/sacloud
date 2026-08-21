/**
 * 넥슨 응답 Zod 스키마 — 공식 OpenAPI 스펙(2026-08-21 실측)을 옮긴 것.
 *
 * 방침
 * 1. **관대하게 파싱한다.** 스펙이 required를 표시하지 않으므로 모든 필드를 optional로 두고,
 *    없으면 `null`(= 알 수 없음)로 다룬다. 값을 지어내지 않는다.
 * 2. **모르는 필드를 버리지 않는다.** `passthrough()`로 통과시키고, 원본 자체는
 *    `RawImport`에 무가공으로 남긴다.
 * 3. 숫자 필드는 문자열로 올 수도 있어(게이트웨이 특성 [미확인]) 숫자 변환을 허용한다.
 */
import { z } from 'zod'

/** 숫자 또는 숫자 문자열 → number. 그 외에는 `null`. */
const LooseNumber = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined) return null
    const parsed = typeof value === 'number' ? value : Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  })

/** 문자열 이외 타입도 문자열로 받아 둔다. 빈 문자열은 `null`. */
const LooseString = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text === '' ? null : text
  })

export const NexonErrorBody = z
  .object({
    error: z
      .object({
        name: LooseString,
        message: LooseString,
      })
      .passthrough(),
  })
  .passthrough()
export type NexonErrorBody = z.infer<typeof NexonErrorBody>

/** GET /suddenattack/v1/id */
export const NexonIdResponse = z.object({ ouid: LooseString }).passthrough()
export type NexonIdResponse = z.infer<typeof NexonIdResponse>

/** GET /suddenattack/v1/user/basic */
export const NexonUserBasicResponse = z
  .object({
    user_name: LooseString,
    user_date_create: LooseString,
    title_name: LooseString,
    clan_name: LooseString,
    manner_grade: LooseString,
  })
  .passthrough()
export type NexonUserBasicResponse = z.infer<typeof NexonUserBasicResponse>

/** GET /suddenattack/v1/match — 최대 1000건, 커서 없음 */
export const NexonMatchListResponse = z
  .object({
    match: z
      .array(
        z
          .object({
            match_id: LooseString,
            match_type: LooseString,
            match_mode: LooseString,
            date_match: LooseString,
            match_result: LooseString,
            kill: LooseNumber,
            death: LooseNumber,
            assist: LooseNumber,
          })
          .passthrough(),
      )
      .nullish()
      .transform((value) => value ?? []),
  })
  .passthrough()
export type NexonMatchListResponse = z.infer<typeof NexonMatchListResponse>

/** GET /suddenattack/v1/match-detail */
export const NexonMatchDetailResponse = z
  .object({
    match_id: LooseString,
    match_type: LooseString,
    match_mode: LooseString,
    date_match: LooseString,
    match_map: LooseString,
    match_detail: z
      .array(
        z
          .object({
            team_id: LooseString,
            match_result: LooseString,
            user_name: LooseString,
            season_grade: LooseString,
            /** 클랜전·퀵매치 클랜전·클랜 랭크전에서만 내려온다(스펙 명시) */
            clan_name: LooseString,
            kill: LooseNumber,
            death: LooseNumber,
            headshot: LooseNumber,
            damage: LooseNumber,
            assist: LooseNumber,
          })
          .passthrough(),
      )
      .nullish()
      .transform((value) => value ?? []),
  })
  .passthrough()
export type NexonMatchDetailResponse = z.infer<typeof NexonMatchDetailResponse>
