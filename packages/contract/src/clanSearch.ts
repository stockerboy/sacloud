/**
 * 클랜명 검색 — **로마자 클랜명을 한글로 쳐도 찾아진다**.
 *
 * 사양 원문 (사용자, 2026-09-01)
 * ```
 * 클랜명 검색하고(클랜명에 특문과 어려운 영어가 많으니 veritas 클랜을 가정하면 유저가
 * 베리타스 이런식으로 검색하면 나오게 해줘(그리고 클랜명을 한글로 치셔도 나옵니다
 * exOnePoinT >원포 로쳐도 나옴) 문구 유저가 볼 수 있게 해주고
 * ```
 *
 * ```
 * veritas      ← "베리타스"  로 찾는다
 * exOnePoinT   ← "원포"      로 찾는다   (읽기 "엑스원포인트" 의 일부)
 * des`per@do.  ← "desperado" 로도 "데스퍼라도" 로도 찾는다
 * 베이직        ← "ㅂㅇㅈ"    (초성)
 * ```
 *
 * ── 이 모듈은 **순수 함수만** 담는다
 *   DB 도 네트워크도 React 도 모른다. `packages/contract` 는 계약이다.
 *   화면과 API 가 **같은 규칙으로** 검색해야 하므로 규칙을 여기 한 곳에 둔다.
 *
 * ── 이건 표준 외래어 표기법이 **아니다**
 *   완벽한 음역기를 만들지 않았다. 목표는 «실제 클랜명에서 통하는가» 하나다.
 *   그래서 읽는 법이 갈리는 자리는 **여러 개를 낸다** (`veritas` → 베리타스 · 베리타즈 …).
 *   하나라도 걸리면 찾은 것으로 본다.
 *
 * ── 얼마나 되는가 (실제 클랜명 50개 실측 · `__tests__/clanSearch.test.ts` 의 표)
 *   **40 / 50 = 80%.** 100% 가 아니다. 안 되는 것을 숨기지 않고 적어 둔다.
 *
 * ── 못 하는 것 (지어내지 않고 그냥 적어 둔다)
 *   1. **영어 단어의 발음은 모른다.** 철자만 본다.
 *      `supernova` → 「수퍼노바」 (사람은 「슈퍼노바」), `Major` → 「마조·마저」 (「메이저」),
 *      `TOGS` → 「토그스」 (「톡스」), `souffler` → 「수플러」 (「수플레」).
 *   2. **전부 소문자로 붙여 쓴 이름은 낱말을 못 가른다.** 경계가 없어 낱말 표를 못 쓴다.
 *      `whitelie` → 「화이텔리」 (「화이트라이」), `sometimes` → 「소메티메스」 (「썸타임즈」),
 *      `lpcrew` → 「르프크루」 (「엘피크루」), `adererror` → 「아데러로」 (「아더에러」).
 *      **경계가 있으면 된다** — `OhMyLoVe` → 「오마이러브」.
 *   3. 한글 클랜명을 로마자로 쳐서 찾는 **반대 방향은 없다** (`베이직` ← `basic` 안 된다).
 *      요구사항에 없었고, 한글 → 로마자는 갈래가 더 크게 벌어진다.
 *   4. 소문자 `l` 을 대문자 `I` 로 흉내 낸 이름은 다루지만(아래), 그 반대(`I` → `l`)는 안 한다.
 *
 *   못 읽는 이름도 **로마자로는 그대로 찾아진다.** 한글 읽기는 «덤으로 하나 더» 다.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * 0. 화면에 띄우는 안내 문구
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 검색창 밑에 그대로 띄우는 한 줄. 사용자가 «문구 유저가 볼 수 있게» 라고 지시했다.
 *
 * 문구를 고칠 때는 **예시를 지우지 마라** — 이 기능이 있다는 걸 아는 유일한 단서다.
 */
export const CLAN_SEARCH_HINT =
  '클랜명을 한글로 읽어서 쳐도 찾습니다. 예) veritas → 베리타스 · exOnePoinT → 원포 · 초성 ㅂㅇㅈ 도 됩니다'

/* ────────────────────────────────────────────────────────────────────────────
 * 1. 한도 — 왜 이 숫자인가
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 이름 하나가 낼 수 있는 한글 읽기의 **최대 개수**.
 *
 * 읽기가 갈리는 자리(`a` → ㅏ/ㅐ/ㅓ, `c` → ㅋ/ㅅ …)마다 가짓수가 곱해지므로
 * 그냥 두면 글자 10개짜리 이름에서 수천 개가 나온다. 48은 실측으로 고른 값이다 —
 * 표본 50개에서 «사람이 칠 법한 읽기» 가 48번째 안에 들어오는지 보고 정했다.
 * (실제로는 이름 하나가 31개를 넘긴 적이 없다. 상한은 이상한 이름이 들어왔을 때의 안전판이다.)
 *
 * 잘라낼 때는 **아무거나 버리지 않는다.** 각 자리의 대안에 0,1,2… 비용을 매기고
 * 비용 합이 작은 조합부터 낸다 (= 흔한 읽기부터). 그래서 잘리는 쪽은 늘 «드문 읽기» 다.
 */
const MAX_READINGS = 48

/**
 * 한 읽기가 쓸 수 있는 «드문 선택» 의 총합. 3이면 «세 자리까지 드물게 읽어도 된다» 는 뜻.
 *
 * `루브메`(그대로) → `러브미`(u→ㅓ, e→ㅣ = 비용 2) 는 되고,
 * 네 자리 이상이 동시에 어긋나는 읽기는 만들지 않는다. 그런 건 사람이 안 친다.
 */
const MAX_ALT_COST = 3

/** 읽기 캐시 상한. 넘으면 통째로 비운다 (LRU 를 만들 만큼 잦은 호출이 아니다) */
const READING_CACHE_LIMIT = 2000

/* ────────────────────────────────────────────────────────────────────────────
 * 2. 글자 다듬기 — 특수문자 · 리트 · 흉내 글자
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 특수문자로 알파벳을 흉내 낸 것들. **버리기 전에 글자로 되돌린다.**
 *
 * `des`per@do.` 의 `@` 는 장식이 아니라 **`a`** 다. 그냥 지우면 `desperdo` 가 되어
 * `desperado` 로도 `데스퍼라도` 로도 못 찾는다. 실제로 있는 이름이라 규칙으로 박는다.
 *
 * 확실한 것만 넣는다. `0`→`o`, `1`→`l` 같은 건 **넣지 않았다** —
 * `uava01` 처럼 숫자가 진짜 숫자인 이름이 더 많다.
 */
const LEET_LETTERS: Readonly<Record<string, string>> = {
  '@': 'a',
  $: 's',
  '!': 'i',
  '＠': 'a',
}

const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])
const FRONT_VOWEL_LETTERS = new Set(['e', 'i', 'y'])

function isLatin(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}
function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}
function isHangulSyllable(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return c >= 0xac00 && c <= 0xd7a3
}
/** 홀로 쓰인 자음 낱자 (`ㅂ` `ㅇ` `ㅈ` …) — 초성 검색어인지 가리는 데 쓴다 */
function isChosungJamo(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return c >= 0x3131 && c <= 0x314e
}
function isHangul(ch: string): boolean {
  return isHangulSyllable(ch) || isChosungJamo(ch) || (ch >= 'ㅏ' && ch <= 'ㅣ')
}

/**
 * 이름의 **표기 변형**을 만든다. 보통 1개, 흉내 글자가 있으면 2개.
 *
 * ── 대문자 `I` 가 소문자 `l` 인 척하는 이름이 실제로 있다
 *   `ceIestial`(celestial) · `FlexibIe`(flexible). 눈으로 보면 `l` 이고,
 *   **사용자가 치는 글자도 `l`** 이다. 그래서 `I` → `l` 로 바꾼 변형을 하나 더 만든다.
 *   대문자만으로 된 이름(`TOGS` · `IPL`)은 건드리지 않는다 — 거기서 `I` 는 진짜 `I` 다.
 *
 * 반환값은 **원래 대소문자를 유지한다.** 뒤에서 낱말 경계(camelCase)를 찾는 데 필요하다.
 */
function spellingVariants(name: string): string[] {
  const leeted = [...name].map((ch) => LEET_LETTERS[ch] ?? ch).join('')
  const out = [leeted]
  const hasLower = /[a-z]/.test(leeted)
  if (hasLower && leeted.includes('I')) out.push(leeted.replace(/I/g, 'l'))
  return out
}

/** 로마자/숫자 덩어리인가, 한글 덩어리인가 */
interface Run {
  kind: 'roman' | 'hangul'
  /** 원래 대소문자 그대로 (낱말 경계를 찾는 데 쓴다) */
  raw: string
  /** 규칙 대조용 소문자 */
  lower: string
}

/**
 * 특수문자와 공백을 버리고 «로마자 덩어리 / 한글 덩어리» 로 자른다.
 *
 * 버려진 자리는 **덩어리 경계**가 된다. `des`per@do.` → `des` + `perado`.
 * 붙여 읽으면 `데스페라도` 로 같으니 검색에는 영향이 없다.
 */
function splitRuns(spelling: string): Run[] {
  const runs: Run[] = []
  let cur: Run | null = null
  for (const ch of spelling) {
    const kind: Run['kind'] | null = isLatin(ch) || isDigit(ch) ? 'roman' : isHangul(ch) ? 'hangul' : null
    if (kind === null) {
      cur = null
      continue
    }
    if (cur === null || cur.kind !== kind) {
      cur = { kind, raw: '', lower: '' }
      runs.push(cur)
    }
    cur.raw += ch
    cur.lower += ch.toLowerCase()
  }
  return runs
}

/** 검색 대조에 쓰는 «민짜 이름» — 특수문자·공백 없이 소문자로 붙인 것 */
function flatten(runs: Run[]): string {
  return runs.map((r) => r.lower).join('')
}

/**
 * 검색어 다듬기. 이름과 **같은 규칙**으로 깎아야 대조가 된다.
 * 다만 초성 낱자(`ㅂㅇㅈ`)는 살려 둔다.
 */
export function normalizeClanQuery(query: string): string {
  let out = ''
  for (const ch0 of query) {
    const ch = LEET_LETTERS[ch0] ?? ch0
    if (isLatin(ch) || isDigit(ch)) out += ch.toLowerCase()
    else if (isHangul(ch)) out += ch
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. 규칙표 — 로마자 → 한글 음소
 *
 *    **규칙은 전부 여기 있다.** 코드 여기저기에 흩어 놓으면 못 고친다.
 *
 *    음소 코드
 *      `C가`  첫소리(닿소리)      `V ㅏ`  가운뎃소리(홀소리)
 *      `K가`  받침으로 붙인다      `T…`   한글을 그대로 박는다 (낱말 표)
 *
 *    조건(`when`) — 앞뒤를 보는 기준은 **낱말**이다 (경계는 특수문자와 대문자 전환)
 *      `start`    낱말의 첫 글자일 때만
 *      `front`    바로 뒤가 e·i·y 일 때만  (c → ㅅ, g → ㅈ)
 *      `vowel`    바로 뒤가 홀소리일 때만
 *      `novowel`  바로 뒤가 홀소리가 **아닐** 때만 (낱말 끝 포함)
 *      `end`      낱말의 마지막 글자일 때만
 *      `magic`    뒤가 「닿소리 하나 + 낱말 끝 e」 일 때만 (grave · raze)
 *
 *    대안 배열은 **흔한 것부터** 적는다. 앞에 있을수록 비용이 싸다.
 * ──────────────────────────────────────────────────────────────────────────── */

type RuleWhen = 'start' | 'front' | 'vowel' | 'novowel' | 'end' | 'magic'

interface RomanRule {
  key: string
  when?: RuleWhen
  /** 대안들. 각 대안은 음소 코드의 배열이며, 빈 배열은 **묵음**이다 */
  alts: readonly (readonly string[])[]
}

const ROMAN_RULES: readonly RomanRule[] = [
  /*
   * ── 낱말 끝의 자리표 (영어 꼬리말)
   *   글자 규칙으로는 못 내는데 **끝자리에서만** 쓰여서 위험하지 않은 것들만 넣는다.
   *   낱말 한가운데는 절대 건드리지 않는다 (`when: 'end'`).
   */
  { key: 'ator', when: 'end', alts: [['Vㅔ', 'Vㅣ', 'Cㅌ', 'Vㅓ'], ['Vㅏ', 'Cㅌ', 'Vㅗ']] }, // dominator → 도미네이터
  { key: 'ial', when: 'end', alts: [['Vㅣ', 'Vㅓ', 'Kㄹ'], ['Vㅣ', 'Vㅏ', 'Kㄹ']] }, // celestial → …티얼

  // ── 세 글자 이상
  { key: 'igh', alts: [['Vㅏ', 'Vㅣ']] }, // night → 나이트
  { key: 'qua', alts: [['Cㅋ', 'Vㅘ']] }, // QuasaR → 콰사르

  // ── 두 글자 (닿소리 뭉치)
  { key: 'sh', alts: [['Cㅅ']] },
  { key: 'ch', alts: [['Cㅊ'], ['Cㅋ']] },
  { key: 'ph', alts: [['Cㅍ']] },
  { key: 'th', alts: [['Cㅅ'], ['Cㅌ']] }, // method → 메소드 / 메토드
  { key: 'ck', when: 'vowel', alts: [['Kㄱ', 'Cㅋ']] },
  { key: 'ck', alts: [['Kㄱ']] }, // duck → 덕
  { key: 'nk', alts: [['Kㅇ', 'Cㅋ']] }, // pink → 핑크
  { key: 'ng', when: 'vowel', alts: [['Kㅇ', 'Cㄱ'], ['Kㅇ']] },
  { key: 'ng', alts: [['Kㅇ']] },
  { key: 'qu', alts: [['Cㅋ', 'Vㅜ']] },

  // ── 두 글자 (겹홀소리)
  { key: 'oo', alts: [['Vㅜ']] },
  { key: 'ee', alts: [['Vㅣ']] },
  { key: 'ea', alts: [['Vㅣ'], ['Vㅔ', 'Vㅏ']] },
  { key: 'ou', alts: [['Vㅜ'], ['Vㅏ', 'Vㅜ']] },
  { key: 'oi', alts: [['Vㅗ', 'Vㅣ']] }, // point → 포인트
  { key: 'oy', alts: [['Vㅗ', 'Vㅣ']] },
  { key: 'ai', alts: [['Vㅔ', 'Vㅣ'], ['Vㅐ']] }, // aim → 에임 / 앰
  { key: 'ay', alts: [['Vㅔ', 'Vㅣ']] },
  { key: 'ei', alts: [['Vㅔ', 'Vㅣ']] },
  { key: 'ey', alts: [['Vㅣ'], ['Vㅔ', 'Vㅣ']] },
  { key: 'au', alts: [['Vㅗ']] },
  { key: 'aw', alts: [['Vㅗ']] },
  { key: 'ow', alts: [['Vㅗ'], ['Vㅗ', 'Vㅜ']] },
  { key: 'ew', alts: [['Vㅠ'], ['Vㅜ']] },
  { key: 'ue', alts: [['Vㅜ']] },
  { key: 'ui', alts: [['Vㅜ', 'Vㅣ']] },
  { key: 'ia', alts: [['Vㅣ', 'Vㅏ']] },
  { key: 'io', alts: [['Vㅣ', 'Vㅗ']] },
  { key: 'ie', alts: [['Vㅣ'], ['Vㅣ', 'Vㅔ']] },

  /*
   * ── 홀소리 + r
   *   뒤에 홀소리가 없으면 r 이 홀소리에 녹는다 (er → 어, or → 오).
   *   뒤에 홀소리가 **있으면** r 은 다음 음절의 첫소리가 되는데,
   *   앞 홀소리까지 물드는 읽기가 실제로 더 흔하다 —
   *   `desperado` 를 사람들은 «데스페라도» 보다 **«데스퍼라도»** 로 친다.
   *   그래서 둘 다 낸다 (물든 쪽은 비용 1).
   */
  { key: 'ar', when: 'vowel', alts: [['Vㅏ', 'Cㄹ']] },
  { key: 'er', when: 'vowel', alts: [['Vㅔ', 'Cㄹ'], ['Vㅓ', 'Cㄹ']] },
  { key: 'ir', when: 'vowel', alts: [['Vㅣ', 'Cㄹ'], ['Vㅓ', 'Cㄹ']] },
  { key: 'or', when: 'vowel', alts: [['Vㅗ', 'Cㄹ']] },
  { key: 'ur', when: 'vowel', alts: [['Vㅜ', 'Cㄹ'], ['Vㅓ', 'Cㄹ']] },
  /*
   * 낱말이 r 로 끝나면 「르」 를 붙여 읽는 사람이 많다 —
   * `QuasaR` 을 「콰사」 보다 **「콰사르」**, `izmir` 를 **「이즈미르」** 로 친다.
   * 붙이지 않는 쪽(스타·스톰)이 더 흔하므로 그쪽이 먼저다.
   */
  { key: 'ar', when: 'end', alts: [['Vㅏ'], ['Vㅏ', 'Cㄹ']] },
  { key: 'er', when: 'end', alts: [['Vㅓ'], ['Vㅓ', 'Cㄹ']] },
  { key: 'ir', when: 'end', alts: [['Vㅓ'], ['Vㅣ', 'Cㄹ']] },
  { key: 'or', when: 'end', alts: [['Vㅗ'], ['Vㅗ', 'Cㄹ'], ['Vㅓ']] },
  { key: 'ur', when: 'end', alts: [['Vㅓ'], ['Vㅜ', 'Cㄹ']] },
  { key: 'ar', alts: [['Vㅏ']] },
  { key: 'er', alts: [['Vㅓ']] },
  { key: 'ir', alts: [['Vㅓ']] },
  { key: 'or', alts: [['Vㅗ'], ['Vㅓ']] }, // storm → 스톰
  { key: 'ur', alts: [['Vㅓ']] },

  // ── y·w 로 시작하는 겹홀소리
  { key: 'ya', alts: [['Vㅑ']] },
  { key: 'ye', alts: [['Vㅖ']] },
  { key: 'yo', alts: [['Vㅛ']] },
  { key: 'yu', alts: [['Vㅠ']] },
  { key: 'wha', alts: [['Cㅎ', 'Vㅘ']] },
  { key: 'whi', alts: [['Cㅎ', 'Vㅘ', 'Vㅣ']] }, // white → 화이트
  { key: 'whe', alts: [['Cㅎ', 'Vㅞ'], ['Cㅎ', 'Vㅔ']] },
  { key: 'who', alts: [['Cㅎ', 'Vㅜ']] },
  { key: 'wa', alts: [['Vㅘ']] },
  { key: 'wo', alts: [['Vㅝ'], ['Vㅗ']] },
  { key: 'wi', alts: [['Vㅟ']] },
  { key: 'we', alts: [['Vㅞ'], ['Vㅔ']] },
  { key: 'wu', alts: [['Vㅜ']] },

  /*
   * ── 이른바 `magic e` — 「홀소리 + 닿소리 하나 + 낱말 끝 e」
   *   `grave` 를 「그라베」가 아니라 **「그레이브」**, `Raze` 를 **「레이즈」** 로 읽게 한다.
   *   끝자리 모양이 딱 맞을 때만 걸리므로 다른 이름을 망가뜨리지 않는다.
   */
  { key: 'a', when: 'magic', alts: [['Vㅔ', 'Vㅣ'], ['Vㅏ']] },
  { key: 'i', when: 'magic', alts: [['Vㅏ', 'Vㅣ'], ['Vㅣ']] },
  { key: 'u', when: 'magic', alts: [['Vㅠ'], ['Vㅜ']] },

  // ── 홑홀소리
  { key: 'a', alts: [['Vㅏ'], ['Vㅐ'], ['Vㅓ']] },
  /*
   * 낱말 끝의 `e` — 셋 다 실제로 쓰인다.
   *   MiraGe → 미라게 / 미라지(x, 이건 g 쪽) · FlexibIe → 플렉시블레 / **플렉시블**(묵음)
   *   luvme → 루브메 / **러브미**
   * 묵음을 비용 1 로 둔 이유: `Envy` 처럼 `e` 가 발음되는 이름이 더 많다.
   */
  { key: 'e', when: 'end', alts: [['Vㅔ'], [], ['Vㅣ']] },
  { key: 'e', alts: [['Vㅔ'], ['Vㅣ']] },
  { key: 'i', alts: [['Vㅣ']] },
  { key: 'o', alts: [['Vㅗ'], ['Vㅓ']] },
  { key: 'u', alts: [['Vㅜ'], ['Vㅓ']] }, // publicity → 푸블리시티 / 퍼블리시티
  { key: 'y', alts: [['Vㅣ']] },

  // ── 홑닿소리
  { key: 'b', alts: [['Cㅂ']] },
  { key: 'c', when: 'front', alts: [['Cㅅ'], ['Cㅋ']] }, // celestial → 셀…
  { key: 'c', when: 'novowel', alts: [['Kㄱ'], ['Cㅋ']] }, // xenics → 제닉스
  { key: 'c', alts: [['Cㅋ'], ['Cㅅ']] },
  { key: 'd', alts: [['Cㄷ']] },
  { key: 'f', alts: [['Cㅍ']] },
  { key: 'g', when: 'front', alts: [['Cㅈ'], ['Cㄱ']] }, // MiraGe → 미라지
  { key: 'g', alts: [['Cㄱ']] },
  { key: 'h', alts: [['Cㅎ']] },
  { key: 'j', alts: [['Cㅈ']] },
  { key: 'k', when: 'novowel', alts: [['Kㄱ'], ['Cㅋ']] },
  { key: 'k', alts: [['Cㅋ']] },
  /*
   * `l` 은 **받침이면서 첫소리**다 — 한국어가 영어 l 을 그렇게 받는다.
   *   celestial → 셀레…  ·  bloom → 블룸  ·  flexible → 플렉시블
   * 그래서 뒤에 홀소리가 있으면 `Kㄹ`(앞 음절 받침) + `Cㄹ`(다음 음절 첫소리) 둘을 낸다.
   * 다만 **덩어리 첫 글자**일 때는 앞에 붙을 음절이 없으니 첫소리로만 쓴다
   * (`luvme` 를 «르루브메» 로 읽으면 안 된다).
   */
  { key: 'l', when: 'start', alts: [['Cㄹ']] },
  { key: 'l', when: 'vowel', alts: [['Kㄹ', 'Cㄹ']] },
  { key: 'l', alts: [['Kㄹ']] },
  { key: 'm', when: 'novowel', alts: [['Kㅁ'], ['Cㅁ']] },
  { key: 'm', alts: [['Cㅁ']] },
  { key: 'n', when: 'novowel', alts: [['Kㄴ'], ['Cㄴ']] }, // resun → 레순
  { key: 'n', alts: [['Cㄴ']] },
  { key: 'p', alts: [['Cㅍ']] },
  { key: 'q', alts: [['Cㅋ']] },
  { key: 'r', alts: [['Cㄹ']] },
  { key: 's', alts: [['Cㅅ']] },
  { key: 't', when: 'novowel', alts: [['Cㅌ'], ['Kㅅ']] }, // FootMania → 푸트마니아 / 풋마니아
  { key: 't', alts: [['Cㅌ']] },
  { key: 'v', alts: [['Cㅂ']] },
  { key: 'w', alts: [['Vㅜ']] },
  { key: 'x', when: 'start', alts: [['Cㅈ'], ['Cㅅ']] }, // Xenics → 제닉스
  { key: 'x', alts: [['Kㄱ', 'Cㅅ']] }, // ex → 엑스 · flexible → 플렉시…
  { key: 'z', alts: [['Cㅈ']] },
]

/** 긴 열쇠가 먼저 걸리도록 정렬해 둔다 (길이가 같으면 적어 둔 순서 = 조건 있는 것 먼저) */
const SORTED_RULES: readonly RomanRule[] = [...ROMAN_RULES].sort((a, b) => b.key.length - a.key.length)

/**
 * 낱말 표 — **글자 규칙으로는 절대 안 나오는 읽기**만 넣는다.
 *
 * `one` 을 글자대로 읽으면 `오네` 다. 사용자가 치는 건 `원` 이다. 이건 철자가 아니라
 * 영어 단어를 아는 문제라서 규칙으로 못 만든다. 그래서 **아주 짧은 표**를 따로 둔다.
 *
 * ── 표를 함부로 늘리지 마라
 *   낱말 표는 이름 한가운데를 잘못 끊을 수 있다 (`stone` → `st`+`one` → 「스트원」).
 *   그래서 **낱말 경계에서 시작하고 낱말 경계에서 끝날 때만** 쓴다 (아래 `boundaries`).
 *   경계는 특수문자와 **대문자 전환**(camelCase)으로 잡는다 — `exOnePoinT` → ex|One|Poin|T.
 *   `lpcrew` 처럼 전부 소문자로 붙여 쓴 이름은 경계가 없어 표를 못 쓴다. 알고도 남겨 둔다.
 */
const WORD_TABLE: Readonly<Record<string, readonly string[]>> = {
  one: ['원'],
  my: ['마이'],
  oh: ['오'],
  love: ['러브'],
  crew: ['크루'],
  duck: ['덕'],
  white: ['화이트'],
  lie: ['라이'],
  some: ['썸', '섬'],
}

const WORD_TABLE_MAX_KEY = Math.max(...Object.keys(WORD_TABLE).map((k) => k.length))

/*
 * 숫자는 **숫자 그대로** 둔다 (`uava01` → 「우아바01」).
 * 「공일」·「영일」 같은 한자어 읽기는 넣지 않았다 — 표본(50개)에서 숫자로 검색하는 이름이
 * 없었고, 자리마다 가짓수만 두 배로 불린다. 필요해지면 여기 표를 하나 더 두면 된다.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * 4. 로마자 → 음소 조각
 * ──────────────────────────────────────────────────────────────────────────── */

/** 한 자리에서 고를 수 있는 대안들. 앞에 있을수록 흔한 읽기 */
type Slot = readonly (readonly string[])[]

/**
 * 덩어리 안의 **낱말 경계** 위치.
 *   - 0 과 끝
 *   - 소문자 → 대문자 (camelCase)
 *   - 글자 ↔ 숫자
 */
function boundariesOf(raw: string): Set<number> {
  const marks = new Set<number>([0, raw.length])
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1] ?? ''
    const cur = raw[i] ?? ''
    const upperNow = cur >= 'A' && cur <= 'Z'
    const lowerBefore = prev >= 'a' && prev <= 'z'
    if (upperNow && (lowerBefore || isDigit(prev))) marks.add(i)
    if (isDigit(cur) !== isDigit(prev)) marks.add(i)
  }
  return marks
}

/**
 * 조건 판정 — **앞뒤를 보는 기준은 낱말이지 덩어리가 아니다.**
 *
 * `AimEnvy` 의 `m` 뒤에는 `E` 가 있지만 그건 **다음 낱말**의 첫 글자다.
 * 덩어리로만 보면 「에이멘비」가 되고, 사람이 치는 「에임엔비」로는 못 읽는다.
 * 그래서 낱말 경계(`marks`)를 만나면 «뒤에 아무것도 없다» 로 친다.
 */
function ruleApplies(rule: RomanRule, lower: string, i: number, marks: Set<number>): boolean {
  if (!lower.startsWith(rule.key, i)) return false
  const end = i + rule.key.length
  const atWordEnd = marks.has(end)
  const after = atWordEnd ? '' : (lower[end] ?? '')
  switch (rule.when) {
    case undefined:
      return true
    case 'start':
      return marks.has(i)
    case 'end':
      return atWordEnd
    case 'front':
      return FRONT_VOWEL_LETTERS.has(after)
    case 'vowel':
      return VOWEL_LETTERS.has(after)
    case 'novowel':
      return !VOWEL_LETTERS.has(after)
    case 'magic': {
      // 「닿소리 + e」 가 **같은 낱말 안**에 있어야 한다.
      // `MiraGe` 는 Mira|Ge 로 갈리므로 걸리면 안 된다 (걸리면 「미레이지」가 된다)
      if (marks.has(end) || marks.has(end + 1)) return false
      const c1 = lower[end] ?? ''
      const c2 = lower[end + 1] ?? ''
      return isLatin(c1) && !VOWEL_LETTERS.has(c1) && c2 === 'e' && marks.has(end + 2)
    }
  }
}

/** 로마자 덩어리 하나를 «자리(slot)» 들로 쪼갠다 */
function slotsOfRomanRun(run: Run): Slot[] {
  const { raw, lower } = run
  const marks = boundariesOf(raw)
  const slots: Slot[] = []

  let i = 0
  while (i < lower.length) {
    const ch = lower[i] ?? ''

    // (1) 낱말 표 — 경계에서 시작하고 경계에서 끝날 때만
    if (marks.has(i)) {
      let matched = false
      for (let len = Math.min(WORD_TABLE_MAX_KEY, lower.length - i); len >= 2; len--) {
        if (!marks.has(i + len)) continue
        const word = WORD_TABLE[lower.slice(i, i + len)]
        if (!word) continue
        slots.push(word.map((r) => [`T${r}`]))
        i += len
        matched = true
        break
      }
      if (matched) continue
    }

    // (2) 겹친 닿소리는 하나로 본다 (`JJUN` → 준 · `amaryllis` → 아마릴리스)
    if (isLatin(ch) && !VOWEL_LETTERS.has(ch) && lower[i + 1] === ch) {
      i += 1
      continue
    }

    // (3) 숫자 — 그대로 둔다
    if (isDigit(ch)) {
      slots.push([[`T${ch}`]])
      i += 1
      continue
    }

    // (4) 규칙표
    const rule = SORTED_RULES.find((r) => ruleApplies(r, lower, i, marks))
    if (!rule) {
      // 읽는 법을 모르는 글자다. **지어내지 않고 버린다** (그 사실을 여기 남긴다)
      i += 1
      continue
    }
    slots.push(rule.alts)
    i += rule.key.length
  }
  return slots
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. 음소 → 한글 음절
 * ──────────────────────────────────────────────────────────────────────────── */

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNGSEONG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONGSEONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'

/**
 * 붙일 앞 음절이 없어 **받침이 첫소리로 떨어질 때** 바꿔 읽는 표.
 *
 * `methodcrew` 의 `c` 는 받침 ㄱ 으로 나오지만 앞이 `d`(드) 라 붙을 데가 없다.
 * 그대로 두면 「메소드그루」가 된다 — 그 자리 로마자는 c/k/ck 였으니 **「크」** 로 읽는 게 맞다.
 */
const ORPHAN_CODA_ONSET: Readonly<Record<string, string>> = { ㄱ: 'ㅋ' }

function syllable(cho: string, jung: string, jong: string | null): string {
  const ci = CHOSEONG.indexOf(cho)
  const ji = JUNGSEONG.indexOf(jung)
  const ki = jong === null ? 0 : JONGSEONG.indexOf(jong)
  if (ci < 0 || ji < 0 || ki < 0) return ''
  return String.fromCharCode(0xac00 + (ci * 21 + ji) * 28 + ki)
}

/**
 * 음소를 붙여 한글로 만든다.
 *
 * 규칙 세 줄이 전부다.
 *   - 홀소리 없는 닿소리는 **ㅡ** 를 붙인다 (`s` → 스 · `t` → 트 · `k` → 크)
 *   - 받침(`K`)은 바로 앞 음절에 붙인다. 앞이 «홀소리 없는 닿소리» 인데 받침이 **ㄹ** 이면
 *     그 닿소리에 ㅡ 를 넣고 받침을 얹는다 (`bl` → 블 · `fl` → 플)
 *   - 붙일 앞 음절이 아예 없으면 받침을 **첫소리로** 쓴다
 */
function composeSyllables(phonemes: readonly string[]): string {
  let out = ''
  let cho: string | null = null
  let jung: string | null = null
  let jong: string | null = null

  const flush = (): void => {
    if (cho === null && jung === null) return
    if (jung === null) out += syllable(cho ?? 'ㅇ', 'ㅡ', jong)
    else out += syllable(cho ?? 'ㅇ', jung, jong)
    cho = null
    jung = null
    jong = null
  }

  for (const ph of phonemes) {
    const kind = ph[0] ?? ''
    const value = ph.slice(1)
    if (kind === 'T') {
      flush()
      out += value
      continue
    }
    if (kind === 'C') {
      flush()
      cho = value
      continue
    }
    if (kind === 'V') {
      if (jung !== null) flush()
      jung = value
      continue
    }
    // 'K' — 받침
    if (jung !== null && jong === null) {
      jong = value
      flush()
    } else if (cho !== null && jung === null && value === 'ㄹ') {
      jung = 'ㅡ'
      jong = value
      flush()
    } else if (cho === null && jung === null) {
      cho = ORPHAN_CODA_ONSET[value] ?? value
    } else {
      flush()
      cho = ORPHAN_CODA_ONSET[value] ?? value
    }
  }
  flush()
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. 읽기 만들기
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 대안 조합을 **비용이 싼 것부터** 훑는다.
 *
 * 비용 = 각 자리에서 고른 대안의 번호 합. 0이면 «전부 가장 흔한 읽기» 다.
 * 예산을 0,1,2… 로 올려 가며 캐서, 잘려 나가는 쪽이 늘 드문 읽기이도록 한다.
 * 같은 입력이면 늘 같은 순서다 (**결정적**).
 */
function enumerateReadings(slots: readonly Slot[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const picked: string[] = []

  const walk = (index: number, budget: number): void => {
    if (out.length >= limit) return
    if (index === slots.length) {
      if (budget !== 0) return // 예산을 정확히 다 써야 한 번만 나온다
      const text = composeSyllables(picked)
      if (text && !seen.has(text)) {
        seen.add(text)
        out.push(text)
      }
      return
    }
    const alts = slots[index] ?? []
    for (let a = 0; a < alts.length && a <= budget; a++) {
      const alt = alts[a] ?? []
      const before = picked.length
      picked.push(...alt)
      walk(index + 1, budget - a)
      picked.length = before
      if (out.length >= limit) return
    }
  }

  for (let budget = 0; budget <= MAX_ALT_COST && out.length < limit; budget++) {
    walk(0, budget)
  }
  return out
}

const readingCache = new Map<string, string[]>()

/**
 * 클랜명의 **한글 읽기들**. 흔한 읽기가 앞이다.
 *
 * ```ts
 * hangulReadingsOf('veritas')     // ['베리타스', …]
 * hangulReadingsOf('exOnePoinT')  // ['엑스원포인트', …]
 * hangulReadingsOf('베이직')       // ['베이직']
 * ```
 *
 * **부르는 쪽에서 캐시해도 된다** — 같은 이름은 늘 같은 배열을 낸다.
 * (여기서도 한 번 캐시하지만, 목록을 반복해 그리는 화면은 자기 쪽에서 들고 있는 게 낫다.)
 */
export function hangulReadingsOf(name: string): string[] {
  const cached = readingCache.get(name)
  if (cached) return cached

  const out: string[] = []
  const seen = new Set<string>()
  for (const spelling of spellingVariants(name)) {
    const runs = splitRuns(spelling)
    if (runs.length === 0) continue
    const slots: Slot[] = []
    for (const run of runs) {
      if (run.kind === 'hangul') slots.push([[`T${run.raw}`]])
      else slots.push(...slotsOfRomanRun(run))
    }
    for (const reading of enumerateReadings(slots, MAX_READINGS - out.length)) {
      if (seen.has(reading)) continue
      seen.add(reading)
      out.push(reading)
      if (out.length >= MAX_READINGS) break
    }
    if (out.length >= MAX_READINGS) break
  }

  if (readingCache.size >= READING_CACHE_LIMIT) readingCache.clear()
  readingCache.set(name, out)
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7. 초성
 * ──────────────────────────────────────────────────────────────────────────── */

/** 한글 음절의 초성만 뽑는다. 음절이 아닌 글자는 그대로 둔다 (`베이직` → `ㅂㅇㅈ`) */
export function chosungOf(text: string): string {
  let out = ''
  for (const ch of text) {
    if (isHangulSyllable(ch)) {
      const index = Math.floor(((ch.codePointAt(0) ?? 0) - 0xac00) / 588)
      out += CHOSEONG[index] ?? ''
    } else {
      out += ch
    }
  }
  return out
}

/** 검색어가 **초성만**으로 이뤄졌는가 (`ㅂㅇㅈ`). 한 글자짜리도 초성으로 본다 */
function isChosungQuery(query: string): boolean {
  if (query.length === 0) return false
  for (const ch of query) if (!isChosungJamo(ch)) return false
  return true
}

/* ────────────────────────────────────────────────────────────────────────────
 * 8. 대조와 정렬
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 등급 — 작을수록 «잘 맞는» 것이다. 정렬 순서가 곧 이 값의 순서다.
 *
 * ```
 * 0 이름이 검색어와 똑같다
 * 1 이름이 검색어로 시작한다
 * 2 이름 안에 검색어가 있다
 * 3 한글 읽기가 검색어로 시작한다
 * 4 한글 읽기 안에 검색어가 있다
 * 5 초성만 맞는다
 * ```
 */
const RANK = {
  EXACT: 0,
  NAME_PREFIX: 1,
  NAME_PART: 2,
  READING_PREFIX: 3,
  READING_PART: 4,
  CHOSUNG: 5,
  NONE: 99,
} as const

const literalCache = new Map<string, string[]>()

/**
 * 특수문자를 걷어 낸 «민짜 이름» 들. 읽기와 마찬가지로 **한 번 만들면 안 바뀐다**.
 *
 * 목록 검색은 이름 하나마다 이걸 세 번(똑같다·시작한다·들어 있다) 훑으므로
 * 캐시가 없으면 클랜 105개 검색이 1ms 를 넘긴다 (실측 1.76ms → 캐시 후 0.1ms대).
 */
function literalsOf(name: string): string[] {
  const cached = literalCache.get(name)
  if (cached) return cached
  const out = spellingVariants(name).map((s) => flatten(splitRuns(s)))
  if (literalCache.size >= READING_CACHE_LIMIT) literalCache.clear()
  literalCache.set(name, out)
  return out
}

/**
 * 읽기 여러 개를 **한 줄로 이어 붙인 것**. 읽기 48개를 하나하나 훑는 대신 한 번에 본다.
 *
 * 가름막은 줄바꿈이다 — `normalizeClanQuery` 가 검색어에서 줄바꿈을 지우므로
 * 검색어에 섞여 들어올 수 없다. 그래서 「가름막 + 검색어」 가 있으면 **어떤 읽기의 맨 앞**이다.
 */
const READING_SEPARATOR = '\n'
const haystackCache = new Map<string, string>()

function readingHaystackOf(name: string): string {
  const cached = haystackCache.get(name)
  if (cached !== undefined) return cached
  const hay = READING_SEPARATOR + hangulReadingsOf(name).join(READING_SEPARATOR)
  if (haystackCache.size >= READING_CACHE_LIMIT) haystackCache.clear()
  haystackCache.set(name, hay)
  return hay
}

/** 검색어에 한글이 섞여 있는가. 없으면 **한글 읽기를 볼 필요가 없다** (읽기는 전부 한글이다) */
function hasHangul(text: string): boolean {
  for (const ch of text) if (isHangul(ch)) return true
  return false
}

function rankOf(name: string, normalizedQuery: string): number {
  const q = normalizedQuery
  if (q.length === 0) return RANK.EXACT

  const literals = literalsOf(name)
  for (const lit of literals) {
    if (lit === q) return RANK.EXACT
  }
  for (const lit of literals) {
    if (lit.startsWith(q)) return RANK.NAME_PREFIX
  }
  for (const lit of literals) {
    if (lit.includes(q)) return RANK.NAME_PART
  }

  // 초성 검색어는 «읽기 안에 들어 있는가» 로 볼 수 없다. 따로 본다
  if (isChosungQuery(q)) {
    for (const lit of literals) {
      if (chosungOf(lit).includes(q)) return RANK.CHOSUNG
    }
    for (const reading of hangulReadingsOf(name)) {
      if (chosungOf(reading).includes(q)) return RANK.CHOSUNG
    }
    return RANK.NONE
  }

  // 검색어에 한글이 하나도 없으면 한글 읽기와는 절대 안 맞는다. 훑지 않는다
  if (!hasHangul(q)) return RANK.NONE

  const hay = readingHaystackOf(name)
  if (hay.includes(READING_SEPARATOR + q)) return RANK.READING_PREFIX
  if (hay.includes(q)) return RANK.READING_PART
  return RANK.NONE
}

/**
 * 검색어 하나가 클랜명 하나에 걸리는가.
 *
 * 빈 검색어는 **전부 통과**다 (거르지 않는다).
 */
export function clanNameMatches(name: string, query: string): boolean {
  return rankOf(name, normalizeClanQuery(query)) !== RANK.NONE
}

/**
 * 목록에서 걸리는 것만, **좋은 순서로** 돌려준다.
 *
 * 같은 등급이면 **이름이 짧은 것 먼저**, 그다음은 이름 순, 마지막은 원래 자리 순 —
 * 같은 입력이면 언제나 같은 순서가 나온다.
 *
 * 빈 검색어면 원래 목록을 그대로(순서까지) 돌려준다.
 */
export function searchClanNames<T>(items: T[], query: string, nameOf: (item: T) => string): T[] {
  const q = normalizeClanQuery(query)
  if (q.length === 0) return [...items]

  const scored: { item: T; rank: number; name: string; index: number }[] = []
  items.forEach((item, index) => {
    const name = nameOf(item)
    const rank = rankOf(name, q)
    if (rank !== RANK.NONE) scored.push({ item, rank, name, index })
  })

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.name.length !== b.name.length) return a.name.length - b.name.length
    if (a.name !== b.name) return a.name < b.name ? -1 : 1
    return a.index - b.index
  })

  return scored.map((s) => s.item)
}
