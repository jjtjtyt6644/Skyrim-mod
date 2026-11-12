// Dovah Trainer — Electron main process.
// Runs as an in-game overlay (transparent, always-on-top, toggled with Insert).
// Cheats are written to <Skyrim>\dovahtrainer.txt and the PowerShell bridge
// types "bat dovahtrainer" into the game console.
const { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog, screen, Tray, Menu, nativeImage } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const BAT_NAME = 'dovahtrainer';
const TOGGLE_KEY = 'Insert';
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = { gamePath: '', consoleScan: 0x29, keyDelay: 45, hotkeys: true };
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
  if (!p) return { found: false, mode: 'unknown' };
  const t = fs.readFileSync(p, 'utf8');
  const full = /^\s*bFull Screen\s*=\s*1/im.test(t);
  const borderless = /^\s*bBorderless\s*=\s*1/im.test(t);
  return { found: true, mode: full ? 'fullscreen' : borderless ? 'borderless' : 'windowed' };
}

async function makeBorderless() {
  const p = prefsPath();
  if (!p) return { ok: false, error: 'SkyrimPrefs.ini not found. Start Skyrim once first.' };
  if ((await bridgeCall('STATUS')) === 'STATUS:1') return { ok: false, error: 'Close Skyrim first. The game overwrites this file when it exits.' };
  let t = fs.readFileSync(p, 'utf8');
  const backup = p + '.dovah-backup';
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, t);
  const setKey = (key, val) => {
    const re = new RegExp(`^(\\s*${key}\\s*=\\s*)\\S*`, 'im');
    if (re.test(t)) t = t.replace(re, (_m, pre) => pre + val);
    else if (/^\[Display\]/im.test(t)) t = t.replace(/^\[Display\]\s*$/im, (m) => `${m}\r\n${key}=${val}`);
    else t += `\r\n[Display]\r\n${key}=${val}\r\n`;
  };
  setKey('bFull Screen', '0');
  setKey('bBorderless', '1');
  fs.writeFileSync(p, t);
  return { ok: true };
}

// ---------- PowerShell bridge ----------
const bridge = { proc: null, buf: '', waiters: [], ready: null };

function startBridge() {
  const script = path.join(__dirname, 'bridge', 'SkyrimBridge.ps1').replace('app.asar', 'app.asar.unpacked');
  bridge.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
  bridge.ready = new Promise((resolve) => { bridge.waiters.push(resolve); });
  bridge.proc.stdout.setEncoding('utf8');
  bridge.proc.stdout.on('data', (chunk) => {
    bridge.buf += chunk;
    let i;
    while ((i = bridge.buf.indexOf('\n')) >= 0) {
      const line = bridge.buf.slice(0, i).trim();
      bridge.buf = bridge.buf.slice(i + 1);
      if (line) { const w = bridge.waiters.shift(); if (w) w(line); }
    }
  });
  bridge.proc.stderr.on('data', (d) => console.error('[bridge]', d.toString()));
  bridge.proc.on('exit', () => {
    bridge.waiters.splice(0).forEach((w) => w('ERR:Bridge stopped'));
    bridge.proc = null;
  });
}

let queue = Promise.resolve();
function bridgeCall(line) {
  const job = queue.then(async () => {
    if (!bridge.proc) startBridge();
    await bridge.ready;
    return new Promise((resolve) => {
      bridge.waiters.push(resolve);
      bridge.proc.stdin.write(line + '\n');
    });
  });
  queue = job.catch(() => {});
  return job;
}

const hwnd = () => (win ? win.getNativeWindowHandle().readBigUInt64LE(0).toString() : '0');

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
  const ret = overlayOpen ? hwnd() : '0';
  dbg('run start', clean, { ret, holdCount });
  const res = await holdOpen(() => bridgeCall(`RUN|${BAT_NAME}|${Number(config.consoleScan) | 0}|${Number(config.keyDelay) | 0}|${ret}`));
  return res === 'OK' ? { ok: true } : { ok: false, error: res.replace(/^ERR:/, '') };
}

// ---------- overlay ----------
// The overlay closes itself when it loses focus (click into the game, alt-tab),
// except while we deliberately hand focus to the game to type a command.
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
    await bridgeCall(`FOCUS|${hwnd()}`);
  });
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
    if (returnToGame) await bridgeCall('FOCUSGAME');
  }, 230);
}

const toggleOverlay = () => (overlayOpen ? hideOverlay() : showOverlay());

// ---------- hotkeys (low-level keyboard hook; works while Skyrim has focus) ----------
// Plain F-keys, no modifiers: Ctrl is Skyrim's sneak key. F5/F9 are quicksave/quickload.
const VK_INSERT = 0x2d;
const HOTKEYS = { 0x70: 'F1', 0x71: 'F2', 0x72: 'F3', 0x73: 'F4', 0x75: 'F6', 0x76: 'F7', 0x77: 'F8', 0x79: 'F10' };
const hook = { proc: null, buf: '' };
const OWN_PROCESS = path.parse(process.execPath).name; // "Dovah Trainer" (or "electron" in dev)

function onHookKey(vk, fgProcess) {
  if (vk === VK_INSERT) return toggleOverlay();
  const key = HOTKEYS[vk];
  if (!key || !config.hotkeys) return;
  // Only while playing (or in the trainer), so F-keys keep working normally elsewhere.
  if (fgProcess !== 'SkyrimSE' && fgProcess !== OWN_PROCESS) return;
  win?.webContents.send('hotkey', key);
}

function startHook() {
  const script = path.join(__dirname, 'bridge', 'SkyrimHotkeys.ps1').replace('app.asar', 'app.asar.unpacked');
  const keys = [VK_INSERT, ...Object.keys(HOTKEYS)].join(',');
  hook.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Keys', keys], { windowsHide: true });
  hook.proc.stdout.setEncoding('utf8');
  hook.proc.stdout.on('data', (chunk) => {
    hook.buf += chunk;
    let i;
    while ((i = hook.buf.indexOf('\n')) >= 0) {
      const [kind, vk, fg] = hook.buf.slice(0, i).trim().split('|');
      hook.buf = hook.buf.slice(i + 1);
      if (kind === 'KEY') onHookKey(Number(vk), fg);
      else if (kind === 'ERR') console.error('[hook]', vk);
    }
  });
  hook.proc.stderr.on('data', (d) => console.error('[hook]', d.toString()));
  hook.proc.on('exit', () => {
    hook.proc = null;
    if (!quitting) setTimeout(startHook, 1000); // keep the hotkeys alive
  });
}

// Fallback for when the game isn't focused (e.g. on the desktop). The hook
// already handles Insert, so this only fires if the hook process is down.
function registerHotkeys() {
  globalShortcut.unregisterAll();
  if (!hook.proc) globalShortcut.register(TOGGLE_KEY, toggleOverlay);
}

// ---------- tray ----------
function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip(`Dovah Trainer: press ${TOGGLE_KEY} in game`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Show / hide trainer (${TOGGLE_KEY})`, click: toggleOverlay },
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
    if ((await bridgeCall('STATUS')) === 'STATUS:1') {
      tray?.displayBalloon({ iconType: 'info', title: 'Dovah Trainer is running', content: `Press ${TOGGLE_KEY} in game to open it.` });
    } else {
      showOverlay();
    }
  });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); hideOverlay(); } });
  // Focus already went somewhere else (game or another app): just get out of the way.
  win.on('focus', () => dbg('focus'));
  win.on('blur', () => {
    dbg('blur', { overlayOpen, holdCount }); if (overlayOpen && holdCount === 0) hideOverlay(false);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.on('second-instance', () => showOverlay());

app.whenReady().then(async () => {
  loadConfig();
  if (!isGameDir(config.gamePath)) { config.gamePath = await detectGamePath(); saveConfig(); }
  startBridge();
  startHook();
  createWindow();
  createTray();
  registerHotkeys();

  ipcMain.handle('run', (_e, cmds) => runCommands(cmds));
  ipcMain.handle('status', async () => ({
    game: (await bridgeCall('STATUS')) === 'STATUS:1',
    pathOk: isGameDir(config.gamePath),
    display: readDisplay().mode,
  }));
  ipcMain.handle('display:fix', () => makeBorderless());
  ipcMain.handle('config:get', () => config);
  ipcMain.handle('config:set', (_e, patch) => {
    const allowed = ['gamePath', 'consoleScan', 'keyDelay', 'hotkeys'];
    for (const k of allowed) if (k in patch) config[k] = patch[k];
    saveConfig(); registerHotkeys();
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
app.on('will-quit', () => { quitting = true; globalShortcut.unregisterAll(); bridge.proc?.kill(); hook.proc?.kill(); });
app.on('window-all-closed', () => app.quit());
