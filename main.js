// Dovah Trainer — Electron main process.
// Runs as an in-game overlay (transparent, always-on-top, opened via Alt+Tab).
// Cheats are written to <Skyrim>\dovahtrainer.txt and native.js types
// "bat dovahtrainer" into the game console.
const { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog, screen, Tray, Menu, nativeImage } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const native = require('./native');

const BAT_NAME = 'dovahtrainer';
const TOGGLE_KEY = 'Insert';
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = {
  gamePath: '', consoleScan: 0x29, activateScan: 0x12, keyDelay: 45, hotkeys: true,
  // Active cheat toggles, remembered across trainer restarts: { key: 'save' | 'session' }.
  //   save    = actor-value cheats stored in the save; lost when a save is (re)loaded, e.g. after death
  //   session = console toggles (tgm, tcl...) that survive loads but reset when Skyrim restarts
  toggles: {},
  appliedPid: 0,     // Skyrim process the session toggles were last applied to
  checkpoint: true,  // save "DovahCheats" after re-applying, so dying reloads a save that has them
};
const REAPPLY_GAP_MS = 60 * 1000;
const ALLOWED_LINKS = new Set([
  'https://github.com/gibbed/SteamAchievementManager',
  'https://en.uesp.net/wiki/Skyrim:Console',
  'https://github.com/jjtjtyt6644/Skyrim-mod/releases',
]);

// One trainer at a time — launching again just opens the overlay.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
let tray = null;
let overlayOpen = false;
let quitting = false;
let config = { ...DEFAULTS };

// ---------- config ----------
function loadConfig() {
  try { config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')) }; }
  catch { config = { ...DEFAULTS }; }
}
function saveConfig() {
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2));
}

// ---------- game path detection ----------
const isGameDir = (p) => !!p && fs.existsSync(path.join(p, 'SkyrimSE.exe'));

function regQuery(key, value) {
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/v', value], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null);
      const m = out.match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`));
      resolve(m ? m[1].trim() : null);
    });
  });
}

async function detectGamePath() {
  const candidates = [];
  const steam = await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (steam) {
    const vdf = path.join(steam, 'steamapps', 'libraryfolders.vdf');
    candidates.push(steam);
    try {
      for (const m of fs.readFileSync(vdf, 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) candidates.push(m[1].replace(/\\\\/g, '\\'));
    } catch { /* no library file */ }
  }
  const installed = await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Bethesda Softworks\\Skyrim Special Edition', 'installed path');
  if (isGameDir(installed)) return installed;
  for (const d of ['C', 'D', 'E', 'F']) candidates.push(`${d}:\\SteamLibrary`, `${d}:\\Program Files (x86)\\Steam`);
  for (const lib of candidates) {
    const p = path.join(lib, 'steamapps', 'common', 'Skyrim Special Edition');
    if (isGameDir(p)) return p;
  }
  return '';
}

// ---------- display mode (overlay needs borderless windowed) ----------
function prefsPath() {
  for (const n of ['Skyrim Special Edition', 'Skyrim Special Edition GOG', 'Skyrim Special Edition EPIC', 'Skyrim Special Edition MS']) {
    const p = path.join(app.getPath('documents'), 'My Games', n, 'SkyrimPrefs.ini');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readDisplay() {
  const p = prefsPath();
  if (!p) return { found: false, mode: 'unknown', subtitles: true };
  const t = fs.readFileSync(p, 'utf8');
  const full = /^\s*bFull Screen\s*=\s*1/im.test(t);
  const borderless = /^\s*bBorderless\s*=\s*1/im.test(t);
  const subtitles = !/^\s*bDialogueSubtitles\s*=\s*0/im.test(t);
  return { found: true, mode: full ? 'fullscreen' : borderless ? 'borderless' : 'windowed', subtitles };
}

// Edit SkyrimPrefs.ini (game must be closed; it rewrites the file on exit). Backs up once.
async function setPrefs(section, pairs) {
  const p = prefsPath();
  if (!p) return { ok: false, error: 'SkyrimPrefs.ini not found. Start Skyrim once first.' };
  if (native.gameRunning()) return { ok: false, error: 'Close Skyrim first. The game overwrites this file when it exits.' };
  let t = fs.readFileSync(p, 'utf8');
  const backup = p + '.dovah-backup';
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, t);
  const header = new RegExp(`^\\[${section}\\]\\s*$`, 'im');
  for (const [key, val] of pairs) {
    const re = new RegExp(`^(\\s*${key}\\s*=\\s*)\\S*`, 'im');
    if (re.test(t)) t = t.replace(re, (_m, pre) => pre + val);
    else if (header.test(t)) t = t.replace(header, (m) => `${m}\r\n${key}=${val}`);
    else t += `\r\n[${section}]\r\n${key}=${val}\r\n`;
  }
  fs.writeFileSync(p, t);
  return { ok: true };
}

const makeBorderless = () => setPrefs('Display', [['bFull Screen', '0'], ['bBorderless', '1']]);
const enableSubtitles = () => setPrefs('Interface', [['bDialogueSubtitles', '1']]);

// ---------- game input ----------
const hwnd = () => (win ? Number(win.getNativeWindowHandle().readBigUInt64LE(0)) : 0);

async function runCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) return { ok: false, error: 'No commands' };
  if (!isGameDir(config.gamePath)) return { ok: false, error: 'Set your Skyrim folder in Settings first' };
  const clean = commands.map((c) => String(c).replace(/[\r\n]/g, ' ').trim()).filter(Boolean);
  try {
    fs.writeFileSync(path.join(config.gamePath, `${BAT_NAME}.txt`), clean.join('\r\n') + '\r\n');
  } catch (e) {
    return { ok: false, error: `Could not write batch file: ${e.message}` };
  }
  // While the overlay is open, hand focus back to it afterwards so the mouse stays usable.
  const returnTo = overlayOpen ? hwnd() : 0;
  dbg('run start', clean, { returnTo, holdCount });
  try {
    return await holdOpen(() => native.runBat(BAT_NAME, {
      consoleScan: Number(config.consoleScan) | 0, delay: Number(config.keyDelay) | 0, returnTo,
    }));
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------- keeping cheats on ----------
// Dying reloads your last save, which drops actor-value cheats ('save' kind); restarting
// Skyrim also drops console toggles ('session' kind). The renderer owns the cheat
// definitions; we decide *when* to re-apply and ask it to do so.
let lastReapply = 0;
let checkpointDirty = false;

function maybeReapply(when) {
  const pid = native.gamePid();
  const active = Object.values(config.toggles || {});
  if (!pid || !win) return;
  const newSession = pid !== config.appliedPid;
  if (!active.length) {
    if (newSession) { config.appliedPid = pid; saveConfig(); } // nothing to apply
    return;
  }
  const hasSave = active.includes('save');
  if (newSession) {
    // Skyrim was (re)started: everything needs applying once.
    lastReapply = Date.now();
    win.webContents.send('reapply', { full: true, checkpoint: false });
  } else if (when === 'return' && hasSave && (checkpointDirty || Date.now() - lastReapply > REAPPLY_GAP_MS)) {
    // Back to the game: refresh save-stored cheats (covers a death reload) and save a
    // checkpoint so the next death reloads a save that still has them.
    lastReapply = Date.now();
    checkpointDirty = false;
    win.webContents.send('reapply', { full: false, checkpoint: !!config.checkpoint });
  }
}

// ---------- overlay ----------
// The overlay closes when you go back to Skyrim, but not when some other app (Discord,
// Medal, Overwolf, a notification) briefly takes focus — that used to make it vanish.
let holdCount = 0;
const dbg = (...a) => { if (process.env.DOVAH_DEBUG) console.log(new Date().toISOString().slice(17, 23), ...a); };
async function holdOpen(fn) {
  holdCount++;
  try { return await fn(); }
  finally { setTimeout(() => { holdCount--; }, 400); }
}
function fitToScreen() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  win.setBounds(d.bounds);
}

async function showOverlay() {
  if (!win) return;
  fitToScreen();
  overlayOpen = true;
  win.setAlwaysOnTop(true, 'screen-saver');
  await holdOpen(async () => {
    win.show();
    win.focus();
    win.webContents.send('overlay', true);
    // Skyrim holds the foreground; take it back so the cursor is freed.
    await native.focusWindow(hwnd());
  });
  dbg('showOverlay done', { visible: win.isVisible(), minimized: win.isMinimized(), focused: win.isFocused() });
  maybeReapply('open');
}

function hideOverlay(returnToGame = true) {
  dbg('hideOverlay', { returnToGame, overlayOpen, holdCount });
  if (!win || !overlayOpen) return;
  overlayOpen = false;
  win.webContents.send('overlay', false);
  setTimeout(async () => {
    if (overlayOpen) return; // reopened during the animation
    win.hide();
    // Back to the game; an error just means it isn't running.
    if (returnToGame) await native.focusGame();
    maybeReapply('return');
  }, 180);
}

const toggleOverlay = () => (overlayOpen ? hideOverlay() : showOverlay());

// ---------- dialogue skipping ----------
// Vanilla Skyrim skips the current NPC line when you press Activate (subtitles on).
// Auto-Skip presses Activate about once a second, only while Skyrim is the active
// window, and stops itself after 45 seconds. (The trainer never reads the keyboard,
// so it can't notice you walking away; the short timeout keeps it safe.)
const AUTO_SKIP_MS = 45 * 1000;
const skip = { auto: false, autoUntil: 0, timer: null, busy: false };

function setAutoSkip(on, reason) {
  skip.auto = on;
  skip.autoUntil = Date.now() + AUTO_SKIP_MS;
  win?.webContents.send('autoskip', { on, reason });
  clearInterval(skip.timer);
  skip.timer = on ? setInterval(skipTick, 950) : null;
  if (on) skipTick();
  if (!overlayOpen && reason === 'hotkey') {
    tray?.displayBalloon({ iconType: 'info', title: on ? 'Auto-Skip ON' : 'Auto-Skip OFF', content: on ? 'Skipping dialogue for 45 seconds. Press F11 to stop.' : 'Dialogue skipping stopped.' });
  }
}

async function skipTick() {
  if (Date.now() > skip.autoUntil) return setAutoSkip(false, 'timeout');
  if (skip.busy) return; // a cheat command is being typed; don't interleave keys
  skip.busy = true;
  try { await native.tapIfGame(Number(config.activateScan) | 0); } catch { /* ignore */ } finally { skip.busy = false; }
}

// ---------- hotkeys ----------
// Standard Windows hotkeys (RegisterHotKey via globalShortcut): no keyboard hooks or
// key-state polling, which antivirus treats as keylogger behaviour. They are only
// registered while Skyrim or the trainer is the active window, so F-keys keep
// working normally in other apps. Each key is also registered with Shift held,
// since players often hold Shift (run) when pressing them.
// Plain F-keys, no Ctrl: Ctrl is Skyrim's sneak key. F5/F9 are quicksave/quickload.
const CHEAT_KEYS = ['F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F10'];
const OWN_PROCESS = path.parse(process.execPath).name; // "Dovah Trainer" (or "electron" in dev)
let hotkeysActive = false;

function bindKey(key, fn) {
  for (const accel of [key, `Shift+${key}`]) {
    try { globalShortcut.register(accel, fn); } catch { /* taken by another app */ }
  }
}

function setHotkeysActive(on) {
  if (on === hotkeysActive) return;
  hotkeysActive = on;
  globalShortcut.unregisterAll();
  if (!on) return;
  bindKey(TOGGLE_KEY, toggleOverlay);
  if (!config.hotkeys) return;
  for (const key of CHEAT_KEYS) bindKey(key, () => win?.webContents.send('hotkey', key));
}

// Check which app is in front twice a second (window focus only, never keys).
function startHotkeys() {
  setInterval(() => {
    let fg = '';
    try { fg = native.foregroundProcess(); } catch { /* ignore */ }
    setHotkeysActive(fg === 'SkyrimSE' || fg === OWN_PROCESS);
  }, 500);
}

function refreshHotkeys() { const was = hotkeysActive; hotkeysActive = !was; setHotkeysActive(was); }

// ---------- tray ----------
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Dovah Trainer: Alt+Tab to it in game');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / hide trainer', click: toggleOverlay },
    { label: 'Re-apply my cheats now', click: () => win?.webContents.send('reapply', { full: true, checkpoint: false }) },
    { type: 'separator' },
    { label: 'Quit Dovah Trainer', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', toggleOverlay);
}

// ---------- auto-updater (GitHub releases of jjtjtyt6644/Skyrim-mod) ----------
let autoUpdater = null;
function sendUpdate(state, extra = {}) { win?.webContents.send('update', { state, ...extra }); }

function setupUpdater() {
  if (!app.isPackaged) return; // dev runs have no release metadata
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate('checking'));
  autoUpdater.on('update-available', (i) => sendUpdate('available', { version: i.version }));
  autoUpdater.on('update-not-available', () => sendUpdate('latest', { version: app.getVersion() }));
  autoUpdater.on('download-progress', (p) => sendUpdate('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate('ready', { version: i.version }));
  autoUpdater.on('error', (e) => sendUpdate('error', { message: String(e?.message || e).split('\n')[0] }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 4000);
  setInterval(check, 60 * 60 * 1000);
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    show: false, frame: false, transparent: true, backgroundColor: '#00000000',
    skipTaskbar: true, resizable: false, movable: false, minimizable: false, maximizable: false,
    fullscreenable: false, hasShadow: false, alwaysOnTop: true,
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', async () => {
    // Don't pop up over a game in progress; just say how to open it.
    if (native.gameRunning()) {
      tray?.displayBalloon({ iconType: 'info', title: 'Dovah Trainer is running', content: 'In game, press Alt+Tab and pick "Dovah Trainer" to open it.' });
    } else {
      // Startup shuffles focus (tray, launcher); don't let that auto-hide the overlay.
      holdCount++;
      setTimeout(() => { holdCount--; }, 2500);
      showOverlay();
    }
  });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); hideOverlay(); } });
  // Focus already went somewhere else (game or another app): just get out of the way.
  win.on('focus', () => dbg('focus'));
  win.on('blur', () => {
    dbg('blur', { overlayOpen, holdCount });
    if (!overlayOpen || holdCount > 0) return;
    // Only close when the player actually went back to Skyrim. Pop-ups from Discord,
    // Medal, Overwolf etc. used to steal focus and make the trainer disappear.
    setTimeout(() => {
      if (!overlayOpen || holdCount > 0) return;
      let fg = '';
      try { fg = native.foregroundProcess(); } catch { /* ignore */ }
      if (fg === 'SkyrimSE') hideOverlay(false);
    }, 200);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// ---------- Alt+Tab / taskbar launcher ----------
// Skyrim takes the keyboard exclusively, so no normal hotkey reaches the trainer while
// you play, and watching the keyboard ourselves looks like a keylogger to antivirus.
// Instead, a minimized "Dovah Trainer" window sits in the taskbar and the Alt+Tab list
// (Alt+Tab works in borderless Skyrim). Switching to it opens the overlay.
let launcher = null;
function createLauncher() {
  launcher = new BrowserWindow({
    title: 'Dovah Trainer (open trainer)', width: 320, height: 80, x: -32000, y: -32000,
    show: false, frame: false, resizable: false, skipTaskbar: false, focusable: true,
    backgroundColor: '#07090d', icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  launcher.loadURL('data:text/html,<title>Dovah Trainer (open trainer)</title>');
  launcher.on('page-title-updated', (e) => e.preventDefault());
  launcher.minimize();
  // Debounced: opening the overlay moves focus around, which must not re-trigger this.
  let lastOpen = 0;
  const open = (ev) => {
    dbg('launcher', ev?.type || 'event', { overlayOpen, sinceLast: Date.now() - lastOpen, minimized: launcher.isMinimized() });
    if (overlayOpen || Date.now() - lastOpen < 1000) return;
    lastOpen = Date.now();
    setTimeout(() => {
      if (!launcher.isMinimized()) launcher.minimize();
      showOverlay();
    }, 60);
  };
  // Start listening once the minimized window has settled after launch.
  setTimeout(() => {
    launcher.on('focus', open);
    launcher.on('restore', open);
  }, 1500);
  launcher.on('close', (e) => { if (!quitting) { e.preventDefault(); launcher.minimize(); } });
}

app.on('second-instance', () => showOverlay());

app.whenReady().then(async () => {
  loadConfig();
  if (!isGameDir(config.gamePath)) { config.gamePath = await detectGamePath(); saveConfig(); }
  startHotkeys();
  createLauncher();
  createWindow();
  createTray();

  ipcMain.handle('run', (_e, cmds) => runCommands(cmds));
  ipcMain.handle('status', async () => ({
    game: native.gameRunning(),
    pathOk: isGameDir(config.gamePath),
    display: readDisplay().mode,
    subtitles: readDisplay().subtitles,
    autoSkip: skip.auto,
  }));
  ipcMain.handle('display:fix', () => makeBorderless());
  ipcMain.handle('subtitles:fix', () => enableSubtitles());
  ipcMain.handle('autoskip:set', (_e, on) => { setAutoSkip(!!on, 'user'); return skip.auto; });
  ipcMain.handle('toggles:get', () => config.toggles || {});
  ipcMain.handle('toggles:set', (_e, map, changedSave) => {
    const clean = {};
    for (const [k, v] of Object.entries(map || {})) if (v === 'save' || v === 'session') clean[k] = v;
    config.toggles = clean;
    if (changedSave) checkpointDirty = true;
    saveConfig();
    return config.toggles;
  });
  // Before toggling: is this a Skyrim session we haven't applied the remembered cheats to?
  ipcMain.handle('session:check', () => {
    const pid = native.gamePid();
    const fresh = !!pid && pid !== config.appliedPid;
    if (fresh && !Object.keys(config.toggles || {}).length) { config.appliedPid = pid; saveConfig(); return { fresh: false }; }
    return { fresh };
  });
  // The renderer re-applied everything to the running game.
  ipcMain.handle('reapply:done', (_e, full) => {
    if (full) { config.appliedPid = native.gamePid(); saveConfig(); }
    lastReapply = Date.now();
  });
  ipcMain.handle('config:get', () => config);
  ipcMain.handle('config:set', (_e, patch) => {
    const allowed = ['gamePath', 'consoleScan', 'activateScan', 'keyDelay', 'hotkeys', 'checkpoint'];
    for (const k of allowed) if (k in patch) config[k] = patch[k];
    saveConfig();
    refreshHotkeys();
    return config;
  });
  ipcMain.handle('config:browse', async () => {
    win.setAlwaysOnTop(false);
    const r = await holdOpen(() => dialog.showOpenDialog(win, { title: 'Select your Skyrim Special Edition folder', properties: ['openDirectory'] }));
    win.setAlwaysOnTop(true, 'screen-saver');
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0], valid: isGameDir(r.filePaths[0]) };
  });
  ipcMain.handle('config:detect', async () => detectGamePath());
  ipcMain.handle('open-link', (_e, url) => {
    if (!ALLOWED_LINKS.has(url)) return;
    hideOverlay();
    shell.openExternal(url);
  });
  ipcMain.handle('version', () => app.getVersion());
  ipcMain.handle('update:check', async () => {
    if (!autoUpdater) return { dev: true };
    await autoUpdater.checkForUpdates().catch((e) => sendUpdate('error', { message: String(e?.message || e).split('\n')[0] }));
    return {};
  });
  ipcMain.handle('update:install', () => { quitting = true; autoUpdater?.quitAndInstall(true, true); });
  setupUpdater();
  ipcMain.on('win', (_e, action) => {
    if (action === 'hide') hideOverlay();
    else if (action === 'quit') { quitting = true; app.quit(); }
  });
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { quitting = true; globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
