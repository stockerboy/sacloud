import { z } from 'zod'

/**
 * 원본에서 관측된 코드 값.
 * 관측되지 않은 값의 존재 가능성이 있는 항목은 `[미확인]`으로 표기하고
 * 스키마를 열어 두되(정수 허용), 의미가 확인된 값만 상수로 노출한다.
 */

/** 무기 구분: 라인업에는 스나이퍼를 `[S]`로 표기한다 */
export const WEAPON = {
  /** 라이플 */
  RIFLE: 0,
  /** 스나이퍼 */
  SNIPER: 1,
} as const
export const Weapon = z.union([z.literal(0), z.literal(1)])
export type Weapon = z.infer<typeof Weapon>

/** 부리그. 1 = 1부리그. League.division_count가 1이면 단일리그(탭 미표시). */
export const Division = z.number().int().min(1)
export type Division = z.infer<typeof Division>

/**
 * 시즌 종류 (D-098).
 *
 *   legacy    3rd.supply에서 이전된 과거 기록. 재계산 대상이 아니다
 *   beta      공개 베타 시즌. 기록은 보여 주되 다음 정식 시즌에 승계하지 않는다
 *   official  SACLOUD 정식 시즌
 *
 * 베타의 내부 번호는 0이지만 **화면에 "Season 0"이라고 쓰지 않는다.**
 * 표시용 이름은 항상 `season_label`을 쓴다.
 */
export const SeasonType = z.enum(['legacy', 'beta', 'official'])
export type SeasonType = z.infer<typeof SeasonType>

/** 팀 진영. 원본 매치 상세가 red[] / blue[] 두 배열로 내려온다. */
export const TeamSide = z.enum(['red', 'blue'])
export type TeamSide = z.infer<typeof TeamSide>

/** 게시글 작성 경로: 0 = 웹, 1 = 앱 */
export const WRITER_APP = { WEB: 0, APP: 1 } as const
export const WriterApp = z.union([z.literal(0), z.literal(1)])
export type WriterApp = z.infer<typeof WriterApp>

/**
 * 공개 수준: 0 = 일반(닉네임 공개). 0 이외 값은 익명 표기.
 * 0 이외 값들의 정확한 체계는 `[미확인]`.
 */
export const DISCLOSE_TYPE = { PUBLIC: 0, ANONYMOUS: 1 } as const
export const DiscloseType = z.number().int().min(0)
export type DiscloseType = z.infer<typeof DiscloseType>

/**
 * 사용자 권한: 0 = 일반, 2 = 운영자(관측값).
 * 1을 포함한 나머지 값의 의미는 `[미확인]`.
 */
export const ROLE = { USER: 0, ADMIN: 2 } as const
export const Role = z.number().int().min(0)
export type Role = z.infer<typeof Role>

/**
 * LeagueClan 상태: 0 = 대기/배치, 1 = 정상 (관측값).
 * 삭제대기·추방 등 다른 상태의 코드 값은 `[미확인]`.
 */
export const LEAGUE_CLAN_STATUS = { PENDING: 0, ACTIVE: 1 } as const
export const LeagueClanStatus = z.number().int().min(0)
export type LeagueClanStatus = z.infer<typeof LeagueClanStatus>

/** 리그 상태. 값 체계 `[미확인]` — 관측된 정상 리그는 1. */
export const LeagueStatus = z.number().int().min(0)
export type LeagueStatus = z.infer<typeof LeagueStatus>

/** 대전 인원: 5vs5 / 6vs6 */
export const PlayerLimit = z.union([z.literal(5), z.literal(6)])
export type PlayerLimit = z.infer<typeof PlayerLimit>

/** 게시판 검색 대상 */
export const BoardSearchType = z.enum(['board', 'ipname', 'nickname'])
export type BoardSearchType = z.infer<typeof BoardSearchType>

/** 통합검색 대상 */
export const SearchTarget = z.enum(['player', 'clan', 'league'])
export type SearchTarget = z.infer<typeof SearchTarget>

/** 추천/비추천 상태 (`like_type`). 정확한 값 체계는 `[미확인]` — 계약상 -1/0/1로 고정한다. */
export const VoteType = z.union([z.literal(-1), z.literal(0), z.literal(1)])
export type VoteType = z.infer<typeof VoteType>
