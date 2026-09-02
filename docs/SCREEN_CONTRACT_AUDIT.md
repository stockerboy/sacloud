# 화면이 보내는 몸통 ↔ 계약 — 전수 대조 (O-030 · 2026-09-03)

> **왜 이 문서가 있나**
>
> 테스트 2,288건이 초록인데 **가입이 100% 실패했다** (O-027). 로그인도 같았다 (O-029).
> 최윤서 —
> > *「테스트가 지키는 것은 **계약이 스스로 일관되는가**이고,
> >  ★**화면이 그 계약대로 보내는가**★ 는 아무도 안 지킨다.」*
>
> 그래서 `apiSend` 를 쓰는 **모든 자리**를 손으로 세어 계약과 맞춰 봤다.
> 자동화를 먼저 만들지 않았다 — **눈으로 맞추는 것이 제일 쌌다.**

---

## ★근본 원인 — 계약에 몸통을 다는 자리가 없다★

```ts
// packages/contract/src/endpoints.ts 55행
export interface EndpointDef {
  method: HttpMethod
  path: string
  origin: EndpointOrigin
  description: string
  response: z.ZodTypeAny   // ← 응답만 있다
  query?: readonly string[]
  //  ★request 가 없다★
}
```

**「이 엔드포인트가 무슨 몸통을 받는가」를 기계가 알 방법이 없다.**
서버는 `XxxInput.safeParse()` 로 검사하지만 그 스키마는 **엔드포인트와 연결돼 있지 않다.**
그래서 화면이 엉뚱한 모양을 보내도 **빌드도 테스트도 아무 말을 안 한다.**

이것이 O-027 · O-029 · 그리고 아래 O-030 이 **같은 사고를 세 번** 낸 이유다.

> **고칠지는 A 가 정한다.** `EndpointDef` 에 `request?: z.ZodTypeAny` 를 더하면
> 엔드포인트 하나하나에 스키마를 달 수 있고, 그때부터 **한 곳에서** 대조가 가능해진다.
> 이 판에서는 **세기만 했다.**

---

## 대조표 — `apiSend` 27자리

| 엔드포인트 | 화면 | 화면이 보내는 것 | 계약/서버가 받는 것 | 판정 |
|---|---|---|---|---|
| `authEmailVerify` | auth/email/verify | `token` | `EmailVerifyInput{token}` | ✔ |
| `authLogin` | auth/login | `username, password` | `LoginInput{username?, email?, password}` | ✔ (O-029 에서 고침) |
| `authLogout` | AppShell | `{}` | 검사 없음 | ✔ |
| `authPasswordForget` | auth/password/forget | `email` | `PasswordForgetInput{email}` | ✔ |
| `authPasswordReset` | auth/password/reset | `token, password` | `PasswordResetInput{token, password}` | ✔ |
| `authSignup` | auth/signup | `username, password, nickname, email?, captcha_token` | `SignupInput` 같음 | ✔ (O-027 에서 고침) |
| `meSettingUpdate` | me/setting | `nickname, avatar_url` | `MeSettingInput` 같음 | ✔ |
| `mePasswordUpdate` | me/password | `current_password, password` | `MePasswordInput` 같음 | ✔ |
| `meLinkUpdate` | me/link | `player_name` | `AccountLinkInput{player_name}` | ✔ |
| `meTitleVerificationCheck` | me/link/TitleVerify | `nickname` | `TitleVerificationInput{nickname}` | ✔ |
| `playerSettingUpdate` | player/[id]/setting | `position, note` | `PlayerSettingInput{note, position}` | ✔ |
| `clanSettingUpdate` | clan/[slug]/setting | `notice, block_invitation` | `ClanSettingInput` 같음 | ✔ |
| `clanMasterClaimCreate` | clan/[slug]/master | `image, note` | `ClanMasterClaimInput{image, note?}` | ✔ |
| `clanMasterClaimCancel` | clan/[slug]/master | 몸통 없음 | 몸통 안 봄 | ✔ |
| ★`leagueCreate`★ | leagues/create | `agreements: [true,true,true]` | `agreements: z.object({셋})` | ★**어긋남**★ |
| `leagueClanRegister` | league/[slug]/setting | `clan_slug, division` | `LeagueClanRegisterInput` 같음 | ✔ |
| `leagueClanLookup` | league/[slug]/setting | `url` | `ClanLookupInput{url}` | ✔ |
| `leagueInvite` | league/[slug]/setting | `clan_slug, division` | `ClanInviteInput` 같음 | ✔ |
| `leagueClanDivisionUpdate` | league/[slug]/setting | `division` | `DivisionChangeInput{division}` | ✔ |
| `leagueClanDelete` | league/[slug]/setting | 몸통 없음 | 몸통 안 봄 | ✔ |
| `leagueClanExpel` | league/[slug]/setting | `confirm` | `ExpelInput{confirm}` | ✔ |
| `boardCreate` · `boardUpdate` · `boardDelete` | board/** | `category, …PostForm, captcha_token` | ★**서버에 스키마가 없다**★ | ⏸ 닫힘 |
| `boardVote` · `commentVote` | board/PostScreen | `type` | ★**서버에 스키마가 없다**★ | ⏸ 닫힘 |
| `commentCreate` | board/PostScreen | `board_id, parent_id, content, password, disclose_type` | ★**서버에 스키마가 없다**★ | ⏸ 닫힘 |

```
✔  어긋나지 않음   21자리
★  어긋남          ★1자리★  — leagueCreate
⏸  닫힘 (판정 보류) 5자리    — 게시판·댓글 (O-011 로 쓰기 API 가 403)
```

---

## ★어긋난 하나 — `leagueCreate`★

```
계약   agreements: z.object({ no_paid_invitation, responsible_operation,
                              accept_deletion_policy })   ← 셋 다 literal(true)
화면   agreements: agreements.map(() => true)             ← ★[true, true, true]★
```

`z.object()` 는 배열을 안 받는다. **누가 무엇을 넣어도 400 이다. 100% 다.**
**가입 · 로그인과 똑같은 사고이고 이번이 세 번째다.**

**고쳤다.** 화면의 체크박스 상태(`agreements[]`)는 그대로 두고 **보내는 모양만** 바꿨다.
`packages/contract/src/__tests__/league-create-contract.test.ts` 가 이제 이 자리를 잠근다 —
**배열로 보내면 그 테스트가 먼저 깨진다.**

⚠ 이 화면은 지금 **닫혀 있다** (`O-024` · `SETTING_DOORS_OPEN`). 그래도 고쳤다 —
**열 때 다시 찾을 일을 남기지 않는다.**

---

## 닫힌 다섯 자리를 왜 판정하지 않았나

게시판·댓글 쓰기는 **서버에 `safeParse` 하는 스키마가 아예 없다.**
비교할 대상이 없으니 「어긋난다/안 어긋난다」를 말할 수 없다.
그리고 그 API 들은 `O-011` 로 **403** 이다 — 지금은 아무도 못 쓴다.

**게시판을 열 때 이 표의 마지막 다섯 줄부터 본다.** 그때는
「스키마가 없다」가 곧 「검사가 없다」이므로, 스키마를 만드는 것이 첫 일이다.
