# barracks-autocollect — 사장님 PC 의 크롬이 15분마다 IPL 기록을 알아서 받는다

**왜**: 병영수첩은 서버에서 부르면 403, 진짜 크롬에서만 200 이다. GitHub 실행기(데이터센터 IP)도 403 이었다.
**사장님 PC(집 IP)에서는 200 이 확인된 유일한 자리**다 (2026-09-02 실측 · 로그인도 필요 없었다).
이 확장은 병영수첩 탭 하나를 고정해 두면 **사람 손 없이** 새 경기와 배틀로그를 받아 SACLOUD 창구로 보낸다.

단점은 그대로다 — **이 PC 가 켜져 있고 크롬이 떠 있어야** 한다. 꺼져 있던 시간만큼 밀렸다가, 켜지면 따라잡는다.

## 설치 5단계

1. **폴더 받기** — 저장소의 `scripts/barracks-autocollect/extension` 폴더를 이 PC 어딘가에 둔다
   (예: `C:\sacloud\extension`). 총괄이 zip 으로 주면 풀어 둔다. **폴더를 옮기면 확장이 끊긴다** — 자리를 정하고 두어라
2. **크롬에 넣기** — 주소창에 `chrome://extensions` → 오른쪽 위 **개발자 모드** 켜기 → **압축해제된 확장 프로그램을 로드합니다** → 위 폴더 선택.
   「SACLOUD 병영수첩 자동수집」이 목록에 뜨면 된다
3. **토큰 넣기** — 그 확장의 **세부정보 → 확장 프로그램 옵션** → 「수집 토큰」에 총괄이 준 값을 붙여 넣고 **저장**.
   (토큰은 이 크롬 안에만 저장된다. 파일로 남지 않는다.) 이어서 **「수집 탭 열기」** 를 누르면 병영수첩 탭이 고정(pin)되어 열리고 10초 뒤 첫 바퀴를 돈다.
   확장 아이콘의 배지가 `OK`(또는 새 경기 수)로 바뀌면 성공, `ERR` 이면 옵션 페이지의 「마지막 상태」를 본다
4. **크롬 설정 두 군데** —
   - `chrome://settings/onStartup` → **특정 페이지 또는 페이지 모음 열기** → `https://barracks.sa.nexon.com/#sacloud-autocollect` 추가
     (크롬을 다시 켜면 수집 탭이 저절로 열린다. 확장이 자기가 알아서 열기도 하지만 이중으로 둔다)
   - `chrome://settings/performance` → **메모리 절약 모드**의 「항상 활성 상태로 유지할 사이트」에 `barracks.sa.nexon.com` 추가
     (크롬이 메모리를 아끼려고 숨은 탭을 잠재우는데, 그러면 수집이 멈춘다)
5. **PC 를 켜면 크롬이 저절로** — PowerShell 을 **관리자로** 열고 `scripts\barracks-autocollect\autostart.ps1` 을 실행한다.
   로그인 1분 뒤 크롬이 수집 탭을 열도록 작업 스케줄러에 등록된다. 해제는 `autostart.ps1 -Remove`

## 잘 도는지 보는 법

- 확장 아이콘 배지: `…` 도는 중 · `OK` 새 경기 없음 · 숫자 = 이번 바퀴 새 경기 수 · `ERR` 실패
- 옵션 페이지 「마지막 상태」: `newMatches · sent · inserted · duplicated · empties · failed · error`
- 수집 탭 F12 콘솔: `__acStatus()` (진행) · `__acRun()` (지금 한 바퀴)
- 사이트 쪽: 창구 `GET /api/ingest/barracks` 의 `battlelogRows` 가 늘어난다 (총괄이 본다)

## 어떻게 도는가 (기술)

```
서비스워커(sw.js)      chrome.alarms 15분  ──메시지──▶  고정 탭의 페이지(autocollect.js)
  · 시계 · 탭 열기/살리기 · 배지                     · collectClanMatchList(slug)  ← snippet.js
  · 6시간마다 사이트에서 클랜 명단                    · blFetchClan(match_key, clan_no)
  · 병영수첩에 손대지 않는다                           · 40건씩 POST 창구 (Bearer)
                                                     · 「마지막 경기」 localStorage
```

- **요청은 전부 고정 탭의 페이지가 보낸다.** 브라우저가 평소 보내는 그대로다 — 헤더를 만들지 않고, UA·쿠키를 손대지 않는다.
  서비스워커의 `alarms` 는 시계일 뿐 fetch 주체가 아니다(서비스워커 fetch 는 페이지가 아니라서 403 이 났던 그 길이다).
- **수집 로직은 한 벌이다.** `extension/snippet.js` 는 `scripts/battlelog-collect-snippet.js` 를 `pack.mjs` 가 그대로 복사한 것이다.
  원본을 고쳤으면 `node scripts/barracks-autocollect/pack.mjs` 를 다시 돌린다 (`--check` 로 같은지 본다). 손으로 고치지 마라.
- **새것만 받는다.** 클랜마다 「마지막으로 보낸 match_key」를 두고 그보다 큰 것만 받는다. 처음 보는 클랜은 **어제부터**.
  과거 전수 수집(약 23,100건)은 이 확장이 하지 않는다 — 사람이 스니펫으로 한다 (`battlelog-collect-snippet.js` 머리말).
- **실패하면 다음 주기에.** 「마지막」은 창구로 **보낸 뒤에만** 전진한다. 창구는 멱등이라 겹쳐 보내도 행이 늘지 않는다.
- **원본에 대한 예의.** 목록 1초 간격 · 배틀로그 200ms 간격 · 실패 시 지수 백오프 3회 (스니펫 값 그대로). 한 바퀴에 클랜 43곳이면 목록 요청 43건 + 새 경기 수만큼.

### 백그라운드 탭에서 타이머가 늦어지는 문제

크롬은 숨은 탭의 `setTimeout` 을 5분 뒤부터 **1분에 한 번**으로 늦춘다. 그러면 1초 간격 루프가 1분 간격이 되어 한 바퀴에 한 시간이 걸린다. 세 겹으로 막는다.

1. **15분 시계는 서비스워커 알람**이다. 알람이 보내는 확장 메시지는 타이머 제한을 받지 않아 **제때 깨운다.** 페이지의 `setInterval` 은 예비다
2. **크롬 실행 옵션** `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows` — 루프 안의 1초 `sleep` 이 늦지 않게. `autostart.ps1` 이 이 옵션으로 크롬을 띄운다. 크롬 자체 옵션이며 병영수첩 요청과 무관하다
3. **탭 고정 + 메모리 절약 예외** — 탭이 버려지는(discard) 것을 막는다. 그래도 버려지면 서비스워커가 다음 알람에 다시 열고, 진행 상태는 `localStorage` 에 있어 이어 간다

오디오 컨텍스트로 「소리 나는 탭」을 흉내 내는 방법은 **쓰지 않았다** — 사용자 클릭 없이는 재생이 안 되고, 위 세 겹이면 충분하다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `extension/manifest.json` | MV3. `barracks.sa.nexon.com` 과 `3rdcloud.my` 에만 권한 |
| `extension/sw.js` | 서비스워커 — 알람 · 탭 관리 · 클랜 명단 · 배지 |
| `extension/bridge.js` | 확장 ↔ 페이지 다리. 토큰을 첫 실행 때 묻고 `chrome.storage` 에 둔다 |
| `extension/autocollect.js` | 본체 — 새 경기 판정 · 배틀로그 · 창구 전송 · 「마지막」 관리 |
| `extension/snippet.js` | **생성 파일.** `battlelog-collect-snippet.js` 복사본 (`pack.mjs`) |
| `extension/clans.js` | IPL 43곳 slug 예비 명단 (사이트 명단이 우선) |
| `extension/options.html/js` | 토큰 · 창구 · 주기 · 지금 한 바퀴 · 마지막 상태 |
| `pack.mjs` | 스니펫 복사 / `--check` |
| `autostart.ps1` | 로그인 시 크롬 자동 실행 (작업 스케줄러) |

옛 수동 방식(F12 콘솔에 스니펫 붙여 넣기)은 그대로 남아 있다 — `scripts/battlelog-collect-snippet.js`.

## 안 되는 것 · 모르는 것

- 이 PC 가 꺼지면 멈춘다. 절전(잠자기)도 멈춘다 — 전원 옵션에서 「절전 안 함」으로 두는 편이 낫다 `[미확인: 절전 중 크롬 타이머]`
- 크롬을 다시 켤 때 「개발자 모드 확장 프로그램 사용 중지」 알림이 뜰 수 있다. **취소**를 누르면 된다 `[미확인: 이 크롬 버전에서 뜨는지]`
- 토큰은 결국 페이지 컨텍스트로 간다(요청을 보내는 쪽이 페이지라서). 새면 Vercel 환경변수에서 바꾼다
- 실제 설치·실행은 아직 안 했다 — 준비까지다
