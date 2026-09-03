# O-044 되돌리기 파일 — ★지우지 마라★

`clan-move-backup.jsonl` 은 **O-044 에서 옮긴 경기 3,351건의 옮기기 전 상태**다.
경기마다 `leagueId` · `redLeagueClanId` · `blueLeagueClanId` 세 칸이 들어 있다.

```
되돌리기   node scripts/prod-run.mjs clan-move --revert
           그다음  node scripts/prod-run.mjs season-assign --confirm
```

★**이 파일이 없으면 되돌릴 수 없다.**★
「양쪽이 SPL 행이고 지금 SPL 에 있다」만으로는 **원래 SPL 이던 48,933건과 구별이 안 된다.**

⚠ 임시 파일처럼 보이지만 임시가 아니다. **지우면 O-044 를 되돌릴 방법이 사라진다.**
⚠ 안에는 `match id` · `league id` · `leagueClan id` 뿐이다 — 개인정보가 없다.
   (이 저장소는 공개다. `docs/STATE.md` 5장 9번)
