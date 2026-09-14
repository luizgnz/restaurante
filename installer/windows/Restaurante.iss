#define MyAppName "Restaurante"
#define MyAppVersion GetEnv("RESTAURANTE_VERSION")
#if MyAppVersion == ""
  #define MyAppVersion "0.1.0"
#endif
#define StageDir "stage"

[Setup]
AppId={{7BB84683-7477-40F7-A46F-27B9EBC37793}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\Restaurante
DefaultGroupName=Restaurante
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
OutputDir=output
OutputBaseFilename=Restaurante-Setup-{#MyAppVersion}-x64
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
UninstallDisplayName=Restaurante
CloseApplications=yes
RestartApplications=no

[Files]
Source: "prepare-update.ps1"; Flags: dontcopy noencryption
Source: "{#StageDir}\restaurante.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\ui\*"; DestDir: "{app}\ui"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\migrations\*"; DestDir: "{app}\migrations"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "rollback-update.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "register-task.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\Restaurante\data"; Permissions: users-modify
Name: "{commonappdata}\Restaurante\backups"; Permissions: users-modify

[Icons]
Name: "{group}\Abrir Restaurante"; Filename: "http://127.0.0.1:8080/"
Name: "{autodesktop}\Restaurante"; Filename: "http://127.0.0.1:8080/"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\installer\register-task.ps1"" -InstallDir ""{app}"" -DataDir ""{commonappdata}\Restaurante"""; Flags: runhidden waituntilterminated
Filename: "http://127.0.0.1:8080/"; Description: "Abrir Restaurante"; Flags: shellexec nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""Restaurante POS"""; Flags: runhidden waituntilterminated; RunOnceId: "StopTask"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Restaurante POS"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteTask"

[Code]
var
  HadPreviousInstall: Boolean;

function RunPowerShell(const ScriptName, Arguments: String): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    ExpandConstant('{app}\installer\') + ScriptName + '" ' + Arguments,
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  HadPreviousInstall := DirExists(ExpandConstant('{app}'));
  if HadPreviousInstall then begin
    Exec(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "Restaurante POS"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    ExtractTemporaryFile('prepare-update.ps1');
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
      ExpandConstant('{tmp}\prepare-update.ps1') + '" -InstallDir "' +
      ExpandConstant('{app}') + '" -DataDir "' + ExpandConstant('{commonappdata}\Restaurante') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      Result := 'No se pudo crear el respaldo previo. La instalación no continuará.';
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  VerifyOK, RollbackOK: Boolean;
begin
  if CurStep = ssPostInstall then begin
    VerifyOK := Exec(ExpandConstant('{app}\restaurante.exe'),
      '-verify-install -ui-dir "' + ExpandConstant('{app}\ui') + '" -migrations-dir "' +
      ExpandConstant('{app}\migrations') + '" -data-dir "' + ExpandConstant('{commonappdata}\Restaurante') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
    if not VerifyOK then begin
      RollbackOK := True;
      if HadPreviousInstall then
        RollbackOK := RunPowerShell('rollback-update.ps1', '-InstallDir "' + ExpandConstant('{app}') +
          '" -DataDir "' + ExpandConstant('{commonappdata}\Restaurante') + '"');
      if RollbackOK then
        MsgBox('La validación falló. Se restauró la versión y la base de datos anteriores.', mbError, MB_OK)
      else
        MsgBox('La validación falló y la restauración automática también. Revise el registro del instalador antes de iniciar el sistema.', mbCriticalError, MB_OK);
      RaiseException('La instalación no superó la validación final.');
    end;
  end;
end;
