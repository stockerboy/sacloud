import { z } from 'zod'
import { Count, Id, IsoDateTime, Slug } from '../common'
import { BoardSearchType, DiscloseType, VoteType, WriterApp } from '../codes'
import { ClanSummary, PlayerSummary, Writer } from './summaries'

/**
 * 게시글·댓글 작성자 (반익명 — SITE_SPEC_V2 2절 · 에브리타임 방식).
 *
 * `Writer` 에 세 가지를 더한다. 기존 응답과 호환되도록 전부 기본값이 있다.
 *
 * **서버가 지키는 불변식** (`packages/contract/src/anonymity.ts` 참고)
 * - `anonymous === true` 이면 `id` 와 `player` 는 **반드시 `null`** 이고
 *   `nickname` 은 `글쓴이` · `익명1` 같은 **표시 이름**이다.
 *   실제 닉네임·user id·player id 는 응답에 담기지 않는다 — 담기는 순간 익명이 아니다.
 * - `clan` 은 **익명이어도 나간다.** 에브리타임에서 익명 글에도 학교가 붙는 것과 같다.
 */
export const BoardWriter = Writer.extend({
  /** 익명 표시인가. true 면 `nickname` 은 그 글 안에서만 뜻이 있는 표시 이름이다 */
  anonymous: z.boolean().default(false),
  /** 소속 클랜 — `veritas 소속`. 익명이어도 노출한다. 소속이 없으면 null */
  clan: ClanSummary.nullable().default(null),
  /** 닉네임을 누르면 갈 개인 기록의 선수. **익명이면 반드시 null** */
  player: PlayerSummary.nullable().default(null),
})
export type BoardWriter = z.infer<typeof BoardWriter>

/** /infos 의 categories[] */
export const Category = z.object({
  slug: Slug,
  name: z.string(),
  /** 공지 카테고리는 목록 상단에 고정 노출된다 */
  notice: z.boolean(),
  order: Count,
})
export type Category = z.infer<typeof Category>

/** GET /boards?category={slug}&cursor= */
export const BoardListItem = z.object({
  id: Id,
  category: Slug,
  title: z.string(),
  writer: BoardWriter,
  /** 0 = 웹, 1 = 앱 */
  writer_app: WriterApp,
  /** 0 = 일반, 그 외 = 익명(목록에 `익명` 표기) */
  disclose_type: DiscloseType,
  comment_count: Count,
  view_count: Count,
  like_count: Count,
  dislike_count: Count,
  has_image: z.boolean(),
  created_at: IsoDateTime,
  last_edited: IsoDateTime.nullable(),
  /** 공지 고정 행 여부 */
  notice: z.boolean(),
})
export type BoardListItem = z.infer<typeof BoardListItem>

/** GET /boards/{id} */
export const Board = BoardListItem.extend({
  /** 저장된 HTML. 렌더 전 반드시 새니타이즈한다. */
  content: z.string(),
  /** 로그인 사용자가 쓴 글인지 (비로그인 익명 글이면 false) */
  login: z.boolean(),
  /** 요청자가 작성자인지 */
  me: z.boolean(),
  /** 요청자의 추천/비추천 상태 */
  like_type: VoteType,
})
export type Board = z.infer<typeof Board>

/** 대댓글 (원본은 1단계까지만 허용) */
export const CommentReply = z.object({
  id: Id,
  board_id: Id,
  parent_id: Id,
  content: z.string(),
  writer: BoardWriter,
  writer_app: WriterApp,
  disclose_type: DiscloseType,
  like_count: Count,
  dislike_count: Count,
  like_type: VoteType,
  /** true면 내용만 가리고 행은 남긴다 */
  deleted: z.boolean(),
  /** 글쓴이가 단 댓글이면 표식을 붙인다 */
  board_writer: z.boolean(),
  login: z.boolean(),
  me: z.boolean(),
  created_at: IsoDateTime,
  last_edited: IsoDateTime.nullable(),
})
export type CommentReply = z.infer<typeof CommentReply>

/** GET /comments?board_id={id} */
export const Comment = CommentReply.extend({
  parent_id: Id.nullable(),
  /** 1단계 대댓글만 중첩된다 */
  comments: z.array(CommentReply),
})
export type Comment = z.infer<typeof Comment>

/** 글 작성/수정 입력 */
export const BoardWriteInput = z.object({
  category: Slug,
  title: z.string().min(1).max(100),
  content: z.string().min(1),
  disclose_type: DiscloseType,
  /** 비로그인 작성 시 삭제용 비밀번호 */
  password: z.string().min(1).nullable(),
  captcha_token: z.string().min(1),
})
export type BoardWriteInput = z.infer<typeof BoardWriteInput>

/** 댓글 작성 입력 */
export const CommentWriteInput = z.object({
  board_id: Id,
  parent_id: Id.nullable(),
  content: z.string().min(1),
  disclose_type: DiscloseType,
  password: z.string().min(1).nullable(),
})
export type CommentWriteInput = z.infer<typeof CommentWriteInput>

/** 게시판 검색 파라미터 */
export const BoardSearchQuery = z.object({
  category: Slug,
  type: BoardSearchType,
  q: z.string().min(1),
  cursor: z.string().optional(),
})
export type BoardSearchQuery = z.infer<typeof BoardSearchQuery>

/** 추천/비추천 입력 */
export const VoteInput = z.object({
  type: VoteType,
})
export type VoteInput = z.infer<typeof VoteInput>

/** 삭제 입력 (비로그인 글은 비밀번호 필요) */
export const DeleteInput = z.object({
  password: z.string().min(1).nullable(),
})
export type DeleteInput = z.infer<typeof DeleteInput>

/**
 * 게시판 카테고리 **기본 목록** — Mock 픽스처와 실제 DB 가 같은 표를 본다.
 *
 * 앞의 다섯은 원본(3rd.supply)에서 관측한 것이고, `spl` · `ipl` 은 사용자가
 * 새로 요구한 것이다 (`docs/SITE_SPEC_V2.md` 2절 — "자유게시판/SPL/IPL").
 *
 * ── 원본 카테고리를 **지우지 않는다**
 *   사용자 지시가 "바꿀 때는 전 버전도 남긴다" 이고, 이미 쌓인 글이 갈 곳을
 *   잃으면 안 된다. 새 게시판은 **덧붙이고** 원본은 순번만 뒤로 민다.
 *
 * > `[미확인]` 열산리그 게시판은 사양 원문에 없다. 그래서 만들지 않았다.
 *
 * ── 2026-08-30 리그 이름 변경에 따라 `spl` 게시판의 **표시 이름만** `SPL` → `DPL` 로 바꿨다.
 *   slug 는 `spl` 그대로다 — 이미 쌓인 글의 경로가 바뀌면 안 된다.
 */
export const BOARD_CATEGORIES: readonly Category[] = [
  { slug: 'notice', name: '공지', notice: true, order: 0 },
  { slug: 'hot', name: '인기', notice: false, order: 1 },
  { slug: 'free', name: '자유', notice: false, order: 2 },
  { slug: 'spl', name: 'DPL', notice: false, order: 3 },
  { slug: 'ipl', name: 'IPL', notice: false, order: 4 },
  { slug: 'officialmain', name: '공식전', notice: false, order: 5 },
  { slug: 'secondline', name: '세컨드', notice: false, order: 6 },
  { slug: 'friendly01', name: '친목전', notice: false, order: 7 },
  { slug: 'rankedplay', name: '랭크전', notice: false, order: 8 },
  { slug: 'streamer', name: '방송', notice: false, order: 9 },
]
