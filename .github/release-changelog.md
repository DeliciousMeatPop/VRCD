**Bug Fixes**
- Fixed an issue where upgrading from an older version left stale binaries and cached files behind in `%APPDATA%\vr-cyberdeck\`, causing game list refresh failures and other broken behaviour — particularly on Windows 11. The Windows uninstaller now removes these leftover files automatically on uninstall.
- Fixed the bundled `7za.exe` not being refreshed on upgrade, which could cause extraction failures if the old binary was retained from a previous version.
- Fixed ADB staying alive as a zombie process after closing the app on macOS, causing Little Snitch and similar tools to flag background network activity. ADB is now explicitly shut down on quit.
- Improved the "Failed to refresh games" error message when rclone returns an unexpected server response — now hints at antivirus / VPN interference and points to the Reset App Data option.

**New**
- Added **Reset App Data** button under Other Settings → `// RESET APP DATA`. Clears cached files, old binaries, and stored app state without touching your downloaded games. Use this if the app is misbehaving after an upgrade and you don't want to do a full reinstall.
