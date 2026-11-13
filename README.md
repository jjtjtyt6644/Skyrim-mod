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
- **Stat cheats** (Infinite Magicka/Stamina, Regen, Carry Weight, Crit, One-Hit Kills, Speed) use `forceav`. It sets an exact value through the saved "script" modifier, the same one `modav` uses, so the cheats survive saves, autosaves, doors, cells and quest ends, and re-applying never stacks. Versions 1.3 and 1.4 used `setav`, which Skyrim wipes on every save, so cheats vanished when you entered a building or finished a quest.
- **Dying** reloads your last save. Stat cheats are kept in later saves, and every trainer auto-save also re-applies them. Going back to the game from the trainer re-applies them too. God Mode, No Clip and other console toggles survive death by themselves.
- **Restarting Skyrim:** after about 90 seconds of playing in the new session, the trainer re-applies all your cheats automatically. **Restore my cheats** does it on demand.
- **Restore my cheats** in the sidebar (or in the tray menu) re-applies everything on demand.

## Saves & Fixes

- **Auto-Save** (on by default) saves every 5, 10, 15 or 30 minutes into rotating slots `DovahAuto1` to `DovahAuto3`. It only saves while Skyrim is the active window and the panel is closed. The trainer can't read your health, so it can't save at the exact moment before you die; a timed save means a death or crash costs a few minutes at most.
- **Crash watch:** if Skyrim closes unexpectedly, the trainer tells you which save to load.
- **One-click bug fixes.** Sources: UESP's *Skyrim:Bugs* page and Nexus/Steam threads.
  - Stuck controls: `enableplayercontrols`.
  - Stuck crouching, sitting or at a workbench: `player.tai` ×2.
  - Stuck in a wall: `tcl`.
  - "Can't save with enemies nearby": `player.stopcombatalarm`.
  - Combat music won't stop: `removemusic muscombat`.
  - Broken character model: `player.sexchange` ×2.
  - Stuck walking slowly.
  - Lingering paralysis: `player.dispelallspells`.
  - Restart a bugged quest: `resetquest`.
  - **Fix All Common Bugs** runs the safe ones together.

## Mods

- Lists your plugins, with on/off switches that edit `%LOCALAPPDATA%\Skyrim Special Edition\plugins.txt`.
- **Install a mod from file** takes a .zip or .7z, extracted with the bundled 7-Zip. It finds the Data folder inside the archive, copies the files and enables the plugins. It never overwrites existing files, and refuses installer (FOMOD) mods; use Vortex or MO2 for those. Mods installed this way can be uninstalled cleanly.
- **Nexus Mods:** paste your personal API key to browse Trending, Latest and Recently updated mods, then open them on Nexus. Adult-flagged mods are hidden. Direct downloads through the API need Nexus Premium, so download from the mod page and use **Install a mod from file**.
- Mod plugins turn off Steam achievements, and many mods need SKSE.

## Quests

- 395 quests with 2,177 stages are bundled in `renderer/quests-data.js`. They come from the "Quest Stages" tables on UESP and cover the Main Quest, Dawnguard, Dragonborn, the Civil War (both sides), the Companions, the College, the Thieves Guild, the Dark Brotherhood, Daedric, Divine, Side and Dungeon quests. UESP's ✓ "Finishes quest" and ✗ "Fails quest" markers are kept, so the trainer knows the proper ending of each quest.
- **Finish properly** runs `setstage <id> <ending stage>`, which runs the quest's own ending script, the same one that fires when you finish it yourself. That gives the rewards and starts the next quest. (`completequest` only marks a quest done without running its scripts, so the trainer doesn't use it anymore.)
- **Next step** and **Jump here** move a quest one stage at a time. Each stage runs its own script, so items and NPCs are set up as if you played that part. Use this when you want everything a quest gives along the way.
- **Start quest** (`startquest`) and **Go to objective** (`movetoqt`) are there too. Every quest change first saves to `DovahQuestBackup`.
- **Complete ALL Quests** (`caqs`) breaks a save. Only use it on a throwaway save.

## Crime, inventory and game tools

- **Remove All Bounties** clears every hold's bounty with `player.paycrimegold 0 0 <faction>`, so there's no jail and you keep stolen items. You can also clear one hold, or **Call Off the Guards** to clear bounties and stop anyone already attacking you (`player.stopcombatalarm`).
- **Quick Junk Removal** (Inventory tab) deletes 29 kinds of worthless clutter, such as bowls, plates, baskets, buckets, tools and empty bottles. It uses FormIDs from UESP's *Skyrim:Miscellaneous Items* list. Crafting materials, gems and quest items are never touched. **Remove Sellable Clutter** also removes candlesticks, Dwemer tableware and instruments.
- **Game Tools:** quick save and load to a `DovahQuick` slot, hide the HUD for screenshots, slow motion (`sgtm`), and free memory (`pcb`).

## In-game overlay

The trainer runs as an overlay on top of Skyrim, not as a separate window.

- The trainer always stays on top and never closes by itself. **Esc** or **✕** minimizes it to a small floating **Dovah Trainer** button in the top-right corner. Click the button to open the panel again.
- Everywhere outside the panel or button is click-through, so the game underneath gets your clicks.
- Why no hotkey like Insert? Skyrim takes the keyboard exclusively, so normal Windows hotkeys never reach other programs while you play. The only way around that is watching the keyboard yourself, which antivirus treats as keylogger behaviour. The trainer doesn't do that.
- Quit from the tray icon or **Settings → Quit trainer**.
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
