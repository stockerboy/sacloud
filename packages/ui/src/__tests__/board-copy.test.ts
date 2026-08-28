import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BOARD_SLUG,
  boardAllowsWriteAndSearch,
  boardHeading,
} from '../board/boardCopy'

describe('boardHeading — 탭 아래 소제목', () => {
  it('원본 실측값 (2026-08-27)', () => {
    expect(boardHeading('자유')).toBe('자유게시판')
    expect(boardHeading('인기')).toBe('인기게시판')
    expect(boardHeading('3부')).toBe('3부게시판')
  })
})

describe('boardAllowsWriteAndSearch — 인기게시판만 읽기 전용', () => {
  it('인기게시판에는 글쓰기도 검색도 없다', () => {
    expect(boardAllowsWriteAndSearch('hot')).toBe(false)
  })

  it('나머지 게시판은 둘 다 있다', () => {
    for (const slug of ['free', 'sanply', 'asupply', 'rankedplay', 'champs', 'streamer']) {
      expect(boardAllowsWriteAndSearch(slug)).toBe(true)
    }
  })
})

describe('DEFAULT_BOARD_SLUG — /board 랜딩', () => {
  it('원본은 자유게시판으로 간다 (인기게시판이 아니다)', () => {
    expect(DEFAULT_BOARD_SLUG).toBe('free')
  })
})
