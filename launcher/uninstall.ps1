# Removes the School Dashboard from this PC. Run it through Uninstall.cmd.

$Project = Split-Path -Parent $PSScriptRoot
$PersonalFiles = @("dashboard-config.json", "dashboard-settings.json", "dashboard-dismissed.json", ".env.local")

function Ask($question) {
    $answer = Read-Host "  $question (Y/N)"
    return $answer -match '^\s*y'
}

Write-Host ""
Write-Host "  Uninstall School Dashboard"
Write-Host "  --------------------------"
Write-Host "  Folder: $Project"
Write-Host ""
if (-not (Ask "Uninstall the dashboard?")) {
    Write-Host "  Nothing was changed."
    exit 0
}

& (Join-Path $PSScriptRoot "stop-dashboard.ps1")
# The daily morning email task, if one was set up.
& (Join-Path $PSScriptRoot "schedule-digest.ps1") -Days off | Out-Null

# The desktop icon, only if it opens this copy of the dashboard.
$shortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "School Dashboard.lnk"
if (Test-Path $shortcut) {
    $link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
    if ($link.Arguments.Contains($Project)) {
        Remove-Item $shortcut -Force
        Write-Host "  Removed the desktop icon."
    }
}

Write-Host ""
$deleteFolder = Ask "Also delete the whole dashboard folder, including your saved settings and Canvas token?"

if ($deleteFolder) {
    # This window is running from the folder, so the delete waits until it has closed.
    Set-Location $env:TEMP
    $window = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID").ParentProcessId
    $cleanup = "Wait-Process -Id $window -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Remove-Item -LiteralPath '$($Project -replace "'", "''")' -Recurse -Force"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cleanup))
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", $encoded `
        -WorkingDirectory $env:TEMP `
        -WindowStyle Hidden
    Write-Host "  The dashboard folder will be deleted when this window closes."
} else {
    foreach ($dir in @("node_modules", ".next")) {
        $path = Join-Path $Project $dir
        if (Test-Path $path) { Remove-Item $path -Recurse -Force }
    }
    Remove-Item (Join-Path $PSScriptRoot "server.log") -Force -ErrorAction SilentlyContinue
    Write-Host "  Removed the installed files."

    if (Ask "Delete your saved settings and Canvas token too? (Say N to keep them for a reinstall)") {
        foreach ($f in $PersonalFiles) { Remove-Item (Join-Path $Project $f) -Force -ErrorAction SilentlyContinue }
        Write-Host "  Deleted your saved settings."
    } else {
        Write-Host "  Kept your settings. Double-click Install.cmd to reinstall."
    }
}

Write-Host ""
Write-Host "  Done. Your Canvas token still works in Canvas until you delete it there:"
Write-Host "  Canvas > Account > Settings > Approved Integrations."
Write-Host ""
