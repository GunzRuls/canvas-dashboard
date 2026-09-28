# School Dashboard launcher
# Starts the dashboard in the background if it isn't already running, then opens it.
# The server has no window. It stops by itself a little after you close the dashboard window.

$Project   = Split-Path -Parent $PSScriptRoot
$Port      = 3000
$Url       = "http://localhost:$Port"
$Log       = Join-Path $PSScriptRoot "server.log"
$AppWindow = $true   # $true = its own window like an app. $false = a normal browser tab.

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

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
    [System.Windows.Forms.MessageBox]::Show($message, "School Dashboard") | Out-Null
}

# A small "Starting..." box so you know something is happening while the server starts.
function Show-Splash($text) {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "School Dashboard"
    $form.Size = New-Object System.Drawing.Size(360, 130)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $iconPath = Join-Path $PSScriptRoot "dashboard.ico"
    if (Test-Path $iconPath) { $form.Icon = New-Object System.Drawing.Icon($iconPath) }
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $text
    $label.AutoSize = $false
    $label.Dock = "Fill"
    $label.TextAlign = "MiddleCenter"
    $label.Font = New-Object System.Drawing.Font("Segoe UI", 11)
    $form.Controls.Add($label)
    $form.Show()
    [System.Windows.Forms.Application]::DoEvents()
    return $form
}

if (-not (Test-Running)) {
    if (-not (Test-Path (Join-Path $Project "node_modules"))) {
        Show-Error "The dashboard isn't installed yet. Double-click Install.cmd in the dashboard folder first."
        exit 1
    }

    # Rebuild only if there's no build yet, or the code changed since the last one.
    $buildId = Join-Path $Project ".next\BUILD_ID"
    $needsBuild = -not (Test-Path $buildId)
    if (-not $needsBuild) {
        $builtAt = (Get-Item $buildId).LastWriteTime
        $sources = @((Join-Path $Project "app"), (Join-Path $Project "lib"), (Join-Path $Project "instrumentation.js"), (Join-Path $Project "package.json"))
        $changed = Get-ChildItem -Path $sources -Recurse -File |
            Where-Object { $_.LastWriteTime -gt $builtAt } |
            Select-Object -First 1
        $needsBuild = [bool]$changed
    }

    if ($needsBuild) {
        $command = "npm run build && npm run start"
        $splash = Show-Splash "Updating the dashboard. This takes a minute..."
        $waitSeconds = 300
    } else {
        $command = "npm run start"
        $splash = Show-Splash "Starting the dashboard..."
        $waitSeconds = 60
    }

    # Tells the server to stop itself once its window is closed (see lib/autoStop.js).
    $env:DASHBOARD_AUTO_STOP = "1"
    $server = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c $command > `"$Log`" 2>&1" `
        -WorkingDirectory $Project `
        -WindowStyle Hidden `
        -PassThru

    $deadline = (Get-Date).AddSeconds($waitSeconds)
    while (-not (Test-Running)) {
        [System.Windows.Forms.Application]::DoEvents()
        if ($server.HasExited -or (Get-Date) -gt $deadline) {
            $splash.Close()
            if (-not $server.HasExited) { & taskkill /PID $server.Id /T /F | Out-Null }
            Show-Error "The dashboard didn't start. Details are in:`n$Log"
            exit 1
        }
        Start-Sleep -Milliseconds 300
    }
    $splash.Close()
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
