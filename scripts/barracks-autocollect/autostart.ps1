# 로그인할 때 크롬이 수집 탭을 열고 켜져 있게 한다 (윈도우 작업 스케줄러) — 2026-09-02 · 지시 #7
#
#   관리자 PowerShell 에서:
#     .\autostart.ps1            등록 (이미 있으면 갱신)
#     .\autostart.ps1 -Remove    해제
#
# 크롬에 주는 옵션 세 개는 **숨은 탭의 타이머를 늦추지 말라**는 크롬 자체 옵션이다.
# 병영수첩 요청과는 무관하고 회피 플래그가 아니다. 이게 없으면 숨은 탭에서 1초 간격이 1분이 된다.
#   --disable-background-timer-throttling
#   --disable-renderer-backgrounding
#   --disable-backgrounding-occluded-windows
# 압축해제 확장은 크롬을 다시 켜도 그대로 남는다 (chrome://extensions 에서 지우기 전까지).

param([switch]$Remove)

$TaskName = 'SACLOUD 병영수첩 자동수집'
$Url = 'https://barracks.sa.nexon.com/#sacloud-autocollect'
$Chrome = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $Chrome)) { $Chrome = Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe' }
if (-not (Test-Path $Chrome)) { Write-Error '크롬을 못 찾았다'; exit 1 }

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "해제했다: $TaskName"
  exit 0
}

$Args = '--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows "' + $Url + '"'
$Action = New-ScheduledTaskAction -Execute $Chrome -Argument $Args
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# 1분 뒤에 연다 (로그인 직후 네트워크가 아직 안 붙었을 때를 피한다)
$Trigger.Delay = 'PT1M'
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null
Write-Host "등록했다: $TaskName"
Write-Host "  로그인 1분 뒤 크롬이 $Url 을 연다"
Write-Host "  지금 바로 시험하려면:  Start-ScheduledTask -TaskName '$TaskName'"
