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
2. `native.js` calls Windows directly (through the [koffi](https://koffi.dev) library) to focus `SkyrimSE.exe`. It opens the console with the scan code for `~` and types `bat dovahtrainer`, then Enter, then closes the console.
3. Keys go through `SendInput` with `KEYEVENTF_SCANCODE`. Skyrim reads input through DirectInput, and DirectInput only sees scan codes, so plain virtual keys wouldn't work.

The trainer never reads or monitors the keyboard. There's no PowerShell, no keyboard hook and no key-state polling. Earlier versions used those, and antivirus software such as Bitdefender flagged them as a keylogger. Hotkeys are standard Windows hotkeys (`RegisterHotKey`), the same kind Discord or OBS use.

## Keeping cheats on (death, restarts)

- The trainer remembers which cheats you turned on, even after you close and reopen it (stored in `%APPDATA%\Dovah Trainer\config.json`).
- **Dying** reloads your last save, which drops stat cheats such as Infinite Magicka, Speed, Crit and One-Hit Kills. When you return to the game from the trainer, it re-applies them. It also saves to a `DovahCheats` slot, so the next death reloads a save that still has them. You can switch the checkpoint save off in Settings. God Mode, No Clip and other console toggles survive death by themselves.
- **Restarting Skyrim** resets everything. The next time you open the trainer, it re-applies all your cheats once.
- **Restore my cheats** in the sidebar (or in the tray menu) re-applies everything on demand.

## Quests

- Pick a quest from the Main Quest, Companions, College, Thieves Guild or Dark Brotherhood list, then use **Complete** (`completequest <id>`) or **Go to objective** (`movetoqt <id>`). The IDs come from UESP.
- **Quest by ID** works for any quest, including side and Daedric quests.
- Completing a quest by console can skip rewards that are handed out in dialogue, and the next quest might not start. Quick Save first.
- **Complete ALL Quests** (`caqs`) breaks a save. Only use it on a throwaway save.

## Crime, inventory and game tools

- **Remove All Bounties** clears every hold's bounty with `player.paycrimegold 0 0 <faction>`, so there's no jail and you keep stolen items. You can also clear one hold, or **Call Off the Guards** to clear bounties and stop anyone already attacking you (`player.stopcombatalarm`).
- **Quick Junk Removal** (Inventory tab) deletes 29 kinds of worthless clutter, such as bowls, plates, baskets, buckets, tools and empty bottles. It uses FormIDs from UESP's *Skyrim:Miscellaneous Items* list. Crafting materials, gems and quest items are never touched. **Remove Sellable Clutter** also removes candlesticks, Dwemer tableware and instruments.
- **Game Tools:** quick save and load to a `DovahQuick` slot, hide the HUD for screenshots, slow motion (`sgtm`), and free memory (`pcb`).

## In-game overlay

The trainer runs as an overlay on top of Skyrim, not as a separate window.

- **To open it in game, press Alt+Tab and pick "Dovah Trainer"**, or click its taskbar button. **Esc**, the ✕ button, or clicking the dimmed game behind the panel takes you back to the game.
- Why not a hotkey like Insert? Skyrim takes the keyboard exclusively, so normal Windows hotkeys never reach other programs while you play. The only way around that is watching the keyboard yourself, which antivirus treats as keylogger behaviour. The trainer doesn't do that.
- The panel stays on top of the game. Quit from the tray icon or **Settings → Quit trainer**.
- Launching it a second time just opens the existing overlay.
- **Skyrim must run in Borderless Windowed.** Nothing can draw over exclusive fullscreen. If yours is in fullscreen, the trainer shows a banner with a **Switch to Borderless** button. That button edits `SkyrimPrefs.ini` and saves a `.dovah-backup` copy first. Close Skyrim before using it.

## Waypoints and dialogue (World tab)

- **Unlock All Waypoints** runs `tmm 1,1,1`: every map marker, hidden ones included, becomes discovered, so you can fast travel anywhere. Only loading an older save undoes it.
- **Reveal Map Only** runs `tmm 1,0,1`: markers show on the map but stay undiscovered.
- **Dialogue skipping:** vanilla Skyrim has no setting to speed up dialogue, but it skips the current NPC line when you press Activate, as long as **dialogue subtitles are on**. The trainer presses Activate for you:
  - When a conversation starts, Alt+Tab to the trainer, turn on **Auto-Skip Dialogue**, then press Esc. It presses Activate about once a second and also picks the highlighted reply. It stops after 45 seconds, and only presses keys while Skyrim is the active window.
  - The World tab shows whether subtitles are on. To turn them on while playing, go to System › Settings › Display › Dialogue Subtitles.
  - For instant skipping of lines that can't normally be skipped, you'd need an SKSE plugin such as *Instantly Skip Dialogue*.

## Tips

- If the console doesn't open (non-US keyboard), change **Settings → Console key scan code**.
- If commands get cut off, raise **Key delay**.
- Cheat hotkeys **F1–F4, F6–F8 and F10** work while the trainer is open (Skyrim blocks them while you play). They're only registered while the trainer or Skyrim is the active window, so F-keys work normally in other apps.
- Toggles like Infinite Magicka use `modav`, and `modav` changes are kept in your save. Use **Turn off all toggles** before you save if you want a clean character.
- Achievements: the console doesn't disable achievements, and this trainer loads no plugins. The Achievements tab only makes real in-game progress happen (skill-ups and level-ups), and the game decides what to award. To unlock achievements directly, use Steam Achievement Manager.

## Files

| File | Purpose |
| --- | --- |
| `main.js` | Window, game-folder auto-detect (Steam registry + `libraryfolders.vdf`), batch writing, hotkeys |
| `preload.js` | Safe IPC bridge (`window.trainer`) |
| `native.js` | Win32 calls: find and focus Skyrim, type scan codes, poll hotkeys |
| `renderer/cheats.js` | All cheat definitions and the shop catalogue. Add features here |
| `renderer/app.js` | UI logic, animations, toasts, embers |
| `renderer/styles.css` | Theme |
