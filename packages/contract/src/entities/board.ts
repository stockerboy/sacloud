import { z } from 'zod'
import { Count, Id, IsoDateTime, Slug } from '../common'
import { BoardSearchType, DiscloseType, VoteType, WriterApp } from '../codes'
import { Writer } from './summaries'

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
  writer: Writer,
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
  writer: Writer,
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
