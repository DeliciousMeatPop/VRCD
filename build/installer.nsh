; Custom NSIS hooks for VR CyberDeck
; Included by electron-builder via nsis.include.

!macro customUnInstall
  ; The stock uninstaller only removes the install directory.
  ; This cleans up the Electron userData folder (%APPDATA%\vr-cyberdeck)
  ; so that a reinstall always starts from a known-good state.
  ; The user's downloads folder is intentionally preserved.
  ;
  ; IMPORTANT: electron-builder's one-click installer runs THIS uninstaller as
  ; part of an update too — the new setup silently uninstalls the previous
  ; version before installing the new one. If we wipe userData during that step
  ; the user loses every localStorage-backed setting on every update (Disable
  ; All Extras, Colorblind Mode, Sound Effects, accent color, font, …), since
  ; those live in "Local Storage" while settings.json / mirrors.json sit in the
  ; userData root. Only clean up on a genuine, user-initiated uninstall.
  ${ifNot} ${isUpdated}
    RMDir /r "$APPDATA\vr-cyberdeck\bin"
    RMDir /r "$APPDATA\vr-cyberdeck\vrp-data"
    RMDir /r "$APPDATA\vr-cyberdeck\Cache"
    RMDir /r "$APPDATA\vr-cyberdeck\Code Cache"
    RMDir /r "$APPDATA\vr-cyberdeck\GPUCache"
    RMDir /r "$APPDATA\vr-cyberdeck\DawnWebGPUCache"
    RMDir /r "$APPDATA\vr-cyberdeck\DawnCache"
    RMDir /r "$APPDATA\vr-cyberdeck\Session Storage"
    RMDir /r "$APPDATA\vr-cyberdeck\Local Storage"
    RMDir /r "$APPDATA\vr-cyberdeck\IndexedDB"
    RMDir /r "$APPDATA\vr-cyberdeck\blob_storage"
    RMDir /r "$APPDATA\vr-cyberdeck\logs"
    Delete "$APPDATA\vr-cyberdeck\Preferences"
    Delete "$APPDATA\vr-cyberdeck\Network Persistent State"
    Delete "$APPDATA\vr-cyberdeck\CrashpadMetrics-spare.pma"
    ; Remove the userData dir itself only if empty (won't touch downloads\)
    RMDir "$APPDATA\vr-cyberdeck"
  ${endIf}
!macroend
