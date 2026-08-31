# TITLE_VERIFICATION_SPEC — 칭호 인증 (알을 깨는 정식 경로)

- 작성: 2026-09-01 · A팀 에이전트
- 상위 사양: `docs/EGG_SYSTEM_SPEC.md` **4장** (사용자 채택: *"2번존나 좋다"*)
- 관련 결정: **D-220**(닉은 식별자가 아니다) · **D-221**(위장닉은 Open API 에 없다) · **D-222**(알의 깨짐은 표에 남긴다)
- 이 문서로 제안하는 결정: **D-228**

> **왜 지금 이것인가** — 지금 알을 깰 수 있는 건 `reason='admin'` 관리자 강제뿐이다.
> 그건 사양이 *"시험용이다. 진짜 근거가 아니다"* 라고 못박아 둔 값이다
> (`schema.prisma` `EggBreak.reason` 주석). 정식 경로가 없으면 알 시스템은 반쪽이다.

---

## 0. 요약 — 무엇을 만들고 무엇이 이미 있나

```
① 가입/연동 신청 → 우리가 칭호 하나를 지정한다   "칭호를 『상등병』 으로 바꿔 주세요"
② 사용자가 인게임에서 칭호를 바꾼다              무료 · 즉시 · 되돌릴 수 있다
③ 우리가 user/basic 을 폴링해 확인               GET /suddenattack/v1/user/basic → title_name
④ 맞으면 자동 인증 완료 → EggBreak(reason='verified')
⑤ 인증 뒤에는 칭호를 원래대로 돌려도 된다
```

**놀랍게도 기계가 거의 다 있다.** 실측(2026-09-01):

| 필요한 것 | 상태 | 위치 |
|---|---|---|
| `user/basic` 호출기 | **있다** | `packages/nexon/src/client.ts:263` `getUserBasic(ouid)` |
| `title_name` 파싱 | **있다** | `packages/nexon/src/schemas.ts:54` — 스키마에 이미 들어 있다 |
| 폴링 기계 | **있다** | `apps/worker/src/jobs/identityWatch.ts` + `lib/identityWatch.ts` + CLI `identity-watch` |
| `reason='verified'` 자리 | **있다** | `schema.prisma` `EggBreak.reason` 주석에 *"verified 본인 인증으로 (사양 4장)"* 이 이미 적혀 있다 |
| 판정 로직 | **만들었다** | `apps/worker/src/lib/titleChallenge.ts` (순수함수) + 테스트 32건 |
| 도전 상태 표 | **없다** | ← `TitleChallenge` (3장) |
| 칭호 관측 | **없다** | ← `title_name` 을 받아 놓고 **버리고 있다** (2장) |
| API + 화면 | **없다** | ← 5장 · 6장 |

---

## 1. ⚠ 이 설계의 핵심 — **「지금 그 칭호다」로는 인증하지 않는다**

사양 4장은 지정 칭호가 **누구나 가진 흔한 칭호**여야 한다고 적어 두었다.
사용자가 **보유한 칭호 중에서만** 바꿀 수 있기 때문이다. 맞는 제약이다.

그런데 **흔하다는 것은 아무 관계 없는 사람도 이미 그 칭호를 달고 있다는 뜻**이다.

그래서 "지금 칭호가 『상등병』 인가" 만 보는 순진한 구현은 이렇게 뚫린다:

```
공격자가 남의 ouid 로 도전을 연다
지정 칭호가 『상등병』 으로 나온다
가만히 앉아 기다린다
피해자가 아무것도 모른 채 언젠가 『상등병』 을 단다   ← 흔한 칭호니까
인증 통과. 남의 계정이 공격자에게 연결된다
```

**판정을 「상태」가 아니라 「사건」으로 바꿔서 막는다.**

```
발급 시각에 그 계정의 현재 칭호를 기록한다      baselineTitle
현재 칭호와 다른 것을 지정한다                   expectedTitle ≠ baselineTitle
발급 이후에 → expectedTitle 로 바뀐 것을 관측해야 통과한다
```

세 가지가 따라온다.

1. **발급 시점에 이미 그 칭호면 발급 자체를 거부한다** — `issueChallenge` 가
   `pool-exhausted` 를 돌려준다. 아무것도 안 하고 통과하는 길이 없다
2. **발급 이전 시각의 관측으로는 통과하지 않는다** — 폴링이 캐시된 옛 응답을 늦게
   들고 와도, 발급 직전에 찍힌 관측이 뒤늦게 처리돼도 통과하지 않는다
3. **`ouid` 당 열린 도전은 하나뿐이다** — 여러 사람이 같은 계정에 동시에 도전을 걸어
   두고 하나가 우연히 맞기를 기다리는 것을 막는다 (부분 유니크 인덱스, 3장)

세 가지 모두 `apps/worker/src/__tests__/titleChallenge.test.ts` 의
**「아무것도 안 한 계정이 통과하는 길이 없다」** 묶음이 지킨다.

> **지정 칭호를 비밀로 둘 필요는 없다.** 공격자가 미리 알아도, 통과하려면 **그 계정에
> 실제로 로그인해서** 칭호를 바꿔야 한다. 그것이 이 인증이 증명하려는 바로 그 사실이다.
> 그래서 `pickTitle` 은 암호학적 난수를 쓰지 않고 **결정적**으로 고른다.

---

## 2. 칭호 풀 — `[미확인]` 을 **추가 호출 0건**으로 푼다

사양 4장의 `[미확인]`: *"지정할 칭호 풀. 누구나 갖고 있는 흔한 칭호여야 한다. 어떤 칭호가 그런지 조사해야 한다."*

### 2-1. 지금 우리는 칭호 데이터가 **하나도 없다**

실측: `title_name` 은 `packages/nexon/src/schemas.ts:54` 에서 **파싱은 되지만
어디에도 저장되지 않는다.** 저장소 전체에서 `titleName` 을 쓰는 곳이 없다.
`identityWatch` 가 `user/basic` 을 부르면서 `user_name` 과 `clan_name` 만 꺼내 쓰고
**칭호는 그냥 버린다.**

### 2-2. 그래서 조사는 새 호출이 필요 없다

`identity-watch` 가 이미 **매 폴링마다 칭호를 받아 오고 있다.** 같은 응답 안에 있다.
꺼내서 저장하기만 하면 **칭호 풀이 스스로 쌓인다. 넥슨 API 추가 호출은 0건이다.**

```sql
-- 관측이 쌓이면 이 질의 하나가 「흔한 칭호」 목록이다
SELECT "titleName", COUNT(DISTINCT "ouid") AS holders
FROM "NexonIdentityObservation"
WHERE "titleName" IS NOT NULL
GROUP BY "titleName"
ORDER BY holders DESC
LIMIT 50;
```

### 2-3. 풀에 넣는 기준

| 기준 | 값 | 왜 |
|---|---|---|
| 최소 보유자 수 | **서로 다른 `ouid` 200명 이상** | 흔해야 사용자가 보유하고 있다 |
| 최대 보유 비율 | **전체의 60% 미만** | 너무 흔하면 `baselineTitle` 과 겹쳐 발급이 자주 거부된다 |
| 풀 크기 | **8~16개** | 너무 적으면 발급 거부가 잦고, 너무 많으면 안내가 산만하다 |
| 제외 | 이벤트·기간한정·업적 칭호 | 지금은 흔해도 신규 사용자는 못 얻는다 |

> ⚠ 이 숫자들은 **관측이 쌓이기 전의 제안값**이다. 실제 분포를 보고 조정한다.
> **관측 없이 풀을 지어내지 않는다** (CLAUDE.md 3장 7번).

### 2-4. 풀이 빌 때까지 — 인증은 **닫아 둔다**

관측이 쌓이기 전에는 풀이 비어 있고, `issueChallenge` 가 `no-pool` 을 돌려준다.
화면은 *「본인 인증은 준비 중입니다」* 로 막는다. **임시 칭호를 지어내서 열지 않는다.**

---

## 3. 표 — `TitleChallenge`

```prisma
/// 칭호 인증 도전 (`docs/TITLE_VERIFICATION_SPEC.md` · 사양 4장).
///
/// ── 기준은 `ouid` 다 (D-220)
///   닉네임으로 잇지 않는다. 닉은 식별자가 아니고 옛 닉은 남이 물려받는다.
///
/// ── 「지금 그 칭호다」가 아니라 「발급 후에 그 칭호로 바뀌었다」로 판정한다
///   그래서 `baselineTitle`(발급 시점의 칭호)을 반드시 함께 남긴다. 1장 참조.
model TitleChallenge {
  id String @id @default(cuid())

  /// 도전을 연 사람
  userId String
  /// 인증하려는 계정. **판정의 유일한 기준이다**
  ouid   String

  /// 우리가 지정한 칭호
  expectedTitle String
  /// 발급 시점에 그 계정이 달고 있던 칭호. 미착용이면 null
  baselineTitle String?

  /// "pending" | "verified" | "expired" | "exhausted" | "cancelled"
  /// **읽을 때 시각으로 다시 계산한다** — 만료는 아무도 표를 고쳐 주지 않는다
  status String @default("pending")

  issuedAt  DateTime @default(now())
  expiresAt DateTime

  /// 확인 시도 횟수 (사람이 누른 것 + 폴링). 넥슨 API 를 무한히 두드리지 않는다
  attempts      Int       @default(0)
  lastCheckedAt DateTime?
  /// 마지막으로 관측한 칭호 — 화면이 "지금 『신병』 이네요" 라고 알려 줄 수 있다
  lastSeenTitle String?

  verifiedAt DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([status, expiresAt])
  @@index([userId])
  @@index([ouid])
}
```

`User` 모델에 관계 한 줄이 붙는다: `titleChallenges TitleChallenge[]`

### 3-1. 부분 유니크 인덱스 — **`ouid` 당 열린 도전은 하나**

Prisma 스키마로는 표현할 수 없다(부분 인덱스 미지원). **SQL 로 직접 만든다.**

```sql
CREATE UNIQUE INDEX "TitleChallenge_open_ouid_key"
  ON "TitleChallenge" ("ouid")
  WHERE "status" = 'pending';
```

> 이게 없으면 여러 사람이 같은 계정에 도전을 동시에 걸어 두고 **하나가 우연히 맞기를
> 기다릴 수 있다.** 애플리케이션 검사만으로는 동시 요청에서 샌다.

### 3-2. `NexonIdentityObservation` 에 칭호 두 칸

```prisma
  /// 관측 당시 칭호 (`user/basic.title_name`). 미착용이면 null
  titleName     String?
  /// 직전 관측의 칭호
  prevTitleName String?
```

`changed` 의 값에 `'title'` 이 늘어난다. 조합이 늘어나므로 판정은
`lib/identityWatch.ts` 의 `diffIdentity` 를 **칭호까지 보도록 확장**한다.

> ⚠ **이 두 칸이 2장의 칭호 풀 조사를 무료로 만든다.** 같은 응답에 이미 들어 있는 값이다.

---

## 4. 마이그레이션 SQL

> ⛔ `packages/db/prisma/migrations/**` 는 서플라이 메인 세션(`claude-ce`) 점유다.
> **A팀은 이 SQL 을 만들기만 하고 적용하지 않는다.** 문안을 넘긴다.

```sql
-- 1) 칭호 인증 도전
CREATE TABLE "TitleChallenge" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "ouid"          TEXT NOT NULL,
    "expectedTitle" TEXT NOT NULL,
    "baselineTitle" TEXT,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "issuedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"     TIMESTAMP(3) NOT NULL,
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSeenTitle" TEXT,
    "verifiedAt"    TIMESTAMP(3),
    CONSTRAINT "TitleChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TitleChallenge_status_expiresAt_idx" ON "TitleChallenge" ("status", "expiresAt");
CREATE INDEX "TitleChallenge_userId_idx"           ON "TitleChallenge" ("userId");
CREATE INDEX "TitleChallenge_ouid_idx"             ON "TitleChallenge" ("ouid");

ALTER TABLE "TitleChallenge"
  ADD CONSTRAINT "TitleChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ⚠ 핵심 — ouid 당 열린 도전은 하나뿐. 애플리케이션 검사만으로는 동시 요청에서 샌다
CREATE UNIQUE INDEX "TitleChallenge_open_ouid_key"
  ON "TitleChallenge" ("ouid") WHERE "status" = 'pending';

-- 2) 칭호 관측 — 이미 받아 놓고 버리던 값을 남긴다 (추가 API 호출 0건)
ALTER TABLE "NexonIdentityObservation" ADD COLUMN "titleName"     TEXT;
ALTER TABLE "NexonIdentityObservation" ADD COLUMN "prevTitleName" TEXT;
```

**되돌리기**: `DROP TABLE "TitleChallenge";` +
`ALTER TABLE "NexonIdentityObservation" DROP COLUMN "titleName", DROP COLUMN "prevTitleName";`
기존 데이터를 건드리지 않는 **순수 추가**라 되돌려도 잃는 것이 없다.

---

## 5. API

전부 로그인 필요. `requireUser` 를 쓴다.

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| `POST` | `/api/me/title-challenge` | 도전 발급. 몸체 `{ ouid }` |
| `GET` | `/api/me/title-challenge` | 지금 내 도전 상태 |
| `POST` | `/api/me/title-challenge/check` | 「확인」 — 즉시 1회 조회 |
| `DELETE` | `/api/me/title-challenge` | 접기 (`cancelled`) |

### 5-1. 발급 `POST`

```
① 로그인 확인
② 그 ouid 가 이미 다른 사용자에게 인증돼 있으면 409         ← 계정 하나에 주인 하나
③ 열린 도전이 있으면 그것을 그대로 돌려준다 (새로 안 만든다)
④ user/basic 을 1회 호출해 현재 칭호를 읽는다               ← baselineTitle
⑤ issueChallenge(...) — 현재 칭호를 뺀 후보에서 고른다
⑥ 저장. 부분 유니크 인덱스 위반이면 ③으로 되돌아간다 (경합)
```

**넥슨 호출은 여기서 1회.** 그 외 발급 경로에서 호출하지 않는다.

### 5-2. 확인 `POST /check`

```
① canManualCheck(lastCheckedAt, now) — 10초 안에 다시 누르면 429
② isOpen(...) 아니면 그 상태를 그대로 돌려준다
③ user/basic 1회 호출 → verifyObservation(...)
④ attempts += 1, lastCheckedAt/lastSeenTitle 갱신
⑤ 'verified' 면 6장의 인증 완료 처리
```

### 5-3. 응답 (`packages/contract` 에 Zod 스키마로)

```ts
{
  status: 'none' | 'pending' | 'verified' | 'expired' | 'exhausted' | 'cancelled'
  expected_title: string | null      // 지정 칭호. 비밀이 아니다
  last_seen_title: string | null     // 마지막으로 본 칭호. "지금 『신병』 이네요"
  expires_at: string | null
  attempts_left: number | null
  outcome: 'waiting' | 'wrong-title' | null   // 직전 확인의 결과
}
```

**`baselineTitle` 은 응답에 넣지 않는다.** 화면이 쓸 일이 없고, 판정의 근거를 밖으로
내보낼 이유가 없다.

---

## 6. 인증 성공 처리 — `EggBreak` 연결

```
① TitleChallenge.status = 'verified', verifiedAt = now
② NexonIdentity 를 잇는다 — status='linked', linkedAt, linkReason='title-challenge'
③ UserPlayerLink 를 만든다 (그 ouid 에 연결된 Player 가 있으면)
④ EggBreak upsert — targetKind='player', targetId=<Player.id>, reason='verified'
```

### 6-1. ⛔ `reason='admin'` 을 덮지 않는다

`EggBreak` 는 `@@unique([targetKind, targetId])` 라 대상당 한 줄이다.
그래서 순진하게 `upsert` 하면 **관리자가 시험 삼아 깬 기록이 `verified` 로 바뀐다.**

```ts
/* 이미 깨져 있으면 그대로 둔다. 알은 이미 깨졌고, 다시 깰 것이 없다.
   특히 reason='admin' 을 'verified' 로 덮으면 **관리자가 시험한 흔적이 사라진다.** */
const existing = await prisma.eggBreak.findUnique({
  where: { targetKind_targetId: { targetKind: 'player', targetId: playerId } },
})
if (!existing) {
  await prisma.eggBreak.create({
    data: { targetKind: 'player', targetId: playerId, reason: 'verified', brokenByUserId: userId },
  })
}
```

> **왜 덮지 않는가** — D-222 가 *"관리자가 강제로 깬 것과 사람이 인증해서 깬 것은 뜻이
> 다르다. 둘을 구분해 남긴다"* 고 정했다. 덮으면 그 구분이 사라진다.
> 관리자가 되돌리려고 지웠을 때 **무엇을 되돌리는지**도 알 수 없게 된다.

### 6-2. 클랜 알은 여기서 건드리지 않는다

클랜 알은 **클랜원 30%** 또는 **클랜마스터 인증**으로 깨진다(사양 3장).
개인 인증이 하나 성공했다고 클랜 알에 손대지 않는다. 30% 계산은 별도 잡의 몫이다.

---

## 7. 화면

### 7-1. 어디에

마이페이지의 계정 연동 자리. 지금 `PlayerLinkClaim`(운영자 수동 승인, D-121)이 있는 곳이다.
**칭호 인증이 성공하면 수동 승인 신청이 필요 없다** — 자동으로 이어진다.

### 7-2. 무엇을 (`적진` 토큰)

```
본인 인증

  인게임에서 칭호를 『상등병』 으로 바꿔 주세요.
  바꾸면 자동으로 확인됩니다. 확인된 뒤에는 원래 칭호로 되돌려도 됩니다.

  지금 칭호   신병
  남은 시간   28분

  [ 확인 ]                        ← .btn-line. 10초에 한 번
```

- 진홍(`--color-accent`)은 **지정 칭호 한 곳**에만 쓴다 (D-204: 가장 중요한 숫자 하나)
- 숫자는 `--font-num`
- 상태별 문구
  - `wrong-title` → *「지금 『일등병』 이네요. 『상등병』 으로 바꿔 주세요」*
  - `expired` → *「시간이 지났습니다. 다시 시작해 주세요」* + 재발급 버튼
  - `exhausted` → *「확인을 너무 많이 눌렀습니다. 다시 시작해 주세요」*
  - `no-pool` → *「본인 인증은 준비 중입니다」* (2-4)
- **없는 것을 지어내지 않는다** — 반영 지연이 `[미확인]` 이므로
  *「보통 N분 안에 반영됩니다」* 라고 쓰지 않는다

---

## 8. 폴링 — `identity-watch` 에 얹는다

새 잡을 만들지 않는다. `identity-watch` 가 이미 `user/basic` 을 부른다.

```
① 열린 도전이 있는 ouid 를 감시 대상 **맨 앞에** 놓는다
② 어차피 부르는 응답에서 title_name 도 꺼낸다   ← 추가 호출 0건
③ verifyObservation(...) 으로 판정
④ 관측은 NexonIdentityObservation 에 남긴다 (칭호 풀이 여기서 쌓인다)
```

주기는 `lib/titleChallenge.ts` `nextCheckSeconds` 를 쓴다 — 15초 → 30 → 60 → 120.

> `MAX_ATTEMPTS(40)` 을 폴링만으로 다 쓰려면 약 49분이 걸린다. **TTL(30분)이 먼저 온다.**
> 그게 의도다 — `MAX_ATTEMPTS` 는 정상 종료 경로가 아니라 **안전망**이고, 사람이
> 「확인」을 연타해 호출이 불어날 때만 이쪽이 먼저 걸린다.

---

## 9. 안전 — 무엇을 하지 않는가

| 하지 않는 것 | 왜 |
|---|---|
| 닉네임으로 인증 | 닉은 식별자가 아니다 (D-220). 세 명 중 한 명이 바꿨고 옛 닉은 남이 물려받는다 |
| 위장닉 사용 | Open API 에 없다 (D-221). 우리가 병영수첩보다 빠를 수 없다 |
| 병영수첩 방명록 확인 | 서버에서 부르면 403(WAF · D-200). 사람이 눈으로 보는 수동 승인이 된다 |
| 접근 통제 우회 | 3-A 절대규칙 5번. 403 을 만나면 멈춘다 |
| 관측 없이 칭호 풀 지어내기 | 3장 7번. 풀이 비면 인증을 **닫아 둔다** |
| `reason='admin'` 덮어쓰기 | D-222. 관리자 시험 흔적이 사라진다 (6-1) |
| 「보통 N분 걸립니다」 안내 | 반영 지연은 `[미확인]` 이다. 재보지 않았다 |

---

## 10. 남은 `[미확인]`

1. **칭호 반영 지연.** 칭호를 바꾸면 `user/basic` 에 얼마나 빨리 뜨는가.
   닉 변경은 몇 분이었다(D-220). **재보려면 실제로 칭호를 바꿀 수 있는 사람이 필요하다** —
   에이전트가 혼자 못 푼다. 그래서 설계를 지연에 둔감하게(TTL 30분) 만들어 두었다.
   측정되면 TTL 과 폴링 주기를 조정한다
2. **칭호 풀의 실제 분포.** 관측이 쌓이기 전이라 2-3 의 기준값은 **제안**이다
3. **`ouid` 하나에 여러 `Player` 가 걸린 경우** 어느 알을 깰 것인가.
   지금은 `NexonIdentity.playerId` 하나를 본다. 병합 미완인 `OBS-` 행이 있으면
   (UI_PARITY_AUDIT 14-2 · `playerMerge.ts`) 인증이 엉뚱한 선수에 붙을 수 있다.
   **신원 병합이 이 기능의 선행 과제다**
4. **재발급 제한.** 지금은 만료 후 무제한 재발급이다. 남용이 보이면 일일 한도를 건다

---

## 11. 구현 현황

| 항목 | 상태 |
|---|---|
| 판정 로직 `lib/titleChallenge.ts` | **완료** — 순수함수. DB·API 안 씀 |
| 테스트 `__tests__/titleChallenge.test.ts` | **완료** — 32건 통과 (`--no-file-parallelism`) |
| 이 문서 | **완료** |
| 마이그레이션 SQL 문안 | **완료** (4장) — 적용은 `claude-ce` |
| `lib/identityWatch.ts` 칭호 비교 | **완료** — `IdentitySnapshot.titleName` 선택 칸 추가. 변경 표기를 `nickname+clan+title` 조합으로 확장하고 `nextWatchTier` 가 칭호 변경도 `hot` 으로 본다. **옵셔널로 두어 예전 호출자를 깨지 않는다** |
| `jobs/identityWatch.ts` 에 칭호 얹기 | 대기 — 스키마 적용 후 (DB 컬럼이 있어야 쓴다) |
| API 4개 | 대기 — 스키마 적용 후 |
| 화면 | 대기 |
| `EggBreak` 연결 | 대기 |

> 스키마가 적용되기 전에는 **DB 를 건드리는 코드를 쓸 수 없다.** 그래서 순수 로직과
> 문서를 먼저 냈다. 이 순서면 스키마가 들어오는 즉시 나머지가 빠르게 붙는다.
