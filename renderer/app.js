/* Dovah Trainer — renderer */
(() => {
  // Outside Electron (plain browser preview) use a mock bridge so the UI still works.
  const api = window.trainer || {
    run: async (c) => { console.log('[mock run]', c); await sleep(350); return { ok: true }; },
    status: async () => ({ game: false, pathOk: true, subtitles: false }),
    getConfig: async () => ({ gamePath: 'D:\\SteamLibrary\\steamapps\\common\\Skyrim Special Edition', consoleScan: 41, keyDelay: 45, hotkeys: true }),
    setConfig: async (p) => p, browseGame: async () => null, detectGame: async () => '',
    openLink: async (u) => window.open(u), window: () => {}, onHotkey: () => {},
    version: async () => 'dev', checkUpdate: async () => ({ dev: true }), installUpdate: async () => {}, onUpdate: () => {},
    onOverlay: () => {}, fixDisplay: async () => ({ ok: true }),
    fixSubtitles: async () => ({ ok: true }), setAutoSkip: async (on) => on, onAutoSkip: () => {},
    getToggles: async () => ({}), setToggles: async (m) => m, sessionCheck: async () => ({ fresh: false }),
    reapplyDone: async () => {}, onReapply: () => {},
    mouse: () => {}, saveNow: async () => ({ ok: true }), lastSave: async () => null, onAutoSaved: () => {}, onGameClosed: () => {},
    mods: {
      plugins: async () => [{ name: 'Skyrim.esm', official: true, enabled: true }, { name: 'SkyUI_SE.esp', official: false, enabled: true }, { name: 'Alternate Start.esp', official: false, enabled: false }],
      setPlugin: async () => ({ ok: true }), installed: async () => ({}), install: async () => null, uninstall: async () => ({ ok: true }),
      nexusList: async () => ({ ok: false, error: 'Add your Nexus Mods API key first' }), nexusValidate: async () => ({ ok: false, error: 'offline preview' }),
      nexusOpen: async () => {}, nexusPage: async () => {},
    },
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  const state = {
    tab: store.get('tab', 'player'),
    toggles: {}, // loaded from the main process (config.json) in init()
    payWithGold: store.get('payWithGold', true),
    history: store.get('history', []),
    config: null,
  };

  // Index every item so event handlers can find definitions by key.
  const items = new Map();
  const hotkeys = new Map();
  TABS.forEach((t) => (t.sections || []).forEach((s, si) => s.items.forEach((it, ii) => {
    it.key = it.id || `${t.id}-${si}-${ii}`;
    it.tab = t.id;
    items.set(it.key, it);
    if (it.hotkey) hotkeys.set(it.hotkey, it);
  })));

  // ---------------- Running commands ----------------
  async function run(cmds, label, card) {
    card?.classList.add('busy');
    const res = await api.run(cmds);
    card?.classList.remove('busy');
    if (card) { card.classList.remove('flash-ok', 'flash-err'); void card.offsetWidth; card.classList.add(res.ok ? 'flash-ok' : 'flash-err'); }
    log(label, cmds, res);
    toast(res.ok ? label : 'Failed: ' + label, res.ok ? cmds.join('  ·  ') : res.error, !res.ok);
    return res.ok;
  }

  // Toggles handled by the main process instead of console commands.
  function applyNative(key, on) {
    if (on) state.toggles[key] = true; else delete state.toggles[key];
    $(`#page .card[data-key="${key}"]`)?.classList.toggle('on', on);
    updateCounts();
  }

  // Remember active toggles in the main process (config.json), so they survive trainer
  // restarts and can be re-applied after death or a Skyrim restart.
  function persistToggles(changedSave) {
    const map = {};
    const saveCmds = [];
    for (const [k, v] of Object.entries(state.toggles)) {
      const it = items.get(k);
      if (!v || !it || it.native || it.persist === 'none') continue;
      map[k] = it.persist || 'session';
      if (it.persist === 'save') saveCmds.push(...it.on); // safe to repeat (forceav)
    }
    return api.setToggles(map, !!changedSave, saveCmds);
  }

  const activeToggles = () => Object.entries(state.toggles).filter(([, v]) => v).map(([k]) => items.get(k)).filter((it) => it && !it.native && it.persist !== 'none');

  // Put the remembered cheats back into the game.
  //   full: everything (Skyrim was restarted); otherwise only save-stored stat cheats (death reload).
  let reapplying = null;
  function reapply({ full, checkpoint } = {}) {
    if (reapplying) return reapplying;
    reapplying = (async () => {
      const list = activeToggles().filter((it) => full || it.persist === 'save');
      if (!list.length) { if (full) await api.reapplyDone(true); return true; }
      const cmds = list.flatMap((it) => it.on);
      if (checkpoint) cmds.push('save DovahCheats');
      const res = await api.run(cmds);
      if (res.ok) await api.reapplyDone(!!full);
      log(full ? `Restored ${list.length} cheat${list.length > 1 ? 's' : ''}` : `Refreshed ${list.length} cheat${list.length > 1 ? 's' : ''}`, cmds, res);
      if (!res.ok) toast('Could not restore your cheats', res.error, true);
      return res.ok;
    })().finally(() => { reapplying = null; });
    return reapplying;
  }

  async function setToggle(it, on, card) {
    if (it.native === 'autoskip') {
      if (on && state.subtitles === false) toast('Turn on dialogue subtitles first', 'Skyrim only lets you skip lines with subtitles on (see below)', true);
      applyNative(it.key, await api.setAutoSkip(on));
      log(`${it.name} ${on ? 'ON' : 'OFF'}`, [on ? 'presses Activate ~1/s for 45 seconds' : 'stopped'], { ok: true });
      return;
    }
    // First time in this Skyrim session? Restore the remembered cheats before changing one,
    // otherwise a later restore would flip this toggle back.
    try { if ((await api.sessionCheck()).fresh) await reapply({ full: true }); } catch { /* ignore */ }
    const ok = await run(on ? it.on : it.off, `${it.name} ${on ? 'ON' : 'OFF'}`, card);
    if (!ok) return;
    state.toggles[it.key] = on;
    if (!on) delete state.toggles[it.key];
    persistToggles(it.persist === 'save' && on);
    card?.classList.toggle('on', on);
    updateCounts();
  }

  // ---------------- Log & toasts ----------------
  function log(label, cmds, res) {
    const ol = $('#log-list');
    $('.empty', ol)?.remove();
    const li = document.createElement('li');
    if (!res.ok) li.className = 'err';
    li.innerHTML = `${esc(label)}<small>${esc(res.ok ? cmds.join('; ') : res.error)}</small>`;
    ol.prepend(li);
    while (ol.children.length > 40) ol.lastChild.remove();
  }

  function toast(title, sub, err) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.innerHTML = `${icon(err ? 'x' : 'check')}<div><b>${esc(title)}</b><span>${esc(sub || '')}</span></div>`;
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); t.addEventListener('animationend', () => t.remove(), { once: true }); }, 3200);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  }

  function updateCounts() {
    const active = Object.entries(state.toggles).filter(([, v]) => v);
    const b = $('#active-count');
    if (b.textContent !== String(active.length)) { b.textContent = active.length; b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 250); }
    $$('.nav-item').forEach((n) => {
      const c = active.filter(([k]) => items.get(k)?.tab === n.dataset.tab).length;
      const badge = $('.badge', n);
      badge.textContent = c; badge.classList.toggle('show', c > 0);
    });
  }

  // ---------------- Navigation ----------------
  function renderNav() {
    $('#nav').innerHTML = TABS.map((t) =>
      `<button class="nav-item" data-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span><i class="badge">0</i></button>`).join('');
    $$('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  }

  function moveIndicator() {
    const active = $(`.nav-item[data-tab="${state.tab}"]`);
    if (!active) return;
    const ind = $('#nav-indicator');
    ind.style.height = active.offsetHeight + 'px';
    ind.style.transform = `translateY(${active.offsetTop}px)`;
  }

  function go(id) {
    if (!TABS.some((t) => t.id === id)) id = 'player';
    state.tab = id; store.set('tab', id);
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.tab === id));
    moveIndicator();
    const page = $('#page');
    page.classList.remove('enter'); void page.offsetWidth; page.classList.add('enter');
    $('#content').scrollTop = 0;
    const tab = TABS.find((t) => t.id === id);
    const head = `<div class="page-head"><h1>${tab.label}</h1><p>${tab.blurb}</p></div>`;
    page.innerHTML = head + (tab.custom ? CUSTOM[tab.custom]() : renderSections(tab));
    bindPage(tab);
  }

  // ---------------- Generic sections ----------------
  function renderSections(tab) {
    let i = 0;
    return tab.sections.map((s) => `
      <section class="section"><div class="section-title">${s.title}</div>
        <div class="grid">${s.items.map((it) => renderItem(it, i++)).join('')}</div>
      </section>`).join('');
  }

  const hk = (it) => (it.hotkey ? `<span class="kbd">${it.hotkey}</span>` : '');
  const meta = (it) => `<div class="meta"><h4>${esc(it.name)} ${hk(it)}</h4><p>${esc(it.desc)}</p></div>`;

  function renderItem(it, i) {
    const k = `data-key="${it.key}" style="--i:${i}"`;
    switch (it.type) {
      case 'toggle':
        return `<div class="card toggle ${state.toggles[it.key] ? 'on' : ''}" ${k} role="switch" tabindex="0">${meta(it)}<div class="switch"></div></div>`;
      case 'button':
        return `<div class="card" ${k}>${meta(it)}<button class="btn ${it.danger ? 'danger' : ''}" data-act>${esc(it.label)}</button></div>`;
      case 'note':
        return `<div class="card" ${k}><span class="kbd" style="font-size:12px;padding:4px 9px">F11</span>${meta(it)}</div>`;
      case 'subtitles':
        return `<div class="card wide subs ${state.subtitles === false ? 'warn' : ''}" ${k}>
          <div class="meta"><h4>Dialogue subtitles: <span class="subs-state">${state.subtitles === false ? 'OFF' : 'ON'}</span></h4>
          <p>Skyrim only lets you skip lines with subtitles on. To turn them on while playing, go to <b>System › Settings › Display › Dialogue Subtitles</b>. If the game is closed, use this button instead.</p></div>
          <button class="btn" data-act ${state.subtitles === false ? '' : 'disabled'}>Turn on</button></div>`;
      case 'number':
        return `<div class="card" ${k}>${meta(it)}<div class="row"><input class="field" type="number" min="${it.min}" max="${it.max}" value="${it.value}"><button class="btn" data-act>${esc(it.label)}</button></div></div>`;
      case 'chips':
        return `<div class="card wide" ${k}>${meta(it)}<div class="chips">${it.options.map((o) => `<button class="chip" data-val="${o}">${esc(it.fmt(o))}</button>`).join('')}</div></div>`;
      case 'select':
        return `<div class="card wide" ${k}>${meta(it)}<div class="row"><select class="field">${it.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select><button class="btn" data-act>${esc(it.label)}</button></div></div>`;
      case 'pick':
        return `<div class="card wide" ${k}>${meta(it)}<div class="row"><select class="field">${it.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
          <input class="field num" type="number" min="${it.min}" max="${it.max}" value="${it.value}"><button class="btn" data-act>${esc(it.label)}</button></div></div>`;
      case 'quest':
        return `<div class="card wide quest" ${k}>${meta(it)}<div class="row"><select class="field wide-field">${it.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
          <button class="btn secondary" data-go title="Teleport to this quest's current objective">Go to objective</button><button class="btn" data-done>Complete</button></div></div>`;
      case 'text':
        return `<div class="card wide" ${k}>${meta(it)}<div class="row"><input class="field wide-field" placeholder="${esc(it.placeholder || '')}" spellcheck="false">
          <button class="btn ${it.danger ? 'danger' : ''}" data-act>${esc(it.label)}</button></div></div>`;
      case 'autosave': {
        const c = state.config || {};
        const mins = Number(c.autosaveMinutes) || 10;
        return `<div class="card wide toggle ${c.autosave !== false ? 'on' : ''}" ${k} id="autosave-card">${meta(it)}
          <div class="row"><select class="field" id="autosave-mins" style="width:150px">${[5, 10, 15, 30].map((m) => `<option value="${m}" ${m === mins ? 'selected' : ''}>Every ${m} min</option>`).join('')}</select>
          <div class="switch"></div></div></div>`;
      }
      case 'savenow':
        return `<div class="card" ${k}>${meta(it)}<button class="btn" data-act>Save now</button></div>`;
      case 'questid':
        return `<div class="card wide quest" ${k}>${meta(it)}<div class="row"><input class="field wide-field" placeholder="Quest ID, e.g. DA01" spellcheck="false">
          <button class="btn secondary" data-go>Go to objective</button><button class="btn" data-done>Complete</button></div></div>`;
      case 'slider': {
        const v = store.get('slider:' + it.key, it.value);
        return `<div class="card slider-card" ${k}>${meta(it)}<div class="slider-val">${v}${it.unit || ''}</div>
          <div class="slider-row"><input type="range" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}"><button class="btn" data-act>Apply</button></div></div>`;
      }
      default: return '';
    }
  }

  function fillRange(r) { r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min)) * 100 + '%'); }

  function bindPage(tab) {
    if (tab.custom) return BIND[tab.custom]?.();
    $$('#page .card').forEach((card) => {
      const it = items.get(card.dataset.key);
      if (it.type === 'toggle') {
        const flip = () => setToggle(it, !state.toggles[it.key], card);
        card.addEventListener('click', flip);
        card.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
      } else if (it.type === 'subtitles') {
        $('[data-act]', card).addEventListener('click', async () => {
          const r = await api.fixSubtitles();
          if (!r.ok) return toast('Could not change subtitles', r.error, true);
          state.subtitles = true;
          toast('Dialogue subtitles turned on', 'Applies the next time you start Skyrim');
          go(state.tab);
        });
      } else if (it.type === 'button') {
        $('[data-act]', card).addEventListener('click', async () => {
          let cmds = it.cmds;
          if (it.dynamic === 'loadLatest') {
            const last = await api.lastSave();
            if (!last) return toast('No trainer save yet', 'Turn on Auto-Save or use Save Now first', true);
            cmds = [`load ${last.name}`];
          }
          if (it.danger && !confirm(`${it.name}?\n\n${it.desc}`)) return;
          run(cmds, it.name, card);
        });
      } else if (it.type === 'text') {
        const inp = $('input', card);
        const go = () => {
          const v = inp.value.trim();
          if (!it.pattern.test(v)) return toast('Check the value', it.placeholder || 'Invalid input', true);
          if (it.danger && !confirm(`${it.name}: ${v}?\n\n${it.desc}`)) return;
          run(it.cmds(v), `${it.name}: ${v}`, card);
        };
        $('[data-act]', card).addEventListener('click', go);
        inp.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      } else if (it.type === 'autosave') {
        $('#autosave-mins', card).addEventListener('click', (e) => e.stopPropagation());
        $('#autosave-mins', card).addEventListener('change', async (e) => {
          state.config = await api.setConfig({ autosaveMinutes: Number(e.target.value) });
          toast('Auto-save interval saved', `Every ${e.target.value} minutes`);
        });
        card.addEventListener('click', async (e) => {
          if (e.target.closest('select')) return;
          state.config = await api.setConfig({ autosave: state.config.autosave === false });
          card.classList.toggle('on', state.config.autosave !== false);
          toast(state.config.autosave !== false ? 'Auto-Save on' : 'Auto-Save off', state.config.autosave !== false ? `Saving every ${state.config.autosaveMinutes || 10} minutes while you play` : 'No timed saves');
        });
      } else if (it.type === 'savenow') {
        $('[data-act]', card).addEventListener('click', async () => {
          card.classList.add('busy');
          const res = await api.saveNow();
          card.classList.remove('busy');
          log('Save Now', ['save DovahAuto…'], res);
          toast(res.ok ? 'Game saved' : 'Could not save', res.ok ? 'Saved to a DovahAuto slot' : res.error, !res.ok);
        });
      } else if (it.type === 'number') {
        const inp = $('input', card);
        const go = () => {
          const v = Math.round(Number(inp.value));
          if (!Number.isFinite(v) || v < it.min || v > it.max) return toast('Invalid value', `Enter ${it.min}–${it.max}`, true);
          run(it.cmds(v), `${it.name}: ${v.toLocaleString()}`, card);
        };
        $('[data-act]', card).addEventListener('click', go);
        inp.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      } else if (it.type === 'chips') {
        $$('.chip', card).forEach((c) => c.addEventListener('click', () => run(it.cmds(Number(c.dataset.val)), `${it.name} ${it.fmt(Number(c.dataset.val))}`, card)));
      } else if (it.type === 'select') {
        const sel = $('select', card);
        $('[data-act]', card).addEventListener('click', () => run(it.cmds(sel.value), `${it.name}: ${sel.selectedOptions[0].text}`, card));
      } else if (it.type === 'pick') {
        const sel = $('select', card), inp = $('input', card);
        $('[data-act]', card).addEventListener('click', () => {
          const v = Math.round(Number(inp.value));
          if (!Number.isFinite(v) || v < it.min || v > it.max) return toast('Invalid value', `Enter ${it.min}–${it.max}`, true);
          run(it.cmds(sel.value, v), `${it.name}: ${sel.selectedOptions[0].text} ${v.toLocaleString()}`, card);
        });
      } else if (it.type === 'quest' || it.type === 'questid') {
        const field = $('select, input', card);
        const quest = () => {
          const id = field.value.trim();
          if (!/^[A-Za-z0-9_]{2,40}$/.test(id)) { toast('Enter a quest ID', 'Letters, numbers and _ only, e.g. MQ101', true); return null; }
          return { id, name: field.tagName === 'SELECT' ? field.selectedOptions[0].text : id };
        };
        $('[data-go]', card).addEventListener('click', () => {
          const q = quest(); if (q) run([`movetoqt ${q.id}`], `Go to objective: ${q.name}`, card);
        });
        $('[data-done]', card).addEventListener('click', () => {
          const q = quest(); if (!q) return;
          if (!confirm(`Complete "${q.name}"?\n\nThe quest is marked done right away. Rewards that are handed out in dialogue may be skipped, and the next quest may not start by itself. Quick Save first if you're unsure.`)) return;
          run([`completequest ${q.id}`], `Completed: ${q.name}`, card);
        });
      } else if (it.type === 'slider') {
        const r = $('input', card), out = $('.slider-val', card);
        fillRange(r);
        r.addEventListener('input', () => { fillRange(r); out.textContent = r.value + (it.unit || ''); });
        r.addEventListener('change', () => store.set('slider:' + it.key, Number(r.value)));
        $('[data-act]', card).addEventListener('click', () => run(it.cmds(Number(r.value)), `${it.name}: ${r.value}${it.unit || ''}`, card));
      }
    });
  }

  // ---------------- Custom pages ----------------
  const ACH = [
    { n: 'Level Up the Natural Way', d: 'Adds skill XP so the game levels you up for real; level milestone achievements can unlock as you go.', l: 'Gain levels', c: ['player.advskill onehanded 3000', 'player.advskill destruction 3000', 'player.advskill smithing 3000'] },
    { n: 'Skill Master', d: 'Trains every skill toward 100 through real skill-ups (the game decides when achievements fire).', l: 'Train all skills', c: SKILLS.map((s) => `player.advskill ${s} 25000`) },
    { n: 'Dragon Soul Collector', d: 'Adds dragon souls so you can unlock shouts.', l: '+20 souls', c: ['player.modav dragonsouls 20'] },
    { n: 'Gold Hoarder', d: 'Stacks gold for the wealth-related challenges.', l: '+100k gold', c: ['player.additem f 100000'] },
  ];

  const CUSTOM = {
    shop() {
      let i = 0;
      return `
        <div class="shop-bar">
          <div><b>Dragonborn Emporium</b><p style="color:var(--muted);font-size:12.5px">Purchases are delivered straight to your inventory.</p></div>
          <div class="pay-toggle ${state.payWithGold ? 'on' : ''}" id="pay"><span style="font-size:13px">Pay with in-game gold</span><div class="switch"></div></div>
        </div>
        ${SHOP.map((c) => `<section class="section"><div class="section-title">${c.cat}</div><div class="shop-grid">
          ${c.items.map((it) => `<div class="item" style="--i:${i++}" data-id="${it.id}">
            ${it.tag ? `<span class="tag ${it.tag}">${it.tag}</span>` : ''}
            <div class="glyph">${esc(it.name[0])}</div><h5>${esc(it.name)}</h5>
            <div class="foot"><span class="price ${state.payWithGold ? '' : 'free'}">${icon('coins')}${state.payWithGold ? it.price.toLocaleString() : 'FREE'}</span>
            <button class="btn" data-buy>Buy</button></div></div>`).join('')}
        </div></section>`).join('')}
        <section class="section"><div class="section-title">Custom Order</div>
          <div class="card wide" style="--i:${i}"><div class="meta"><h4>Spawn by FormID</h4><p>Any item ID from UESP (e.g. 0001396B). Load-order prefixes apply for DLC items.</p></div>
          <div class="row"><input class="field" id="cust-id" placeholder="FormID" style="width:130px"><input class="field" id="cust-qty" type="number" value="1" min="1" style="width:80px"><button class="btn" id="cust-go">Spawn</button></div></div>
        </section>`;
    },

    achievements() {
      const ach = ACH;
      return `
        <div class="notice"><b>How this works:</b> Skyrim only grants Steam achievements when the game itself sees the event happen.
          This trainer uses the console only and loads no plugins, so achievements stay enabled. The actions below trigger
          real in-game progress (skill-ups and level-ups) and leave it to the game to award what you've earned.
          To unlock achievements directly, use the open-source <b>Steam Achievement Manager</b>.</div>
        <div class="grid">
          ${ach.map((a, i) => `<div class="card" style="--i:${i}" data-i="${i}"><div class="ach-icon">${icon('trophy')}</div>
            <div class="meta"><h4>${esc(a.n)}</h4><p>${esc(a.d)}</p></div><button class="btn" data-act>${esc(a.l)}</button></div>`).join('')}
          <div class="card wide" style="--i:${ach.length}"><div class="ach-icon">${icon('link')}</div>
            <div class="meta"><h4>Steam Achievement Manager</h4><p>Open-source tool by gibbed for unlocking or relocking Steam achievements.</p></div>
            <button class="btn frost" id="sam">Open on GitHub</button></div>
        </div>`;
    },

    mods() {
      const c = state.config || {};
      return `
        <div class="notice"><b>Heads up:</b> loading mod plugins turns off Steam achievements, and many mods also need SKSE.
          This is a simple manager: it installs plain .zip/.7z mods, never overwrites existing files, and leaves installer
          (FOMOD) mods to Vortex or Mod Organizer 2. Restart Skyrim after changing plugins.</div>
        <section class="section"><div class="section-title">Installed plugins</div>
          <div class="card wide"><div class="meta"><h4>Install a mod from file</h4><p>Pick a .zip or .7z you downloaded (e.g. via "Manual download" on Nexus). Its files go into your Data folder and its plugins are switched on.</p></div>
            <button class="btn" id="mod-install">Choose file…</button></div>
          <div class="plugin-list" id="plugin-list"><div class="empty-note">Loading plugins…</div></div>
          <div id="trainer-mods"></div>
        </section>
        <section class="section"><div class="section-title">Nexus Mods</div>
          <div class="card wide"><div class="meta"><h4>Nexus Mods API key <span id="nx-user" class="pill-ok"></span></h4>
            <p>Lets the trainer list mods from Nexus. Get your personal key from your Nexus account's API Keys page. It's stored only on this PC.</p></div>
            <div class="row"><input class="field wide-field" id="nx-key" type="password" placeholder="Paste your API key" value="${esc(c.nexusKey || '')}" spellcheck="false">
            <button class="btn secondary" id="nx-get">Get a key</button><button class="btn" id="nx-save">Save</button></div></div>
          <div class="seg" id="nx-tabs"><button data-kind="trending" class="on">Trending</button><button data-kind="latest">Latest</button><button data-kind="updated">Recently updated</button></div>
          <div class="nexus-grid" id="nx-grid"><div class="empty-note">Add your API key to browse mods.</div></div>
        </section>`;
    },

    console() {
      const quick = ['tgm', 'tcl', 'tfc', 'tmm 1', 'psb', 'killall', 'player.setav speedmult 100', 'coc qasmoke', 'resurrect', 'help'];
      return `
        <div class="term"><div class="term-out" id="term-out"><div>Dovah Trainer console bridge ready. Commands run through <span class="cmd">bat dovahtrainer</span>.</div>
          <div>Separate several commands with <span class="cmd">;</span> &nbsp;·&nbsp; ↑/↓ for history.</div></div>
          <div class="term-in"><span>&gt;</span><input id="term-in" placeholder="player.additem f 500" spellcheck="false" autocomplete="off"></div></div>
        <div class="quick">${quick.map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <p style="color:var(--dim);font-size:12px;margin-top:14px">Command reference: <a href="#" id="uesp" style="color:var(--frost)">UESP Skyrim:Console</a></p>`;
    },

    settings() {
      const c = state.config;
      const scanHex = '0x' + Number(c.consoleScan).toString(16).toUpperCase();
      return `
        <section class="section"><div class="section-title">Game</div><div class="grid">
          <div class="card wide" style="--i:0">${icon('folder')}<div class="meta"><h4>Skyrim Special Edition folder <span id="path-ok"></span></h4><div class="set-path" id="game-path">${esc(c.gamePath || 'Not set')}</div></div>
            <div class="row"><button class="btn frost" id="detect">Auto-detect</button><button class="btn" id="browse">Browse…</button></div></div>
        </div></section>
        <section class="section"><div class="section-title">Input</div><div class="grid">
          <div class="card" style="--i:1"><div class="meta"><h4>Console key scan code</h4><p>0x29 is the ~ key on US keyboards. Change it if your layout opens the console with a different key.</p></div>
            <input class="field" id="scan" value="${scanHex}" style="width:90px"></div>
          <div class="card" style="--i:2"><div class="meta"><h4>Key delay (ms)</h4><p>Raise this if commands are cut off or the console doesn't open in time.</p></div>
            <input class="field" id="delay" type="number" min="15" max="300" value="${c.keyDelay}" style="width:90px"></div>
          <div class="card" style="--i:3"><div class="meta"><h4>Activate key scan code</h4><p>Used to skip dialogue. 0x12 is E. Change it if you rebound Activate in game.</p></div>
            <input class="field" id="act-scan" value="0x${Number(c.activateScan ?? 0x12).toString(16).toUpperCase()}" style="width:90px"></div>
          <div class="card toggle ${c.hotkeys ? 'on' : ''}" id="hk" style="--i:3"><div class="meta"><h4>Global hotkeys</h4><p>F1–F4, F6–F8 and F10 toggle cheats while the trainer panel is open. Skyrim blocks normal hotkeys while you play, and the trainer never monitors your keyboard, so use the floating button to open it.</p></div><div class="switch"></div></div>
        </div></section>
        <section class="section"><div class="section-title">Keeping cheats on</div><div class="grid">
          <div class="card wide toggle ${c.checkpoint !== false ? 'on' : ''}" id="cp"><div class="meta"><h4>Checkpoint save when returning to the game</h4>
            <p>Dying reloads your last save, which drops stat cheats (Infinite Magicka, Speed, Crit...). When you go back to the game, the trainer re-applies them and saves to a "DovahCheats" slot, so the next death reloads a save that still has them. God Mode, No Clip and other toggles survive death by themselves; after you restart Skyrim, all your cheats are re-applied the next time you open the trainer.</p></div><div class="switch"></div></div>
        </div></section>
        <section class="section"><div class="section-title">Updates</div><div class="grid">
          <div class="card wide" style="--i:4"><div class="meta"><h4>Version <span class="ver">${esc(state.version)}</span></h4>
            <p id="upd-text">${esc(updateText())}</p></div>
            <div class="row"><button class="btn frost" id="upd-check">Check for updates</button><button class="btn" id="upd-notes">Release notes</button><button class="ghost" data-win="quit">Quit trainer</button></div></div>
        </div></section>
        <section class="section"><div class="section-title">Hotkey map</div><div class="grid">
          ${[['Button', 'Floating "Dovah Trainer" button (top-right) opens the panel'], ['Esc', 'Minimize to the button'], ...[...hotkeys].map(([k, it]) => [k, it.name])]
            .map(([k, name], i) => `<div class="card" style="--i:${i + 4}"><span class="kbd">${k}</span><div class="meta"><h4>${esc(name)}</h4></div></div>`).join('')}
        </div></section>`;
    },
  };

  const BIND = {
    async mods() {
      const m = api.mods;
      const renderPlugins = async () => {
        const list = await m.plugins();
        const box = $('#plugin-list');
        if (!box) return;
        if (!list.length) { box.innerHTML = '<div class="empty-note">No plugins found. Check the game folder in Settings.</div>'; return; }
        box.innerHTML = list.map((p) => `<div class="plugin ${p.enabled ? 'on' : ''} ${p.official ? 'official' : ''}" data-name="${esc(p.name)}">
          <span class="pname">${esc(p.name)}</span>${p.official ? '<span class="ptag">Official</span>' : '<div class="switch"></div>'}</div>`).join('');
        $$('.plugin:not(.official)', box).forEach((row) => row.addEventListener('click', async () => {
          const on = !row.classList.contains('on');
          const r = await m.setPlugin(row.dataset.name, on);
          if (!r.ok) return toast('Could not change plugin', r.error, true);
          row.classList.toggle('on', on);
          toast(`${row.dataset.name} ${on ? 'enabled' : 'disabled'}`, 'Restart Skyrim to apply');
        }));
      };
      const renderInstalled = async () => {
        const inst = await m.installed();
        const names = Object.keys(inst);
        const box = $('#trainer-mods');
        if (!box) return;
        box.innerHTML = names.length ? `<div class="section-title" style="margin-top:16px">Installed by the trainer</div>` + names.map((n) => `
          <div class="card wide"><div class="meta"><h4>${esc(n)}</h4><p>${inst[n].files.length} files${inst[n].plugins.length ? ' · ' + inst[n].plugins.map(esc).join(', ') : ''}</p></div>
          <button class="btn danger" data-un="${esc(n)}">Uninstall</button></div>`).join('') : '';
        $$('[data-un]', box).forEach((b) => b.addEventListener('click', async () => {
          if (!confirm(`Uninstall ${b.dataset.un}?\n\nIts files are deleted from your Data folder.`)) return;
          const r = await m.uninstall(b.dataset.un);
          toast(r.ok ? 'Mod uninstalled' : 'Could not uninstall', r.ok ? b.dataset.un : r.error, !r.ok);
          renderInstalled(); renderPlugins();
        }));
      };
      $('#mod-install').addEventListener('click', async () => {
        const r = await m.install();
        if (!r) return;
        if (!r.ok) return toast('Not installed', r.error, true);
        toast(`Installed ${r.name}`, `${r.files.length} files${r.plugins.length ? ', plugins enabled: ' + r.plugins.join(', ') : ''}`);
        log(`Installed mod: ${r.name}`, [`${r.files.length} files`], { ok: true });
        renderInstalled(); renderPlugins();
      });

      // Nexus
      let kind = 'trending';
      const grid = () => $('#nx-grid');
      const loadNexus = async () => {
        if (!grid()) return;
        if (!state.config.nexusKey) { grid().innerHTML = '<div class="empty-note">Add your API key to browse mods.</div>'; return; }
        grid().innerHTML = '<div class="empty-note">Loading from Nexus…</div>';
        const r = await m.nexusList(kind);
        if (!grid()) return;
        if (!r.ok) { grid().innerHTML = `<div class="empty-note err">${esc(r.error)}</div>`; return; }
        grid().innerHTML = r.mods.map((x) => `<div class="nx-card">
          ${x.picture ? `<img src="${esc(x.picture)}" alt="" loading="lazy">` : '<div class="nx-noimg"></div>'}
          <div class="nx-body"><h5>${esc(x.name)}</h5><p class="nx-by">by ${esc(x.author || 'unknown')} · v${esc(x.version || '?')} · ${Number(x.endorsements || 0).toLocaleString()} endorsements</p>
          <p class="nx-sum">${esc(x.summary || '')}</p><button class="btn secondary" data-nx="${Number(x.id)}">Open on Nexus</button></div></div>`).join('') || '<div class="empty-note">Nothing here right now.</div>';
        $$('[data-nx]', grid()).forEach((b) => b.addEventListener('click', () => m.nexusOpen(b.dataset.nx)));
      };
      $('#nx-get').addEventListener('click', () => m.nexusPage('apikey'));
      $('#nx-save').addEventListener('click', async () => {
        const key = $('#nx-key').value.trim();
        const v = key ? await m.nexusValidate(key) : { ok: true };
        if (!v.ok) return toast('Key not accepted', v.error, true);
        state.config = await api.setConfig({ nexusKey: key });
        $('#nx-user').textContent = v.name ? `● ${v.name}${v.premium ? ' (Premium)' : ''}` : '';
        toast(key ? 'Nexus key saved' : 'Nexus key removed', v.name ? `Signed in as ${v.name}` : '');
        loadNexus();
      });
      $$('#nx-tabs button').forEach((b) => b.addEventListener('click', () => {
        $$('#nx-tabs button').forEach((x) => x.classList.toggle('on', x === b));
        kind = b.dataset.kind; loadNexus();
      }));
      renderPlugins(); renderInstalled(); loadNexus();
    },

    shop() {
      $('#pay').addEventListener('click', () => { state.payWithGold = !state.payWithGold; store.set('payWithGold', state.payWithGold); go('shop'); });
      $$('.item').forEach((el) => {
        const it = SHOP.flatMap((c) => c.items).find((x) => x.id === el.dataset.id);
        $('[data-buy]', el).addEventListener('click', async (e) => {
          const cmds = [`player.additem ${it.id} ${it.qty || 1}`];
          if (state.payWithGold) cmds.unshift(`player.removeitem f ${it.price}`);
          await run(cmds, `Bought ${it.name}`, el);
        });
      });
      $('#cust-go').addEventListener('click', () => {
        const id = $('#cust-id').value.trim().replace(/^0x/i, '');
        const qty = Math.max(1, Math.round(Number($('#cust-qty').value)) || 1);
        if (!/^[0-9a-f]{1,8}$/i.test(id)) return toast('Invalid FormID', 'Use up to 8 hex digits', true);
        run([`player.additem ${id} ${qty}`], `Spawned ${qty}× ${id}`, $('#cust-go').closest('.card'));
      });
    },

    achievements() {
      $$('#page .card[data-i]').forEach((card) => {
        const a = ACH[card.dataset.i];
        $('[data-act]', card).addEventListener('click', () => run(a.c, a.n, card));
      });
      $('#sam').addEventListener('click', () => api.openLink('https://github.com/gibbed/SteamAchievementManager'));
    },

    console() {
      const inp = $('#term-in'), out = $('#term-out');
      let hi = -1;
      const print = (html) => { const d = document.createElement('div'); d.innerHTML = html; out.append(d); out.scrollTop = out.scrollHeight; };
      const exec = async (line) => {
        const cmds = line.split(';').map((s) => s.trim()).filter(Boolean);
        if (!cmds.length) return;
        state.history = [line, ...state.history.filter((h) => h !== line)].slice(0, 50); store.set('history', state.history);
        print(`<span class="cmd">&gt; ${esc(line)}</span>`);
        const res = await api.run(cmds);
        log('Console', cmds, res);
        print(res.ok ? '<span class="ok">✓ sent to game</span>' : `<span class="err">✗ ${esc(res.error)}</span>`);
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { exec(inp.value); inp.value = ''; hi = -1; }
        else if (e.key === 'ArrowUp') { hi = Math.min(hi + 1, state.history.length - 1); inp.value = state.history[hi] || ''; e.preventDefault(); }
        else if (e.key === 'ArrowDown') { hi = Math.max(hi - 1, -1); inp.value = state.history[hi] || ''; e.preventDefault(); }
      });
      $$('[data-q]').forEach((b) => b.addEventListener('click', () => exec(b.dataset.q)));
      $('#uesp').addEventListener('click', (e) => { e.preventDefault(); api.openLink('https://en.uesp.net/wiki/Skyrim:Console'); });
      inp.focus();
    },

    settings() {
      const showPath = (p) => {
        $('#game-path').textContent = p || 'Not set';
        refreshStatus();
      };
      $('#detect').addEventListener('click', async () => {
        const p = await api.detectGame();
        if (!p) return toast('Skyrim not found', 'Use Browse to pick the folder that holds SkyrimSE.exe', true);
        state.config = await api.setConfig({ gamePath: p }); showPath(p); toast('Game folder found', p);
      });
      $('#browse').addEventListener('click', async () => {
        const r = await api.browseGame();
        if (!r) return;
        if (!r.valid) return toast('That folder has no SkyrimSE.exe', r.path, true);
        state.config = await api.setConfig({ gamePath: r.path }); showPath(r.path); toast('Game folder saved', r.path);
      });
      $('#scan').addEventListener('change', async (e) => {
        const v = parseInt(e.target.value, e.target.value.trim().toLowerCase().startsWith('0x') ? 16 : 10);
        if (!(v > 0 && v < 256)) return toast('Invalid scan code', 'Use a value like 0x29', true);
        state.config = await api.setConfig({ consoleScan: v }); toast('Console key saved', '0x' + v.toString(16).toUpperCase());
      });
      $('#act-scan').addEventListener('change', async (e) => {
        const v = parseInt(e.target.value, e.target.value.trim().toLowerCase().startsWith('0x') ? 16 : 10);
        if (!(v > 0 && v < 256)) return toast('Invalid scan code', 'Use a value like 0x12', true);
        state.config = await api.setConfig({ activateScan: v }); toast('Activate key saved', '0x' + v.toString(16).toUpperCase());
      });
      $('#delay').addEventListener('change', async (e) => {
        const v = Math.min(300, Math.max(15, Math.round(Number(e.target.value)) || 45));
        e.target.value = v; state.config = await api.setConfig({ keyDelay: v }); toast('Key delay saved', v + ' ms');
      });
      $('#hk').addEventListener('click', async () => {
        state.config = await api.setConfig({ hotkeys: !state.config.hotkeys });
        $('#hk').classList.toggle('on', state.config.hotkeys);
      });
      $('#cp').addEventListener('click', async () => {
        state.config = await api.setConfig({ checkpoint: state.config.checkpoint === false });
        $('#cp').classList.toggle('on', state.config.checkpoint !== false);
      });
      $('#upd-check').addEventListener('click', async () => {
        const r = await api.checkUpdate();
        if (r?.dev) toast('Updates are disabled in dev mode', 'Install the released .exe to get auto-updates');
      });
      $('#upd-notes').addEventListener('click', () => api.openLink(RELEASES_URL));
      $('#page [data-win="quit"]').addEventListener('click', () => api.window('quit'));
      refreshStatus();
    },
  };

  // ---------------- Auto-update ----------------
  const RELEASES_URL = 'https://github.com/jjtjtyt6644/Skyrim-mod/releases';
  state.update = { state: 'idle' };

  function updateText() {
    const u = state.update;
    return ({
      idle: 'Updates are checked automatically on launch and every hour.',
      checking: 'Checking GitHub for a new release…',
      latest: "You're on the latest version.",
      available: `Version ${u.version} found — downloading…`,
      downloading: `Downloading update… ${u.percent || 0}%`,
      ready: `Version ${u.version} is ready. Restart to install it.`,
      error: `Update check failed: ${u.message}`,
    })[u.state] || '';
  }

  function onUpdate(info) {
    const prev = state.update.state;
    state.update = { ...state.update, ...info };
    const pill = $('#update-pill'), label = $('span', pill);
    pill.classList.toggle('ready', info.state === 'ready');
    if (info.state === 'available' || info.state === 'downloading') {
      pill.hidden = false;
      pill.style.setProperty('--p', (info.percent || 0) + '%');
      label.textContent = `Updating ${info.percent != null ? info.percent + '%' : '…'}`;
    } else if (info.state === 'ready') {
      pill.hidden = false;
      label.textContent = `Restart to update · v${info.version}`;
      if (prev !== 'ready') toast(`Update v${info.version} ready`, 'Click the gold button in the title bar to restart');
    } else {
      pill.hidden = true;
    }
    const t = $('#upd-text');
    if (t) t.textContent = updateText();
  }

  $('#update-pill').addEventListener('click', () => { if (state.update.state === 'ready') api.installUpdate(); });
  api.onUpdate(onUpdate);

  // ---------------- Status ----------------
  async function refreshStatus() {
    let s;
    try { s = await api.status(); } catch { s = { game: false, pathOk: false }; }
    const el = $('#status');
    el.className = 'status ' + (!s.pathOk ? 'warn' : s.game ? 'on' : 'off');
    $('span', el).textContent = !s.pathOk ? 'Set game folder in Settings' : s.game ? 'Skyrim connected' : 'Waiting for Skyrim…';
    if (typeof s.autoSkip === 'boolean' && !!state.toggles.autoskip !== s.autoSkip) applyNative('autoskip', s.autoSkip);
    if (typeof s.subtitles === 'boolean' && s.subtitles !== state.subtitles) {
      const first = state.subtitles === undefined;
      state.subtitles = s.subtitles;
      if (!first && state.tab === 'world') go('world');
      else { const c = $('#page .card.subs'); if (c) { c.classList.toggle('warn', !s.subtitles); $('.subs-state', c).textContent = s.subtitles ? 'ON' : 'OFF'; $('[data-act]', c).disabled = s.subtitles; } }
    }
    $('#display-warn').hidden = s.display !== 'fullscreen';
    const po = $('#path-ok');
    if (po) po.innerHTML = s.pathOk ? '<span class="pill-ok">● valid</span>' : '<span class="pill-bad">● SkyrimSE.exe not found</span>';
  }

  // ---------------- Wiring ----------------
  $$('[data-win]').forEach((b) => b.addEventListener('click', () => api.window(b.dataset.win)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.target.closest('input, select')) api.window('hide');
  });
  api.onOverlay((open) => {
    document.body.classList.toggle('open', open);
    if (open) { refreshStatus(); requestAnimationFrame(moveIndicator); }
    setCapture(false); // re-evaluated on the next mouse move
  });

  // Click-through: the overlay window covers the screen but only the panel (when open)
  // or the floating button (when collapsed) take mouse clicks; everything else goes to
  // the game underneath.
  let capturing = null;
  function setCapture(on) { if (on !== capturing) { capturing = on; api.mouse(on); } }
  document.addEventListener('mousemove', (e) => {
    const open = document.body.classList.contains('open');
    const hit = open ? e.target.closest('#panel') : e.target.closest('#dock');
    setCapture(!!hit);
  });
  document.addEventListener('mouseleave', () => setCapture(false));
  $('#dock').addEventListener('click', () => api.window('show'));

  api.onAutoSaved(({ name, reason }) => {
    log(reason === 'timer' ? 'Auto-saved' : 'Saved', [`save ${name}`], { ok: true });
    $('#dock-saved').textContent = `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  });
  api.onGameClosed((last) => {
    toast('Skyrim closed', last ? `If it crashed, load "${last.name}" (Saves & Fixes → Load Latest Auto-Save)` : 'Turn on Auto-Save so a crash never costs you progress', !last);
  });
  $('#fix-display').addEventListener('click', async () => {
    const r = await api.fixDisplay();
    if (!r.ok) return toast('Could not change display mode', r.error, true);
    $('#display-warn').hidden = true;
    toast('Skyrim set to Borderless Windowed', 'Start the game, then click the floating "Dovah Trainer" button');
  });

  api.onAutoSkip(({ on, reason }) => {
    applyNative('autoskip', on);
    if (!on && reason === 'timeout') toast('Auto-Skip stopped', 'Turned off after 45 seconds');
  });

  $('#reset-all').addEventListener('click', async () => {
    if (state.toggles.autoskip) applyNative('autoskip', await api.setAutoSkip(false));
    const active = Object.entries(state.toggles).filter(([, v]) => v).map(([k]) => items.get(k)).filter((it) => it && !it.native);
    if (!active.length) return toast('Nothing to turn off', 'No toggles are active');
    const ok = await run(active.flatMap((it) => it.off), `Disabled ${active.length} cheat${active.length > 1 ? 's' : ''}`, null);
    if (!ok) return;
    state.toggles = {}; persistToggles(false);
    $$('#page .card.toggle').forEach((c) => !c.id && c.classList.remove('on'));
    updateCounts();
  });

  $('#reapply').addEventListener('click', async () => {
    if (!activeToggles().length) return toast('No cheats to restore', 'Turn some cheats on first');
    if (await reapply({ full: true })) toast('Cheats restored', 'Your active cheats were applied to the game again');
  });
  api.onReapply((opts) => reapply(opts));

  api.onHotkey((key) => {
    const it = hotkeys.get(key);
    if (!it) return;
    const card = $(`#page .card[data-key="${it.key}"]`);
    setToggle(it, !state.toggles[it.key], card);
  });

  addEventListener('resize', moveIndicator);

  (async function init() {
    state.config = await api.getConfig();
    state.version = await api.version();
    // Remembered cheats (kept in config.json by the main process).
    try { for (const k of Object.keys(await api.getToggles())) if (items.has(k)) state.toggles[k] = true; } catch { /* none */ }
    persistToggles(false); // refresh the stored re-apply commands (e.g. after an update changed them)
    try { const s = await api.status(); state.subtitles = s.subtitles; } catch { /* status unavailable */ }
    renderNav();
    $('#log-list').innerHTML = '<li class="empty">Nothing yet. Flip a cheat to get started.</li>';
    go(state.tab);
    updateCounts();
    refreshStatus();
    setInterval(refreshStatus, 4000);
    requestAnimationFrame(moveIndicator);
  })();
})();
