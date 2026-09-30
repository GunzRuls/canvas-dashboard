# Creates, changes, or removes the daily "School Dashboard Morning Email" task.
# Called by the dashboard when you save the morning email settings.
#   -Days daily|weekdays   send at -Time (HH:MM) on those days
#   -Days off              remove the task
# The task runs start-dashboard.ps1 -SendDigest, which starts the server if needed, sends the
# email, and stops the server again. It runs as you, so no administrator rights are needed.

param(
    [string]$Time = "07:00",
    [ValidateSet("daily", "weekdays", "off")][string]$Days = "weekdays"
)

$ErrorActionPreference = "Stop"
$TaskName = "School Dashboard Morning Email"

if ($Days -eq "off") {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "removed"
    exit 0
}

if ($Time -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw "Time must look like 07:00." }
$at = [datetime]::ParseExact($Time, "HH:mm", [Globalization.CultureInfo]::InvariantCulture)

$launcher = Join-Path $PSScriptRoot "start-dashboard.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" -SendDigest"

if ($Days -eq "daily") {
    $trigger = New-ScheduledTaskTrigger -Daily -At $at
} else {
    $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $at
}

# StartWhenAvailable: if the PC was off at that time, send once it's back on.
# WakeToRun: wake a sleeping PC to send (when Windows allows wake timers).
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Sends your School Dashboard morning email." -Force | Out-Null
Write-Output "scheduled"
