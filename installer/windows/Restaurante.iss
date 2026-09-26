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
; Evita que SetupLdr extraiga y ejecute el motor del instalador desde %TEMP%.
; Algunos equipos del restaurante bloquean por directiva cualquier ejecutable
; lanzado desde una carpeta temporal. El paquete resultante es multifichero y
; debe distribuirse completo (Setup.exe + Setup-*.bin).
UseSetupLdr=no
WizardStyle=modern
SetupLogging=yes
UninstallDisplayName=Restaurante
CloseApplications=yes
RestartApplications=no

[Files]
Source: "prepare-update.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion
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
Filename: "http://127.0.0.1:8080/"; Description: "Abrir Restaurante"; Flags: shellexec nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\schtasks.exe"; Parameters: "/End /TN ""Restaurante POS"""; Flags: runhidden waituntilterminated; RunOnceId: "StopTask"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /F /TN ""Restaurante POS"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteTask"

[Code]
var
  HadPreviousInstall: Boolean;
  RestoreTaskOnExit: Boolean;

function PreviousInstallExists: Boolean;
var
  ResultCode: Integer;
begin
  Result := FileExists(ExpandConstant('{app}\restaurante.exe')) and
    (FileExists(ExpandConstant('{app}\install-success.marker')) or
      (Exec(ExpandConstant('{sys}\schtasks.exe'), '/Query /TN "Restaurante POS"',
        '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0)));
end;

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
  PrepareScript: String;
begin
  Result := '';
  HadPreviousInstall := PreviousInstallExists;
  if HadPreviousInstall then begin
    Exec(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "Restaurante POS"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    RestoreTaskOnExit := True;
    PrepareScript := ExpandConstant('{app}\installer\prepare-update.ps1');
    if not FileExists(PrepareScript) then begin
      Result := 'La instalación anterior no contiene el componente de respaldo. Ejecute primero el instalador de transición o contacte a soporte.';
      exit;
    end;
    if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
      PrepareScript + '" -InstallDir "' +
      ExpandConstant('{app}') + '" -DataDir "' + ExpandConstant('{commonappdata}\Restaurante') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      begin
        Exec(ExpandConstant('{sys}\schtasks.exe'), '/Run /TN "Restaurante POS"',
          '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Result := 'No se pudo crear el respaldo previo. La instalación no continuará.';
      end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  VerifyOK, StartedOK, RollbackOK: Boolean;
  LogPath, Failure: String;
begin
  if CurStep = ssPostInstall then begin
    LogPath := ExpandConstant('{commonappdata}\Restaurante\logs\install.log');
    VerifyOK := Exec(ExpandConstant('{app}\restaurante.exe'),
      '-verify-install -ui-dir "' + ExpandConstant('{app}\ui') + '" -migrations-dir "' +
      ExpandConstant('{app}\migrations') + '" -data-dir "' + ExpandConstant('{commonappdata}\Restaurante') +
      '" -log-file "' + LogPath + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
    Log('Restaurante: resultado de validación = ' + IntToStr(ResultCode));
    StartedOK := False;
    if VerifyOK then
      StartedOK := RunPowerShell('register-task.ps1', '-InstallDir "' + ExpandConstant('{app}') +
        '" -DataDir "' + ExpandConstant('{commonappdata}\Restaurante') + '"');
    if VerifyOK then
      Log('Restaurante: tarea y servidor disponibles = ' + IntToStr(Ord(StartedOK)));
    if not VerifyOK or not StartedOK then begin
      if not VerifyOK then
        Failure := 'No se pudo validar la base de datos y los archivos instalados.'
      else
        Failure := 'El servidor no inició o no respondió en 127.0.0.1:8080.';
      RollbackOK := True;
      if HadPreviousInstall then
        RollbackOK := RunPowerShell('rollback-update.ps1', '-InstallDir "' + ExpandConstant('{app}') +
          '" -DataDir "' + ExpandConstant('{commonappdata}\Restaurante') + '"');
      if HadPreviousInstall and not RollbackOK then
        RestoreTaskOnExit := False;
      if not HadPreviousInstall then begin
        Exec(ExpandConstant('{sys}\schtasks.exe'), '/End /TN "Restaurante POS"',
          '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        Exec(ExpandConstant('{sys}\schtasks.exe'), '/Delete /F /TN "Restaurante POS"',
          '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      end;
      if HadPreviousInstall then begin
        if RollbackOK then
          Failure := Failure + ' Se restauró la instalación anterior.'
        else
          Failure := Failure + ' También falló la restauración de la instalación anterior.';
      end else
        Failure := Failure + ' Era una primera instalación: no había una base anterior que restaurar.';
      RaiseException(Failure + ' Revise ' + LogPath + ' y el registro de Setup.');
    end;
    if not SaveStringToFile(ExpandConstant('{app}\install-success.marker'), 'ok', False) then
      RaiseException('No se pudo guardar la confirmación de instalación.');
    RestoreTaskOnExit := False;
  end;
end;

procedure DeinitializeSetup;
var
  ResultCode: Integer;
begin
  if RestoreTaskOnExit then begin
    Exec(ExpandConstant('{sys}\schtasks.exe'), '/Run /TN "Restaurante POS"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Log('Restaurante: reanudación tras cancelar actualización = ' + IntToStr(ResultCode));
  end;
end;
