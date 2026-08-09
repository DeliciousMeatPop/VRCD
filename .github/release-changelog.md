**Sideloader-first**

- VR CyberDeck now runs as a pure sideloader out of the box — no server, no account, no setup, nothing phoning home. Launch it, plug in your headset, and go.
- The game list has been replaced by a drag-and-drop install deck front and center over the new cyberdeck background. Drop an APK, a `.zip`, a game folder (APK + OBB + `install.txt`), or an OBB folder named after its package, and it deploys to the headset.
- Beveled, non-rectangular sci-fi controls for Install APK, Install Folder, Copy OBB, ADB Shell, Installs, Manage Remotes, and Other Settings.
- Drops are routed automatically: APKs / ZIPs / game folders install, and a folder named after a package is copied in as OBB data.

**Optional server**

- Prefer a browsable library? You can add your own server under **Manage Remotes** — either a server config or your own rclone config. Add one and the full library view (search, sort, card/table, update badges) comes right back. Don't have one? Just use it as a sideloader — that's the whole point.
- The old always-on bundled server has been removed. A server is now entirely opt-in: either you know one, or you don't need one.

**Cleanup**

- Removed the donation banner and the extra community links.
- GitHub link now points to the current repository.
