; School Dashboard installer (Inno Setup 6).
; Built by .github/workflows/release.yml after `npm run build`, with Node's node.exe in dist\node.
; Installs for the current user only (no admin prompt). Personal files live in
; %APPDATA%\School Dashboard, so updating keeps them and uninstalling asks first.

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif

#define AppName "School Dashboard"
#define Launch '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\launcher\start-dashboard.ps1""'

[Setup]
; Never change AppId: Windows uses it to recognize updates of this same app.
AppId={{16E6BCD6-0F03-4AB4-8D7A-DB84B9478A07}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=GunzRuls
AppPublisherURL=https://github.com/GunzRuls/canvas-dashboard
AppSupportURL=https://github.com/GunzRuls/canvas-dashboard
AppUpdatesURL=https://github.com/GunzRuls/canvas-dashboard/releases/latest
DefaultDirName={localappdata}\Programs\{#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=School-Dashboard-Setup
SetupIconFile=..\launcher\dashboard.ico
UninstallDisplayIcon={app}\launcher\dashboard.ico
UninstallDisplayName={#AppName}
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Put a School Dashboard icon on my desktop"; GroupDescription: "Shortcuts:"

[InstallDelete]
; Remove the previous version's app files so nothing stale is left behind after an update.
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "..\dist\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "..\.next\standalone\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\.next\static\*"; DestDir: "{app}\app\.next\static"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\launcher\start-dashboard.ps1"; DestDir: "{app}\launcher"; Flags: ignoreversion
Source: "..\launcher\stop-dashboard.ps1"; DestDir: "{app}\launcher"; Flags: ignoreversion
Source: "..\launcher\schedule-digest.ps1"; DestDir: "{app}\launcher"; Flags: ignoreversion
Source: "..\launcher\dashboard.ico"; DestDir: "{app}\launcher"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\{#AppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "{#Launch}"; WorkingDir: "{app}"; IconFilename: "{app}\launcher\dashboard.ico"; Comment: "Open the School Dashboard"; Flags: runminimized
Name: "{userdesktop}\{#AppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "{#Launch}"; WorkingDir: "{app}"; IconFilename: "{app}\launcher\dashboard.ico"; Comment: "Open the School Dashboard"; Flags: runminimized; Tasks: desktopicon

[Run]
; Also runs after the in-app Update button's /SILENT install, so the dashboard reopens by itself.
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "{#Launch}"; Description: "Open School Dashboard now"; Flags: postinstall nowait runhidden

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\launcher\stop-dashboard.ps1"""; Flags: runhidden; RunOnceId: "StopDashboard"
; Remove the daily morning email task (launcher\schedule-digest.ps1), if there is one.
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\launcher\schedule-digest.ps1"" -Days off"; Flags: runhidden; RunOnceId: "RemoveEmailTask"

[UninstallDelete]
; Files the app creates while running (like its cache).
Type: filesandordirs; Name: "{app}\app"
; The last installer the in-app Update button downloaded (lib/updates.js saves it to %TEMP%).
Type: files; Name: "{localappdata}\Temp\School-Dashboard-Setup-*.exe"

[Code]
// Stop a running dashboard before its files are replaced during an update.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  StopScript: String;
  ResultCode: Integer;
begin
  StopScript := ExpandConstant('{app}\launcher\stop-dashboard.ps1');
  if FileExists(StopScript) then
    Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoProfile -ExecutionPolicy Bypass -File "' + StopScript + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;

// After uninstalling, ask whether to also delete saved settings and the Canvas token.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{userappdata}\School Dashboard');
    if DirExists(DataDir) and not UninstallSilent then
      if MsgBox('Also delete your saved settings and Canvas token?' + #13#10#13#10 +
                'Choose No to keep them in case you install the dashboard again.',
                mbConfirmation, MB_YESNO) = IDYES then
      begin
        DelTree(DataDir, True, True, True);
        MsgBox('Your settings were deleted. You can also remove the token in Canvas:' + #13#10 +
               'Account > Settings > Approved Integrations.', mbInformation, MB_OK);
      end;
  end;
end;
