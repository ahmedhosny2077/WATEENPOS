; WATEEN POS - NSIS Installer Hooks
; Installs VC++ Redistributable if missing (Full/Offline build only)

!macro CUSTOM_HEADER
  !include "MUI2.nsh"
  !include "x64.nsh"
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Check if Visual C++ Redistributable 2015-2022 (x64) is installed
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
  ${If} $0 != "1"
    ; Also check WoW6432Node for 64-bit systems
    ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
  ${EndIf}
  
  ${If} $0 != "1"
    ; VC++ Redistributable not found - install it silently
    DetailPrint "Installing Visual C++ Redistributable..."
    SetDetailsPrint listonly
    
    ; Extract bundled vc_redist.x64.exe to temp
    File "/oname=$PLUGINSDIR\vc_redist.x64.exe" "${NSISDIR}\..\prerequisites\vc_redist.x64.exe"
    
    ; Run silently
    nsExec::ExecToLog '"$PLUGINSDIR\vc_redist.x64.exe" /install /quiet /norestart'
    Pop $1
    
    ${If} $1 != "0"
      ; Non-zero exit but don't block installation - might need reboot
      DetailPrint "VC++ Redistributable install returned code: $1 (may require restart)"
    ${Else}
      DetailPrint "Visual C++ Redistributable installed successfully."
    ${EndIf}
    
    SetDetailsPrint both
  ${Else}
    DetailPrint "Visual C++ Redistributable already installed."
  ${EndIf}
!macroend
