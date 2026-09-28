# School Dashboard launcher
# Starts the dashboard if it isn't already running, then opens it.

$Project   = Split-Path -Parent $PSScriptRoot
$Port      = 3000
$Url       = "http://localhost:$Port"
$AppWindow = $true   # $true = its own window like an app. $false = a normal browser tab.

function Test-Running {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        return $client.ConnectAsync("127.0.0.1", $Port).Wait(500)
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Show-Error($message) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($message, "School Dashboard") | Out-Null
}

if (-not (Test-Running)) {
    # Rebuild only if there's no build yet, or code in app/ or lib/ changed since the last one.
    $buildId = Join-Path $Project ".next\BUILD_ID"
    $needsBuild = -not (Test-Path $buildId)
    if (-not $needsBuild) {
        $builtAt = (Get-Item $buildId).LastWriteTime
        $changed = Get-ChildItem -Path (Join-Path $Project "app"), (Join-Path $Project "lib") -Recurse -File |
            Where-Object { $_.LastWriteTime -gt $builtAt } |
            Select-Object -First 1
        $needsBuild = [bool]$changed
    }

    if ($needsBuild) { $command = "npm run build && npm run start" } else { $command = "npm run start" }

    # The server runs in a minimized window. Closing that window stops the dashboard.
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/k title School Dashboard - close this window to stop it && $command" `
        -WorkingDirectory $Project `
        -WindowStyle Minimized

    $waitSeconds = if ($needsBuild) { 240 } else { 60 }
    $deadline = (Get-Date).AddSeconds($waitSeconds)
    while (-not (Test-Running)) {
        if ((Get-Date) -gt $deadline) {
            Show-Error "The dashboard didn't start. Open the 'School Dashboard' window on your taskbar to see the error."
            exit 1
        }
        Start-Sleep -Milliseconds 500
    }
}

# Open it. Prefers Chrome, then Edge, in app mode; falls back to your default browser.
$browsers = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($AppWindow -and $browser) {
    Start-Process -FilePath $browser -ArgumentList "--app=$Url"
} else {
    Start-Process $Url
}
