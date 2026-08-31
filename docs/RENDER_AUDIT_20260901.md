# RENDER_AUDIT_20260901.md — 렌더 검수 (D팀)

> `docs/UI_PARITY_AUDIT.md` **14-7** 이 남긴 숙제를 실행한 기록이다.
> 그 문서의 `C` 37건은 **전부 코드 근거**였고 화면에서 확인된 것이 아니었다.
> 판정 기준은 `CLAUDE.md` **3장 8번**의 여섯 항목이다.
>
> **이 문서는 결함 목록이다. D팀은 고치지 않는다** — 명백한 한 줄짜리만 예외이고 그것도 아래에 적는다.
> 우선순위는 서플라이 메인 세션이 정한다.

- 수행: **D팀 에이전트** (`lg-c8`) · 2026-09-01 02:10 ~
- 대상: `http://127.0.0.1:3000` (메인 세션이 띄워 둔 dev 서버 · `live` 모드). **새로 띄우지 않았다**
- `localhost` 가 아니라 `127.0.0.1` 로 붙었다 (D-187 의 `::1` EFAULT 회피)

---

## 0. 먼저 — **어떻게 찍었는가**

원 감사(`UI_PARITY_AUDIT` 7장)가 경기 상세 펼침을 **5회 시도해 실패**했고, 이번에도 같은 벽을 만났다.
원인은 사양이 아니라 **도구 권한**이었다.

```
Claude 브라우저 확장 → navigate  http://127.0.0.1:3000/...   OK
                    → screenshot                            Permission denied for this action on this domain
```

확장에 `127.0.0.1` 사이트 권한이 없다. 권한을 주는 것은 **사용자만 할 수 있는 일**이고
그 시각 사용자는 자고 있었다. 그래서 **확장을 쓰지 않기로 했다.**

→ `scripts/render-audit/shoot.mjs` — 헤드리스 Chrome 을 **CDP 로 직접** 몬다.
의존성 0(Node 24 내장 `WebSocket`)이고, 이미 떠 있는 dev 서버에 **붙기만** 한다.

한 번 방문에서 두 가지를 같이 낸다.

| 낸 것 | 무엇에 쓰나 |
|---|---|
| 전체 페이지 PNG (뷰포트가 아니라 `scrollHeight` 전체) | **눈으로 보는 판정** — 묻히는가 · 읽히는가 · 위계가 살아 있는가 |
| DOM 검사 JSON | 기계가 셀 수 있는 것 — 가로 스크롤 · 대비 3 미만 글자 · 진홍이 칠해진 면적 · 비-모노 숫자 · 상태 표기 개수 · 링크 |

**수치만으로 완료 판정하지 않는다** (`CLAUDE.md` 3장 10번 · D-014).
수치는 어디를 볼지 알려 줄 뿐이고, 판정은 그림을 보고 한다.

### 이 하네스를 쓸 사람에게

```bash
# Git Bash 에서는 MSYS 경로 변환이 `/league/...` 를 `C:/Program Files/league/...` 로 바꾼다.
# 반드시 MSYS_NO_PATHCONV=1 을 붙인다.
MSYS_NO_PATHCONV=1 CDP_PORT=9341 node scripts/render-audit/shoot.mjs \
  --out <출력폴더> --width 1440 --file <목록.txt>
```

- **먼저 라우트를 데운다.** dev 서버는 **라우트 첫 컴파일에 2~5분**이 걸리고,
  그동안 CDP `Page.navigate` 가 통째로 막힌다(실측: `/notfound` 180초 초과).
  `curl` 로 한 번씩 때려 컴파일을 끝낸 뒤 찍어야 한다
- 병렬로 돌릴 때는 `CDP_PORT` 를 서로 다르게 준다

---

## 1. 실측 — 화면별

<!-- 촬영 후 채운다 -->

---

## 2. 결함 목록

### D-1. **`a { color: inherit }` 함정이 아직 살아 있다 — 20곳** 〔확정〕

D-204 가 경고한 바로 그 함정이다. **경고만 있고 정리는 안 됐다.**

#### 왜 눌리는가 — 추측이 아니라 **빌드된 번들에서 잰 것이다**

`apps/web/.next/static/css/*.css` 를 열어 중괄호 깊이를 셌다.

```
   8227  @layer utilities{
  27407  .text-accent …            중괄호 깊이 1  → @layer utilities 안
  39967  a{color:inherit;…}        중괄호 깊이 0  → **레이어 밖**
```

`apps/web/app/globals.css` 가 `@import 'tailwindcss'` **다음에** `packages/ui/src/styles.css`
를 레이어 지정 없이 가져온다. CSS 캐스케이드에서 **레이어 밖 선언은 모든 `@layer` 를 이긴다** —
특정도와 무관하다. 그래서 `<a>` 에 직접 준 `text-*` 색 유틸리티는 **한 개도 적용되지 않는다.**

같은 이유로 `a:hover{color:var(--color-accent)}` 도 레이어 밖이라
`<a>` 의 `hover:text-*` 역시 전부 눌린다 — **가리키면 무조건 진홍**이 된다.

> `bg-*` · `border-*` 는 영향이 없다. **`color` 만** 눌린다.

#### 어디가 눌리는가 (전수 20곳 · `node scripts/render-audit/…` 아님, 일회성 스캔)

**의도한 구분이 사라지는 곳 — 이것이 결함이다**

| 파일:줄 | 무엇이 죽었나 | 결과 |
|---|---|---|
| `packages/ui/src/league/LeagueSubNav.tsx:24` (`ITEM_ACTIVE`) · `:23` (`ITEM`) | 활성 `text-text-strong` · 비활성 `text-meta` **둘 다** | 리그홈/클랜랭킹/개인랭킹 탭의 **글자색이 전부 같다.** 구분은 진홍 밑줄 2px + `font-bold` 만 남는다 |
| `LeagueSubNav.tsx:110` (모바일 탭) | `text-meta` | 위와 같음 |
| `LeagueSubNav.tsx:72` (리그명) | `text-text-strong` | 제목이 `#f6eded` 가 아니라 본문색 `#d6c9c9` 로 나온다 |
| `apps/web/app/admin/AdminShell.tsx:42` | 활성 `text-text-strong` · 비활성 `text-meta hover:text-text` | 관리자 탭 구분이 밑줄+굵기만 |
| `apps/web/app/clause/layout.tsx:30` | 위와 같음 | 약관 탭 |
| `apps/web/app/me/layout.tsx:36` | 위와 같음 | 마이페이지 탭 |
| `packages/ui/src/layout/SiteHeader.tsx:121 · 186` | `text-meta` | GNB 항목이 본문색으로 뜬다 |

**눌려도 결과가 같아 문제 없는 곳** (기록만)

`SiteFooter.tsx:24 · 37`(`hover:text-accent` → 기본 규칙과 동일) ·
`FormTop3.tsx:62` · `LeagueListTable.tsx:55` · `RankTable.tsx:214 · 307`(`hover:text-text-strong`
→ 진홍으로 바뀔 뿐 읽힌다) · `LeagueHome.tsx:140`(`text-text` → 어차피 본문색) ·
`signup/page.tsx:113 · 121` · `me/link/page.tsx:44` · `me/page.tsx:35`

#### 고치는 법

D-204 가 이미 답을 적어 뒀고 `ClanRoster.tsx:122` 가 그대로 하고 있다 — **안쪽 `<span>` 으로 옮긴다.**

```tsx
<Link href={…} className="…">
  <span className="text-text-strong">{…}</span>
</Link>
```

**D팀은 고치지 않았다.** 20곳이고 활성 탭 표시 방식에 대한 판단이 들어가므로 한 줄짜리가 아니다.

---

### D-2. **`/leagues` 의 `리그만들기` 가 진홍으로 꽉 찬 버튼이다** 〔확정〕

`apps/web/app/leagues/page.tsx:50`

```tsx
className="mt-10 inline-flex h-12 items-center rounded-[var(--radius)]
           bg-accent px-8 font-semibold tracking-wide text-text-strong"
```

`CLAUDE.md` 3장 2번과 D-204 규칙 3 을 정면으로 어긴다.

> **진홍(`--color-accent`)은 아껴 쓴다** — 가는 선 · 1위 · 활성 표시 · 링크 · 중요한 숫자 하나.
> 버튼 배경은 채우지 말고 **1px 테두리**로 만든다.

`.btn-line` 헬퍼가 바로 이걸 위해 있는데 여기만 안 쓴다. 넓이도 `h-12 px-8` 로 작지 않다.

**게다가 D-1 이 겹친다.** `text-text-strong` 이 눌려 글자가 `#d6c9c9` 로 나온다.

```
의도 (#f6eded on #d92b2b)   대비 4.21 : 1
실제 (#d6c9c9 on #d92b2b)   대비 3.02 : 1     ← 함정 때문에 한 단 낮아졌다
```

`/leagues` 는 14-7 의 검수 대상 9화면 중 하나(**리그 목록**)다.

> **고치지 않았다.** `.btn-line` 으로 바꾸면 이 화면의 유일한 강조가 사라지는데,
> 그 자리를 무엇으로 대신할지는 화면 위계 판단이라 감독관 몫이다.

---

### D-3~ 〔촬영 후 채운다〕

---

## 3. 확인했지만 결함이 아니었던 것

### 3-1. `/league/{slug}/home` → `/home/info` 리다이렉트는 **의도된 것이다**

`UI_PARITY_AUDIT` 2-9 는 서브내비 링크를 `${base}/home/info` → `${base}/home` 으로 고쳤다.
실제로 그 주소를 열면 **서버가 다시 `/home/info` 로 보낸다.**

처음에는 2-9 의 해소가 반쪽인 줄 알았으나, **아니다.**
`apps/web/app/league/[leagueSlug]/home/page.tsx` 가 그 리다이렉트를 하는 유일한 목적이고
주석에 이유까지 적혀 있다 — 원본 서브내비의 `리그홈` 링크가 가리키는 곳이 `/home` 이고
실제 화면은 `리그정보`(`/home/info`)다. **링크 주소는 원본과 같아졌고 화면은 그대로다.**
2-9 는 제대로 해소됐다.

---

## 4. 이 검수가 **하지 못한 것**

<!-- 촬영 후 채운다 -->
