# `design/` — 사용자가 직접 만지는 **화면 시안**

여기 있는 것은 **시안이다. 실코드가 아니다.**
여기서 색을 바꾸거나 글자를 고쳐도 `apps/web` 은 바뀌지 않는다. 사람이 옮긴다.

배경은 `docs/DECISIONS.md` **D-234**.

---

## 무엇이 무엇인가

| 파일 | 무엇 |
|---|---|
| `Home.dc.html` | 홈 — 로고 · 통합검색 · 알 모음집 · 인기게시글 · 꼬리말 |
| `Main.dc.html` | 클랜원 목록 — 접속중 / 미접속 / 알수없음 세 상태 (D-226) |
| `AdminEggs.dc.html` | 운영 관리 · 알 — 폰 폭 390 (`b280af2`) |
| `canvas.json` | 세 장을 캔버스 어디에 놓을지 + 안내 쪽지 |
| `sacloud-screens.html` | **조립 결과물. 저장소에 넣지 않는다** (2.2MB · `.gitignore`) |

## 다시 조립하는 법

```bash
cd design
node "<design 스킬 폴더>/seed-canvas.mjs" \
  --template "<design 스킬 폴더>/payload.template.html" \
  --out sacloud-screens.html \
  --title "SACLOUD 화면 시안" \
  --artboard Main.dc.html --artboard Home.dc.html --artboard AdminEggs.dc.html \
  --canvas canvas.json

node "<design 스킬 폴더>/seed-canvas.mjs" --check sacloud-screens.html
```

그 다음 `Artifact` 로 **같은 URL 에 다시 발행**한다 (`contract: "0.1.31"`).

## 고칠 때 지키는 두 줄

1. **색은 손잡이(`{{}}`)로 뺀다.** 토큰 이름과 기본값은 **D-204 와 같아야 한다.**
   캔버스에서 색을 새로 지어내지 않는다.
2. **손댈 글자는 리터럴로 쓴다.** 반복문(`<sc-for>`)으로 그리면 편집기에서
   **글자를 못 고친다.** 목록이 길어져도 한 줄씩 풀어 쓴다.
