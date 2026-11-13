// Simple mod management for Skyrim SE: plugin list (plugins.txt), installing mods from
// .zip/.7z archives into Data, uninstalling what we installed, and browsing Nexus Mods.
// Deliberately conservative: it never overwrites files that already exist in Data and
// refuses installer-based (FOMOD) mods, which need a full mod manager.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const GAME_DOMAIN = 'skyrimspecialedition';
const OFFICIAL = new Set(['skyrim.esm', 'update.esm', 'dawnguard.esm', 'hearthfires.esm', 'dragonborn.esm', '_resourcepack.esl']);
const PLUGIN_RE = /\.(esp|esm|esl)$/i;
const DATA_DIRS = new Set(['meshes', 'textures', 'scripts', 'interface', 'sound', 'music', 'skse', 'seq', 'strings', 'shadersfx', 'lodsettings', 'grass', 'video', 'calientetools', 'source', 'dialogueviews', 'facegen']);
const DATA_FILE_RE = /\.(esp|esm|esl|bsa|ini)$/i;

const isOfficial = (name) => OFFICIAL.has(name.toLowerCase()) || /^cc/i.test(name);
const dataDir = (gamePath) => path.join(gamePath, 'Data');
const pluginsTxt = () => path.join(process.env.LOCALAPPDATA || '', 'Skyrim Special Edition', 'plugins.txt');

function readPluginsTxt() {
  try { return fs.readFileSync(pluginsTxt(), 'utf8').split(/\r?\n/); } catch { return []; }
}
function writePluginsTxt(lines) {
  fs.mkdirSync(path.dirname(pluginsTxt()), { recursive: true });
  fs.writeFileSync(pluginsTxt(), lines.filter((l, i, a) => l.trim() || i < a.length - 1).join('\r\n') + '\r\n');
}

// ---------- plugins ----------
function listPlugins(gamePath) {
  const files = fs.existsSync(dataDir(gamePath)) ? fs.readdirSync(dataDir(gamePath)).filter((f) => PLUGIN_RE.test(f)) : [];
  const enabled = new Set();
  for (const line of readPluginsTxt()) if (line.startsWith('*')) enabled.add(line.slice(1).trim().toLowerCase());
  return files
    .map((name) => ({ name, official: isOfficial(name), enabled: isOfficial(name) || enabled.has(name.toLowerCase()) }))
    .sort((a, b) => (a.official === b.official ? a.name.localeCompare(b.name) : a.official ? -1 : 1));
}

function setPlugin(gamePath, name, on) {
  if (!PLUGIN_RE.test(name) || name.includes('/') || name.includes('\\')) return { ok: false, error: 'Not a plugin' };
  if (isOfficial(name)) return { ok: false, error: 'Official game files are always on' };
  if (!fs.existsSync(path.join(dataDir(gamePath), name))) return { ok: false, error: 'Plugin not found in Data' };
  const lines = readPluginsTxt();
  const idx = lines.findIndex((l) => l.replace(/^\*/, '').trim().toLowerCase() === name.toLowerCase());
  const entry = (on ? '*' : '') + name;
  if (idx >= 0) lines[idx] = entry; else lines.push(entry);
  writePluginsTxt(lines);
  return { ok: true };
}

// ---------- install / uninstall ----------
function sevenZip() {
  // 7-Zip ships with the app (7zip-bin); it can't run from inside app.asar.
  return require('7zip-bin').path7za.replace('app.asar', 'app.asar.unpacked');
}

function extract(archive, outDir) {
  return new Promise((resolve, reject) => {
    execFile(sevenZip(), ['x', archive, `-o${outDir}`, '-y', '-bso0', '-bsp0'], { windowsHide: true }, (err, _out, stderr) => {
      if (err) reject(new Error(`Could not extract the archive (${String(stderr || err.message).trim().split('\n')[0]}). RAR files aren't supported; use .zip or .7z.`));
      else resolve();
    });
  });
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base)); else out.push(path.relative(base, full));
  }
  return out;
}

const looksLikeData = (dir) => fs.readdirSync(dir, { withFileTypes: true }).some((e) =>
  (e.isDirectory() && DATA_DIRS.has(e.name.toLowerCase())) || (e.isFile() && DATA_FILE_RE.test(e.name)));

// Find the folder inside the archive that maps onto Skyrim's Data folder.
function findDataRoot(dir) {
  for (let depth = 0; depth < 4; depth++) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (entries.some((e) => e.isDirectory() && e.name.toLowerCase() === 'fomod') && !looksLikeData(dir)) {
      throw new Error('This mod uses an installer with options (FOMOD). Install it with a full mod manager such as Vortex or Mod Organizer 2.');
    }
    const data = entries.find((e) => e.isDirectory() && e.name.toLowerCase() === 'data');
    if (data) return path.join(dir, data.name);
    if (looksLikeData(dir)) return dir;
    const dirs = entries.filter((e) => e.isDirectory());
    if (dirs.length === 1 && entries.length === 1) { dir = path.join(dir, dirs[0].name); continue; }
    break;
  }
  throw new Error("Couldn't find any game files (plugins, meshes, textures...) in this archive.");
}

async function installArchive(gamePath, archive, tmpRoot) {
  const data = dataDir(gamePath);
  if (!fs.existsSync(data)) throw new Error('Skyrim Data folder not found. Check the game folder in Settings.');
  const name = path.basename(archive).replace(/\.(zip|7z)$/i, '');
  const tmp = path.join(tmpRoot, `${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    await extract(archive, tmp);
    const root = findDataRoot(tmp);
    // Skip the installer folder and readme/screenshot files sitting next to the plugins.
    const files = walk(root).filter((f) => {
      if (/^fomod[\\/]/i.test(f)) return false;
      const atRoot = !/[\\/]/.test(f);
      return !(atRoot && /\.(txt|md|pdf|url|jpe?g|png|html?)$/i.test(f));
    });
    if (!files.length) throw new Error('The archive is empty.');
    for (const f of files) if (f.split(/[\\/]/).includes('..') || path.isAbsolute(f)) throw new Error('The archive contains unsafe paths.');
    const conflicts = files.filter((f) => fs.existsSync(path.join(data, f)));
    if (conflicts.length) {
      throw new Error(`Not installed: ${conflicts.length} file(s) already exist in Data (e.g. ${conflicts[0]}). The trainer never overwrites files; use a full mod manager for overwrites.`);
    }
    for (const f of files) {
      const dest = path.join(data, f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(root, f), dest);
    }
    const plugins = files.filter((f) => !/[\\/]/.test(f) && PLUGIN_RE.test(f));
    for (const p of plugins) setPlugin(gamePath, p, true);
    return { name, files, plugins, at: Date.now() };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function uninstall(gamePath, info) {
  const data = dataDir(gamePath);
  for (const p of info.plugins || []) {
    const lines = readPluginsTxt().filter((l) => l.replace(/^\*/, '').trim().toLowerCase() !== p.toLowerCase());
    writePluginsTxt(lines);
  }
  const dirs = new Set();
  for (const f of info.files || []) {
    if (f.split(/[\\/]/).includes('..') || path.isAbsolute(f)) continue;
    const full = path.join(data, f);
    try { fs.unlinkSync(full); } catch { /* already gone */ }
    let d = path.dirname(full);
    while (d.length > data.length) { dirs.add(d); d = path.dirname(d); }
  }
  // Remove folders the mod created, deepest first, only if now empty.
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch { /* not empty / gone */ }
  }
}

// ---------- Nexus Mods (v1 REST API, personal API key) ----------
async function nexus(key, url) {
  if (!key) throw new Error('Add your Nexus Mods API key first');
  const res = await fetch(`https://api.nexusmods.com/v1/${url}`, {
    headers: { apikey: key, accept: 'application/json', 'Application-Name': 'Dovah Trainer', 'Application-Version': require('./package.json').version },
  });
  if (res.status === 401) throw new Error('Nexus rejected the API key');
  if (res.status === 429) throw new Error('Nexus rate limit reached; try again later');
  if (!res.ok) throw new Error(`Nexus error ${res.status}`);
  return res.json();
}

async function nexusValidate(key) {
  try {
    const u = await nexus(key, 'users/validate.json');
    return { ok: true, name: u.name, premium: !!u.is_premium };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function nexusList(key, kind) {
  const kinds = { trending: 'trending', latest: 'latest_added', updated: 'latest_updated' };
  if (!kinds[kind]) return { ok: false, error: 'Unknown list' };
  try {
    const list = await nexus(key, `games/${GAME_DOMAIN}/mods/${kinds[kind]}.json`);
    return {
      ok: true,
      mods: list.filter((m) => m.available !== false && m.status !== 'hidden' && !m.contains_adult_content).map((m) => ({
        id: m.mod_id, name: m.name, summary: m.summary, picture: m.picture_url, author: m.author,
        endorsements: m.endorsement_count, version: m.version, updated: m.updated_timestamp, adult: !!m.contains_adult_content,
      })),
    };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { listPlugins, setPlugin, installArchive, uninstall, nexusList, nexusValidate };
