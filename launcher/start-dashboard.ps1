# School Dashboard launcher
# Starts the dashboard in the background if it isn't already running, then opens it.
# Works both for the installed app (School-Dashboard-Setup.exe) and for the project folder.
# The server has no window. It stops by itself a little after you close the dashboard window.
#
# -SendDigest: used by the daily "School Dashboard Morning Email" task (schedule-digest.ps1).
# Nothing is shown. It starts the server only if needed, sends the morning email, and stops
# only a server it started itself. The result goes to email.log.

param([switch]$SendDigest)

$Project   = Split-Path -Parent $PSScriptRoot
$Port      = 3000
$Url       = "http://localhost:$Port"
$Log       = Join-Path $PSScriptRoot "server.log"
$AppWindow = $true   # $true = its own window like an app. $false = a normal browser tab.
$Quiet     = [bool]$SendDigest
$started   = $null   # the server process this run started, if any

# Installed with School-Dashboard-Setup.exe: the app comes prebuilt with its own Node.js.
$Node      = Join-Path $Project "node\node.exe"
$ServerJs  = Join-Path $Project "app\server.js"
$Installed = (Test-Path $Node) -and (Test-Path $ServerJs)
# Personal files (and logs) live in AppData for the installed app, next to the launcher otherwise.
$DataDir   = if ($Installed) { Join-Path $env:APPDATA "School Dashboard" } else { $PSScriptRoot }
$EmailLog  = Join-Path $DataDir "email.log"

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

function Write-EmailLog($message) {
    New-Item -ItemType Directory -Force $DataDir | Out-Null
    Add-Content -Path $EmailLog -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message" -Encoding UTF8
}

function Show-Error($message) {
    if ($Quiet) { Write-EmailLog "Not sent. $message"; return }
    [System.Windows.Forms.MessageBox]::Show($message, "School Dashboard") | Out-Null
}

function Close-Splash($form) {
    if ($form) { $form.Close() }
}

# A small "Starting..." box so you know something is happening while the server starts.
function Show-Splash($text) {
    if ($Quiet) { return $null }
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

if ($Installed -and -not (Test-Running)) {
    # Personal files live in AppData so updating or uninstalling the app never touches them.
    New-Item -ItemType Directory -Force $DataDir | Out-Null
    $Log = Join-Path $DataDir "server.log"
    $splash = Show-Splash "Starting the dashboard..."

    $env:DASHBOARD_AUTO_STOP = "1"
    $env:DASHBOARD_DATA_DIR = $DataDir
    $env:DASHBOARD_INSTALL_DIR = $Project
    $env:PORT = "$Port"
    $env:HOSTNAME = "127.0.0.1"   # only this PC can reach the dashboard
    # The full path to server.js lets the uninstaller find and stop this exact process.
    $server = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c `"`"$Node`" `"$ServerJs`" > `"$Log`" 2>&1`"" `
        -WorkingDirectory (Split-Path $ServerJs) `
        -WindowStyle Hidden `
        -PassThru
        $started = $server

    $deadline = (Get-Date).AddSeconds(60)
    while (-not (Test-Running)) {
        [System.Windows.Forms.Application]::DoEvents()
        if ($server.HasExited -or (Get-Date) -gt $deadline) {
            Close-Splash $splash
            if (-not $server.HasExited) { & taskkill /PID $server.Id /T /F | Out-Null }
            Show-Error "The dashboard didn't start. Details are in:`n$Log"
            exit 1
        }
        Start-Sleep -Milliseconds 300
    }
    Close-Splash $splash
}

# Running from the project folder (Install.cmd or a git clone): build if needed, then start.
if (-not $Installed -and -not (Test-Running)) {
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
        -ArgumentList "/c ($command) > `"$Log`" 2>&1" `
        -WorkingDirectory $Project `
        -WindowStyle Hidden `
        -PassThru
        $started = $server

    $deadline = (Get-Date).AddSeconds($waitSeconds)
    while (-not (Test-Running)) {
        [System.Windows.Forms.Application]::DoEvents()
        if ($server.HasExited -or (Get-Date) -gt $deadline) {
            Close-Splash $splash
            if (-not $server.HasExited) { & taskkill /PID $server.Id /T /F | Out-Null }
            Show-Error "The dashboard didn't start. Details are in:`n$Log"
            exit 1
        }
        Start-Sleep -Milliseconds 300
    }
    Close-Splash $splash
}

if ($SendDigest) {
    # The Origin header marks this as the dashboard's own request (see lib/sameOrigin.js).
    $origin = "http://127.0.0.1:$Port"
    try {
        $res = Invoke-WebRequest -Method Post -Uri "$origin/api/digest" -Headers @{ Origin = $origin } `
            -UseBasicParsing -TimeoutSec 120
        $data = $res.Content | ConvertFrom-Json
        Write-EmailLog "Sent to $($data.to)."
    } catch {
        # Windows PowerShell hides the response on errors; read the app's own message from it.
        $detail = $null
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $detail = ($reader.ReadToEnd() | ConvertFrom-Json).error
        } catch {}
        Write-EmailLog "Not sent. $(if ($detail) { $detail } else { $_.Exception.Message })"
    }
    # Only stop a server this run started, never a dashboard you have open.
    if ($started -and -not $started.HasExited) { & taskkill /PID $started.Id /T /F | Out-Null }
    exit 0
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
