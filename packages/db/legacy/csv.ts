/**
 * 아주 작은 CSV 파서.
 *
 * 의존성을 새로 넣지 않으려고 직접 썼다. 다루는 범위는 다음뿐이다.
 * - 쉼표 구분, 헤더 1줄
 * - 큰따옴표로 감싼 값, 그 안의 `""` 이스케이프, 값 안의 쉼표·줄바꿈
 * - CRLF / LF
 *
 * 이 이상(다른 구분자, BOM 없는 인코딩 추측 등)은 다루지 않는다.
 * 필요해지면 그때 검증된 라이브러리로 바꾼다.
 */

export interface CsvRow {
  [column: string]: string
}

/** 한 줄을 필드 배열로 쪼갠다 */
function parseFields(text: string, start: number): { fields: string[]; next: number } {
  const fields: string[] = []
  let field = ''
  let quoted = false
  let index = start

  while (index < text.length) {
    const char = text[index]

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"') {
      quoted = true
      index += 1
      continue
    }
    if (char === ',') {
      fields.push(field)
      field = ''
      index += 1
      continue
    }
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      index += 1
      break
    }
    field += char
    index += 1
  }

  fields.push(field)
  return { fields, next: index }
}

export function parseCsv(text: string): CsvRow[] {
  // 엑셀이 붙이는 BOM 제거
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const header = parseFields(body, 0)
  const columns = header.fields.map((name) => name.trim())
  const rows: CsvRow[] = []

  let cursor = header.next
  while (cursor < body.length) {
    const { fields, next } = parseFields(body, cursor)
    cursor = next

    // 완전히 빈 줄은 건너뛴다
    if (fields.every((value) => value.trim() === '')) continue

    const row: CsvRow = {}
    columns.forEach((column, index) => {
      row[column] = (fields[index] ?? '').trim()
    })
    rows.push(row)
  }

  return rows
}
