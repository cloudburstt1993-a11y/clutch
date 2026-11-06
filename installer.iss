; Inno Setup script for the Clutch installer (built by build_installer.bat)
#define AppName "Clutch"
#ifndef AppVersion
#define AppVersion "11.0"
#endif

[Setup]
AppId={{6E2B9C4A-1F3D-4B7E-9A55-C1D7E8F20A47}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Clutch
DefaultDirName={autopf}\Clutch
DefaultGroupName=Clutch
DisableProgramGroupPage=yes
OutputDir=installer_output
OutputBaseFilename=Clutch-Setup-{#AppVersion}
SetupIconFile=assets\clutch.ico
UninstallDisplayIcon={app}\Clutch.exe
UninstallDisplayName=Clutch
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
CloseApplications=force
; Code signing: build_installer.bat turns this on when the CLUTCH_SIGN variable is set (see README).
#ifdef SIGN
SignTool=clutchsign
SignedUninstaller=yes
#endif

[Tasks]
Name: "desktopicon"; Description: "Put a Clutch shortcut on the desktop"; GroupDescription: "Shortcuts:"
Name: "autostart"; Description: "Start Clutch in the background when Windows starts"; GroupDescription: "Startup:"

[Files]
Source: "dist\Clutch\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Clutch"; Filename: "{app}\Clutch.exe"
Name: "{autodesktop}\Clutch"; Filename: "{app}\Clutch.exe"; Tasks: desktopicon

[Registry]
; Clean up the "start with Windows" entry on uninstall (written by Clutch itself for the signed-in user)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "Clutch"; Flags: uninsdeletevalue

[Run]
Filename: "msiexec.exe"; Parameters: "/i ""{app}\_internal\vgamepad\win\vigem\install\x64\ViGEmBusSetup_x64.msi"" /passive /norestart"; StatusMsg: "Installing the virtual controller driver (ViGEmBus)..."; Check: NeedsViGEm; Flags: waituntilterminated
Filename: "{app}\Clutch.exe"; Parameters: "--set-autostart"; Flags: runasoriginaluser waituntilterminated; Tasks: autostart
Filename: "{app}\Clutch.exe"; Description: "Open Clutch now"; Flags: nowait postinstall skipifsilent runasoriginaluser
; After a one-click update (silent install) Clutch starts again by itself
Filename: "{app}\Clutch.exe"; Parameters: "--background"; Flags: nowait runasoriginaluser; Check: WizardSilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/im Clutch.exe /f"; Flags: runhidden; RunOnceId: "StopClutch"

[Code]
function NeedsViGEm: Boolean;
begin
  Result := (not RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\ViGEmBus'))
            and FileExists(ExpandConstant('{app}\_internal\vgamepad\win\vigem\install\x64\ViGEmBusSetup_x64.msi'));
end;
