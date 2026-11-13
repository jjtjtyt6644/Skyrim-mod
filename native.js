// Direct Win32 calls (via koffi FFI) for focusing windows and typing into
// Skyrim's console. Deliberately does NOT read the keyboard in any way (no hooks,
// no key-state polling): that looks like a keylogger to antivirus software.
// Hotkeys use Electron's globalShortcut (RegisterHotKey) instead, see main.js.
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr',
});
const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'int32', dy: 'int32', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr',
});
const INPUT = koffi.struct('INPUT', { type: 'uint32', u: koffi.union('INPUT_UNION', { mi: MOUSEINPUT, ki: KEYBDINPUT }) });
const WNDENUMPROC = koffi.proto('bool __stdcall WNDENUMPROC(intptr hwnd, intptr lParam)');

const SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)');
const GetForegroundWindow = user32.func('intptr __stdcall GetForegroundWindow()');
const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(intptr hwnd)');
const BringWindowToTop = user32.func('bool __stdcall BringWindowToTop(intptr hwnd)');
const ShowWindow = user32.func('bool __stdcall ShowWindow(intptr hwnd, int cmd)');
const IsIconic = user32.func('bool __stdcall IsIconic(intptr hwnd)');
const IsWindow = user32.func('bool __stdcall IsWindow(intptr hwnd)');
const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(intptr hwnd)');
const GetWindow = user32.func('intptr __stdcall GetWindow(intptr hwnd, uint32 cmd)');
const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(intptr hwnd, _Out_ uint32 *pid)');
const AttachThreadInput = user32.func('bool __stdcall AttachThreadInput(uint32 a, uint32 b, bool attach)');
const EnumWindows = user32.func('bool __stdcall EnumWindows(WNDENUMPROC *cb, intptr lParam)');
const GetCurrentThreadId = kernel32.func('uint32 __stdcall GetCurrentThreadId()');
const OpenProcess = kernel32.func('intptr __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)');
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(intptr h)');
const QueryFullProcessImageNameW = kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr h, uint32 flags, _Out_ uint8 *buf, _Inout_ uint32 *size)');

const INPUT_KEYBOARD = 1, KEYEVENTF_KEYUP = 0x2, KEYEVENTF_SCANCODE = 0x8;
const SC = { ENTER: 0x1c, LCTRL: 0x1d, LSHIFT: 0x2a, LALT: 0x38 };
const INPUT_SIZE = koffi.sizeof(INPUT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (h) => Number(h || 0);

// ---------- processes & windows ----------
const nameCache = new Map(); // pid -> exe name (without .exe)
function processName(pid) {
  if (!pid) return '';
  if (nameCache.has(pid)) return nameCache.get(pid);
  let name = '';
  const h = OpenProcess(0x1000 /* QUERY_LIMITED_INFORMATION */, false, pid);
  if (n(h)) {
    const buf = Buffer.alloc(1040);
    const size = [520];
    if (QueryFullProcessImageNameW(h, 0, buf, size)) {
      const full = buf.toString('utf16le', 0, size[0] * 2);
      name = full.slice(full.lastIndexOf('\\') + 1).replace(/\.exe$/i, '');
    }
    CloseHandle(h);
  }
  if (nameCache.size > 500) nameCache.clear();
  nameCache.set(pid, name);
  return name;
}

function windowPid(hwnd) { const pid = [0]; GetWindowThreadProcessId(hwnd, pid); return pid[0]; }
function windowThread(hwnd) { return GetWindowThreadProcessId(hwnd, [0]); }

function foregroundProcess() { return processName(windowPid(GetForegroundWindow())); }

let gameHwnd = 0;
function findGame() {
  if (gameHwnd && IsWindow(gameHwnd) && processName(windowPid(gameHwnd)) === 'SkyrimSE') return gameHwnd;
  gameHwnd = 0;
  const cb = koffi.register((hwnd) => {
    if (IsWindowVisible(hwnd) && !n(GetWindow(hwnd, 4 /* GW_OWNER */)) && processName(windowPid(hwnd)) === 'SkyrimSE') {
      gameHwnd = n(hwnd);
      return false; // stop enumerating
    }
    return true;
  }, koffi.pointer(WNDENUMPROC));
  try { EnumWindows(cb, 0); } finally { koffi.unregister(cb); }
  return gameHwnd;
}

// Foreground switch without injecting keys: attach to the foreground thread's
// input queue so Windows allows the change.
async function focus(hwnd) {
  hwnd = n(hwnd);
  if (!hwnd || !IsWindow(hwnd)) return false;
  if (n(GetForegroundWindow()) === hwnd) return true;
  if (IsIconic(hwnd)) ShowWindow(hwnd, 9 /* SW_RESTORE */);
  const me = GetCurrentThreadId();
  const fg = windowThread(GetForegroundWindow());
  const target = windowThread(hwnd);
  const a1 = fg && fg !== me && AttachThreadInput(me, fg, true);
  const a2 = target && target !== me && target !== fg && AttachThreadInput(me, target, true);
  BringWindowToTop(hwnd);
  SetForegroundWindow(hwnd);
  if (a2) AttachThreadInput(me, target, false);
  if (a1) AttachThreadInput(me, fg, false);
  for (let i = 0; i < 20; i++) {
    if (n(GetForegroundWindow()) === hwnd) return true;
    await sleep(25);
  }
  return false;
}

// ---------- keyboard ----------
function key(scan, up) {
  SendInput(1, [{ type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: scan, dwFlags: KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0), time: 0, dwExtraInfo: 0 } } }], INPUT_SIZE);
}
async function tap(scan, hold) { key(scan, false); await sleep(hold); key(scan, true); await sleep(hold); }

// DirectInput scan codes (US layout) for the characters we type.
function scanFor(c) {
  const rows = [['qwertyuiop', 0x10], ['asdfghjkl', 0x1e], ['zxcvbnm', 0x2c]];
  c = c.toLowerCase();
  for (const [row, base] of rows) { const i = row.indexOf(c); if (i >= 0) return base + i; }
  if (c >= '1' && c <= '9') return 0x02 + (c.charCodeAt(0) - 49);
  if (c === '0') return 0x0b;
  if (c === ' ') return 0x39;
  throw new Error(`Unsupported character: ${c}`);
}

// ---------- serialized game actions ----------
let queue = Promise.resolve();
function serial(fn) { const job = queue.then(fn); queue = job.catch(() => {}); return job; }

const gameRunning = () => !!findGame();
// Process id of the running game, so we can tell when Skyrim was restarted.
const gamePid = () => { const h = findGame(); return h ? windowPid(h) : 0; };

const focusGame = () => serial(async () => {
  const h = findGame();
  if (!h) return { ok: false, error: 'Skyrim SE is not running' };
  return (await focus(h)) ? { ok: true } : { ok: false, error: 'Could not focus Skyrim' };
});

const focusWindow = (hwnd) => serial(() => focus(hwnd));

// Open the console, run "bat <name>", close it. Optionally give focus back afterwards.
const runBat = (bat, { consoleScan, delay, returnTo }) => serial(async () => {
  const h = findGame();
  if (!h) return { ok: false, error: 'Skyrim SE is not running' };
  if (!(await focus(h))) return { ok: false, error: 'Could not focus the Skyrim window' };
  await sleep(delay * 3);
  // Release modifiers still held from a hotkey so they don't mangle typing.
  key(SC.LCTRL, true); key(SC.LSHIFT, true); key(SC.LALT, true);
  await sleep(delay);
  await tap(consoleScan, delay);          // open console
  await sleep(delay * 2);
  for (const c of `bat ${bat}`) await tap(scanFor(c), 12);
  await tap(SC.ENTER, delay);
  await sleep(delay * 3);
  await tap(consoleScan, delay);          // close console
  if (returnTo) { await sleep(delay); await focus(returnTo); }
  return { ok: true };
});

// Tap one key, but only if Skyrim is already in front (never steals focus).
const tapIfGame = (scan) => serial(async () => {
  const h = findGame();
  if (!h) return 'not-running';
  if (n(GetForegroundWindow()) !== h) return 'skipped';
  await tap(scan, 40);
  return 'ok';
});

module.exports = { gameRunning, gamePid, focusGame, focusWindow, runBat, tapIfGame, foregroundProcess };
