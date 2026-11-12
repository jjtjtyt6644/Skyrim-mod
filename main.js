// Dovah Trainer — Electron main process.
// Writes console commands to <Skyrim>\dovahtrainer.txt and asks the PowerShell
// bridge to type "bat dovahtrainer" into the game console.
const { app, BrowserWindow, ipcMain, globalShortcut, shell, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const BAT_NAME = 'dovahtrainer';
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const DEFAULTS = { gamePath: '', consoleScan: 0x29, keyDelay: 45, hotkeys: true };
const ALLOWED_LINKS = new Set([
  'https://github.com/gibbed/SteamAchievementManager',
  'https://en.uesp.net/wiki/Skyrim:Console',
  'https://github.com/jjtjtyt6644/Skyrim-mod/releases',
]);

let win = null;
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

async function runCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) return { ok: false, error: 'No commands' };
  if (!isGameDir(config.gamePath)) return { ok: false, error: 'Set your Skyrim folder in Settings first' };
  const clean = commands.map((c) => String(c).replace(/[\r\n]/g, ' ').trim()).filter(Boolean);
  try {
    fs.writeFileSync(path.join(config.gamePath, `${BAT_NAME}.txt`), clean.join('\r\n') + '\r\n');
  } catch (e) {
    return { ok: false, error: `Could not write batch file: ${e.message}` };
  }
  const res = await bridgeCall(`RUN|${BAT_NAME}|${Number(config.consoleScan) | 0}|${Number(config.keyDelay) | 0}`);
  return res === 'OK' ? { ok: true } : { ok: false, error: res.replace(/^ERR:/, '') };
}

// ---------- hotkeys ----------
const HOTKEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
function registerHotkeys() {
  globalShortcut.unregisterAll();
  if (!config.hotkeys) return;
  for (const key of HOTKEYS) {
    globalShortcut.register(`CommandOrControl+${key}`, () => win?.webContents.send('hotkey', key));
  }
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
    width: 1240, height: 800, minWidth: 980, minHeight: 640,
    frame: false, backgroundColor: '#07090d', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(async () => {
  loadConfig();
  if (!isGameDir(config.gamePath)) { config.gamePath = await detectGamePath(); saveConfig(); }
  startBridge();
  createWindow();
  registerHotkeys();

  ipcMain.handle('run', (_e, cmds) => runCommands(cmds));
  ipcMain.handle('status', async () => ({
    game: (await bridgeCall('STATUS')) === 'STATUS:1',
    pathOk: isGameDir(config.gamePath),
  }));
  ipcMain.handle('config:get', () => config);
  ipcMain.handle('config:set', (_e, patch) => {
    const allowed = ['gamePath', 'consoleScan', 'keyDelay', 'hotkeys'];
    for (const k of allowed) if (k in patch) config[k] = patch[k];
    saveConfig(); registerHotkeys();
    return config;
  });
  ipcMain.handle('config:browse', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Select your Skyrim Special Edition folder', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0], valid: isGameDir(r.filePaths[0]) };
  });
  ipcMain.handle('config:detect', async () => detectGamePath());
  ipcMain.handle('open-link', (_e, url) => { if (ALLOWED_LINKS.has(url)) shell.openExternal(url); });
  ipcMain.handle('version', () => app.getVersion());
  ipcMain.handle('update:check', async () => {
    if (!autoUpdater) return { dev: true };
    await autoUpdater.checkForUpdates().catch((e) => sendUpdate('error', { message: String(e?.message || e).split('\n')[0] }));
    return {};
  });
  ipcMain.handle('update:install', () => { autoUpdater?.quitAndInstall(true, true); });
  setupUpdater();
  ipcMain.on('win', (_e, action) => {
    if (!win) return;
    if (action === 'min') win.minimize();
    else if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
  });
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); bridge.proc?.kill(); });
app.on('window-all-closed', () => app.quit());
