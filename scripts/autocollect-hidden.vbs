' ★자동수집을 창 없이 띄운다★ (2026-09-04)
'
' ── 왜 이 파일이 있나
'   작업 스케줄러가 `bash.exe` 를 바로 부르면 ★검은 창이 뜬다.★
'   사장님이 컴퓨터를 쓰시는 동안 15분마다 창이 깜빡이면 안 된다.
'   이 래퍼가 ★창을 숨겨서(0)★ 부른다.
'
' ── 두 개가 동시에 도는 것은 스크립트의 잠금이 막는다 (D-279)
'   그래서 15분마다 불려도 ★이미 돌고 있으면 그냥 끝난다.★
'   ★그 구조가 곧 자동 복구다★ — 어쩌다 죽어도 다음 15분에 다시 뜬다.
'
' ── 끄는 법
'   schtasks /Delete /TN "sacloud-autocollect" /F

Dim shell, cmd
Set shell = CreateObject("WScript.Shell")

cmd = """C:\Users\Git\bin\bash.exe"" -lc ""cd '/c/Users/LG/Desktop/서플라이' && sh scripts/autocollect.sh"""

' 0 = 창을 숨긴다 · False = 끝날 때까지 기다리지 않는다
shell.Run cmd, 0, False
