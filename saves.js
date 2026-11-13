// Cleanup for the trainer's own auto-saves. Only files whose name starts with
// "DovahAuto" are ever touched; your own saves, Skyrim's autosaves/quicksaves and the
// trainer's DovahCheats/DovahQuestBackup slots are left alone.
const fs = require('fs');
const path = require('path');

const TRAINER_SAVE = /^DovahAuto/i;
const SAVE_EXT = /\.(ess|skse)$/i;

// Skyrim's save folder: <Documents>\My Games\Skyrim Special Edition\<sLocalSavePath>
// (sLocalSavePath in Skyrim.ini, default "Saves\").
function savesDir(myGamesDir) {
  let sub = 'Saves';
  try {
    const ini = fs.readFileSync(path.join(myGamesDir, 'Skyrim.ini'), 'utf8');
    const m = ini.match(/^\s*sLocalSavePath\s*=\s*(.+?)\s*$/im);
    if (m && m[1] && !/[:]|\.\./.test(m[1])) sub = m[1].replace(/[\\/]+$/, '');
  } catch { /* default */ }
  return path.join(myGamesDir, sub);
}

// Trainer saves grouped by name (each save is an .ess plus an optional .skse co-save).
function listTrainerSaves(dir) {
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  const groups = new Map();
  for (const f of files) {
    if (!SAVE_EXT.test(f) || !TRAINER_SAVE.test(f)) continue;
    const base = f.replace(SAVE_EXT, '');
    const full = path.join(dir, f);
    let mtime = 0;
    try { mtime = fs.statSync(full).mtimeMs; } catch { continue; }
    const g = groups.get(base) || { name: base, files: [], mtime: 0 };
    g.files.push(full);
    g.mtime = Math.max(g.mtime, mtime);
    groups.set(base, g);
  }
  return [...groups.values()].sort((a, b) => b.mtime - a.mtime); // newest first
}

// Keep the newest `keep` trainer saves; send older ones to the Recycle Bin via `trash`.
async function pruneTrainerSaves(dir, keep, trash) {
  const keepN = Math.max(1, Math.floor(Number(keep) || 10));
  const old = listTrainerSaves(dir).slice(keepN);
  const removed = [];
  for (const g of old) {
    try {
      for (const f of g.files) await trash(f);
      removed.push(g.name);
    } catch { /* file in use or already gone; try again next time */ }
  }
  return removed;
}

// A unique, sortable name for a new trainer save, e.g. DovahAuto_20261114_153012.
function newSaveName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `DovahAuto_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

module.exports = { savesDir, listTrainerSaves, pruneTrainerSaves, newSaveName };
