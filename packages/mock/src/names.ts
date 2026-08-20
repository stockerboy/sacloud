/**
 * Mock 픽스처용 이름 풀.
 *
 * 원본 사이트의 실제 클랜명·닉네임·리그명은 **복사하지 않는다**.
 * 여기 있는 값은 전부 이 프로젝트에서 새로 만든 가상의 이름이다.
 */

export const NICK_PREFIX = [
  '검은', '푸른', '붉은', '하얀', '차가운', '고요한', '빠른', '조용한',
  '어두운', '밝은', '거친', '깊은', '새벽', '한밤', '노을', '서리',
] as const

export const NICK_BODY = [
  '늑대', '매', '여우', '표범', '까마귀', '고래', '사슴', '수달',
  '두더지', '올빼미', '살쾡이', '기린', '들개', '해오라기', '너구리', '족제비',
] as const

export const CLAN_PREFIX = [
  '북방', '남해', '동편', '서산', '설원', '해무', '월광', '적야',
  '청류', '흑풍', '백야', '천공', '심연', '초원', '한류', '뇌운',
] as const

export const CLAN_BODY = [
  '기병대', '수색대', '방위대', '유격대', '정찰대', '연합', '결사대', '전위대',
] as const

export const CLAN_SLUG_STEM = [
  'northward', 'seahaze', 'eastedge', 'westhill', 'snowfield', 'moonlight',
  'redveil', 'bluestream', 'blackwind', 'whitenight', 'skyward', 'abyssal',
  'grassland', 'coldflow', 'thunderclad', 'ironpine',
] as const

/** 클랜원 포지션 메모 (원본은 자유 입력) */
export const POSITIONS = [
  '2층', 'B 사이트', '중앙', '좌측', '우측', '수비', '돌격', '후방', '엄호',
] as const

export const BOARD_TITLE_HEAD = [
  '오늘 클랜전', '이번 시즌', '래더 점수', '배치고사', '스나 라인',
  '연습 상대', '팀원 모집', '리그 규정', '경기 일정', '전적 갱신',
] as const

export const BOARD_TITLE_TAIL = [
  '질문드립니다', '후기 남깁니다', '어떻게 보시나요', '정리해봤습니다',
  '공유합니다', '조언 부탁드려요', '기록 남깁니다', '의견 궁금합니다',
] as const

export const COMMENT_BODY = [
  '좋은 정보 감사합니다.',
  '저도 비슷한 경험이 있었습니다.',
  '이 부분은 리그 규정 확인이 필요해 보입니다.',
  '기록 갱신하면 반영되는 것 같습니다.',
  '다음 경기도 화이팅입니다.',
  '자세한 설명 고맙습니다.',
  '저는 조금 다르게 생각합니다.',
  '정리 깔끔하네요.',
] as const

/** 비로그인 익명 작성자 별칭의 앞부분 (규칙 자체는 원본 [미확인]) */
export const ANON_ALIAS_STEM = [
  '무명', '나그네', '지나가던', '구경꾼', '초보', '고인물', '눈팅', '떠돌이',
] as const
