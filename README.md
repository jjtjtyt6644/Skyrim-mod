# Dovah Trainer — Skyrim Special Edition

An Electron trainer for single-player Skyrim SE: animated UI, global hotkeys, shop, console. It doesn't need SKSE or plugins.

## Download

Grab `DovahTrainer-Setup-x.y.z.exe` from [Releases](https://github.com/jjtjtyt6644/Skyrim-mod/releases/latest) and run it. It installs in a few seconds and adds a desktop shortcut.
The exe isn't code-signed, so Windows SmartScreen may warn. Click **More info → Run anyway**.

**Auto-update:** the app checks this repo's GitHub Releases on launch and every hour. It downloads new versions in the background, then shows a gold **Restart to update** button in the title bar. If you skip that, the update installs the next time you quit.

## Develop

```bash
npm install
npm start
```

## Publish a release

1. Bump `version` in `package.json`. The updater ignores a release with the same version.
2. `npm run dist`
3. `gh release create vX.Y.Z dist/DovahTrainer-Setup-X.Y.Z.exe dist/DovahTrainer-Setup-X.Y.Z.exe.blockmap dist/latest.yml --title "vX.Y.Z" --notes "..."`

`latest.yml` must be attached, because the updater reads it to find the new version.

## How it works

1. You click a cheat. The app writes its console commands to `<Skyrim folder>\dovahtrainer.txt`.
2. `bridge/SkyrimBridge.ps1` (a small C# helper compiled on the fly by PowerShell) focuses `SkyrimSE.exe`. It opens the console with the scan code for `~` and types `bat dovahtrainer`, then Enter, then closes the console.
3. Keys go through `SendInput` with `KEYEVENTF_SCANCODE`. Skyrim reads input through DirectInput, and DirectInput only sees scan codes, so plain virtual keys wouldn't work.

## In-game overlay

The trainer runs as an overlay on top of Skyrim, not as a separate window.

- Press **Insert** anywhere to open or close it. **Esc**, the ✕ button, or clicking the dimmed game behind the panel also closes it.
- It stays on top of the game and doesn't show in the taskbar. Quit from the tray icon or **Settings → Quit trainer**.
- Launching it a second time just opens the existing overlay.
- **Skyrim must run in Borderless Windowed.** Nothing can draw over exclusive fullscreen. If yours is in fullscreen, the trainer shows a banner with a **Switch to Borderless** button. That button edits `SkyrimPrefs.ini` and saves a `.dovah-backup` copy first. Close Skyrim before using it.

## Tips

- If the console doesn't open (non-US keyboard), change **Settings → Console key scan code**.
- If commands get cut off, raise **Key delay**.
- Hotkeys are **Ctrl+F1 – Ctrl+F8**. Plain F-keys would clash with quicksave and quickload.
- Toggles like Infinite Magicka use `modav`, and `modav` changes are kept in your save. Use **Turn off all toggles** before you save if you want a clean character.
- Achievements: the console doesn't disable achievements, and this trainer loads no plugins. The Achievements tab only makes real in-game progress happen (skill-ups and level-ups), and the game decides what to award. To unlock achievements directly, use Steam Achievement Manager.

## Files

| File | Purpose |
| --- | --- |
| `main.js` | Window, game-folder auto-detect (Steam registry + `libraryfolders.vdf`), batch writing, hotkeys |
| `preload.js` | Safe IPC bridge (`window.trainer`) |
| `bridge/SkyrimBridge.ps1` | Focus + scan-code typing helper |
| `renderer/cheats.js` | All cheat definitions and the shop catalogue. Add features here |
| `renderer/app.js` | UI logic, animations, toasts, embers |
| `renderer/styles.css` | Theme |
