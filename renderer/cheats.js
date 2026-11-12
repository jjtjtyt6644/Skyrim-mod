// Cheat definitions. Every entry turns into console commands that are written
// to the batch file and run in-game with `bat dovahtrainer`.
// Command references: UESP Skyrim:Console and the CK ActorValueInfo list.

const SKILLS = ['OneHanded', 'TwoHanded', 'Marksman', 'Block', 'Smithing', 'HeavyArmor', 'LightArmor', 'Pickpocket',
  'Lockpicking', 'Sneak', 'Alchemy', 'Speechcraft', 'Alteration', 'Conjuration', 'Destruction', 'Illusion', 'Restoration', 'Enchanting'];

// Hold crime factions (for clearing bounties).
const CRIME_FACTIONS = ['000267EA', '0002816B', '00029DB0', '000267E3', '0002816C', '00028170', '0002816D', '0002816E', '0002816F'];

// Speed changes only apply once carry weight changes, so nudge it.
const speedCmds = (v) => [`player.setav speedmult ${v}`, 'player.modav carryweight 1', 'player.modav carryweight -1'];

window.TABS = [
  {
    id: 'player', label: 'Player', icon: 'user', blurb: 'Survival, combat and movement',
    sections: [
      {
        title: 'Survival',
        items: [
          { type: 'toggle', id: 'god', name: 'God Mode', desc: 'Invulnerable, unlimited magicka/stamina, no carry limit.', on: ['tgm'], off: ['tgm'], hotkey: 'F1' },
          { type: 'toggle', id: 'mana', name: 'Infinite Magicka', desc: 'Magicka refills almost instantly.', on: ['player.modav magickarate 5000'], off: ['player.modav magickarate -5000'], hotkey: 'F2' },
          { type: 'toggle', id: 'stam', name: 'Infinite Stamina', desc: 'Sprint and power-attack forever.', on: ['player.modav staminarate 5000'], off: ['player.modav staminarate -5000'], hotkey: 'F3' },
          { type: 'toggle', id: 'regen', name: 'Fast Health Regen', desc: 'Health regenerates rapidly, even in combat.', on: ['player.modav healrate 5000', 'player.modav combathealthregenmult 100'], off: ['player.modav healrate -5000', 'player.modav combathealthregenmult -100'] },
          { type: 'toggle', id: 'weight', name: 'Unlimited Carry Weight', desc: 'Never be over-encumbered.', on: ['player.modav carryweight 100000'], off: ['player.modav carryweight -100000'] },
          { type: 'button', name: 'Full Restore', desc: 'Refill health, magicka and stamina now.', label: 'Restore', cmds: ['player.restoreav health 100000', 'player.restoreav magicka 100000', 'player.restoreav stamina 100000'] },
        ],
      },
      {
        title: 'Combat',
        items: [
          { type: 'toggle', id: 'crit', name: 'Always Critical', desc: '100% critical hit chance.', on: ['player.setav critchance 100'], off: ['player.setav critchance 0'], hotkey: 'F4' },
          { type: 'toggle', id: 'ohk', name: 'One-Hit Kills', desc: '100x weapon attack damage.', on: ['player.setav attackdamagemult 100'], off: ['player.setav attackdamagemult 1'], hotkey: 'F6' },
          { type: 'toggle', id: 'stealth', name: 'Undetectable', desc: 'Turns off AI detection — sneak anywhere.', on: ['tdetect'], off: ['tdetect'] },
          { type: 'slider', name: 'Damage Multiplier', desc: 'Fine-tune attack damage (1 = normal).', min: 1, max: 50, step: 1, value: 1, unit: 'x', cmds: (v) => [`player.setav attackdamagemult ${v}`] },
        ],
      },
      {
        title: 'Movement',
        items: [
          { type: 'toggle', id: 'speed', name: 'Super Speed', desc: 'Run at 3x speed.', on: speedCmds(300), off: speedCmds(100), hotkey: 'F7' },
          { type: 'slider', name: 'Movement Speed', desc: 'Custom speed (100 = normal).', min: 50, max: 1000, step: 10, value: 100, unit: '%', cmds: speedCmds },
          { type: 'slider', name: 'Jump Height', desc: 'Jump height (76 = normal).', min: 76, max: 1500, step: 2, value: 76, cmds: (v) => [`setgs fJumpHeightMin ${v}`] },
          { type: 'toggle', id: 'nofall', name: 'No Fall Damage', desc: 'Survive any drop.', on: ['setgs fJumpFallHeightMin 100000'], off: ['setgs fJumpFallHeightMin 600'] },
          { type: 'toggle', id: 'noclip', name: 'No Clip', desc: 'Walk through walls and fly (toggle collision).', on: ['tcl'], off: ['tcl'], hotkey: 'F8' },
        ],
      },
    ],
  },
  {
    id: 'stats', label: 'Character', icon: 'star', blurb: 'Levels, skills, perks and spells',
    sections: [
      {
        title: 'Progression',
        items: [
          { type: 'number', name: 'Set Level', desc: 'Set character level directly.', value: 50, min: 1, max: 255, label: 'Apply', cmds: (v) => [`player.setlevel ${v}`] },
          { type: 'number', name: 'Add Perk Points', desc: 'Grant unspent perk points.', value: 10, min: 1, max: 255, label: 'Add', cmds: (v) => [`game.addperkpoints ${v}`] },
          { type: 'number', name: 'Add Dragon Souls', desc: 'Souls for unlocking shouts.', value: 10, min: 1, max: 999, label: 'Add', cmds: (v) => [`player.modav dragonsouls ${v}`] },
          { type: 'button', name: 'Max All Skills', desc: 'Every skill to 100 (no level-ups).', label: 'Max out', cmds: SKILLS.map((s) => `player.setav ${s} 100`) },
          { type: 'button', name: 'Learn Every Spell & Shout', desc: 'Adds all spells, powers and shouts (incl. some test/unused ones).', label: 'Learn all', danger: true, cmds: ['psb'] },
        ],
      },
      {
        title: 'Attributes',
        items: [
          { type: 'slider', name: 'Max Health', desc: 'Base health value.', min: 100, max: 5000, step: 50, value: 100, cmds: (v) => [`player.setav health ${v}`] },
          { type: 'slider', name: 'Max Magicka', desc: 'Base magicka value.', min: 100, max: 5000, step: 50, value: 100, cmds: (v) => [`player.setav magicka ${v}`] },
          { type: 'slider', name: 'Max Stamina', desc: 'Base stamina value.', min: 100, max: 5000, step: 50, value: 100, cmds: (v) => [`player.setav stamina ${v}`] },
        ],
      },
    ],
  },
  {
    id: 'world', label: 'World', icon: 'globe', blurb: 'Time, AI, map and teleports',
    sections: [
      {
        title: 'Time',
        items: [
          { type: 'slider', name: 'Time of Day', desc: 'Jump to an hour (0–23).', min: 0, max: 23, step: 1, value: 12, unit: ':00', cmds: (v) => [`set gamehour to ${v}`] },
          { type: 'slider', name: 'Timescale', desc: 'Game time speed (20 = normal).', min: 1, max: 200, step: 1, value: 20, cmds: (v) => [`set timescale to ${v}`] },
        ],
      },
      {
        title: 'World Rules',
        items: [
          { type: 'toggle', id: 'freezeai', name: 'Freeze All NPCs', desc: 'Toggle AI processing.', on: ['tai'], off: ['tai'], hotkey: 'F10' },
          { type: 'toggle', id: 'nocombat', name: 'Peaceful NPCs', desc: 'Toggle combat AI — nobody fights.', on: ['tcai'], off: ['tcai'] },
          { type: 'toggle', id: 'flycam', name: 'Free Camera', desc: 'Detach the camera to fly around.', on: ['tfc'], off: ['tfc'] },
          { type: 'button', name: 'Reveal All Map Markers', desc: 'Show every location on the map.', label: 'Reveal', cmds: ['tmm 1'] },
          { type: 'button', name: 'Clear All Bounties', desc: 'Pay off every hold bounty for free.', label: 'Clear', cmds: CRIME_FACTIONS.map((f) => `player.paycrimegold 0 0 ${f}`) },
          { type: 'button', name: 'Kill Nearby NPCs', desc: 'Kills every loaded, non-essential actor around you.', label: 'Kill all', danger: true, cmds: ['killall'] },
        ],
      },
      {
        title: 'Teleport',
        items: [
          {
            type: 'select', name: 'Fast Travel Anywhere', desc: 'Teleport to a city or landmark.', label: 'Go',
            options: [
              ['whiterun', 'Whiterun'], ['riverwood', 'Riverwood'], ['solitude', 'Solitude'], ['windhelm', 'Windhelm'],
              ['riften', 'Riften'], ['markarth', 'Markarth'], ['falkreath', 'Falkreath'], ['morthal', 'Morthal'],
              ['dawnstar', 'Dawnstar'], ['winterhold', 'Winterhold'], ['highhrothgar', 'High Hrothgar'], ['qasmoke', 'Developer Item Room'],
            ],
            cmds: (v) => [`coc ${v}`],
          },
        ],
      },
    ],
  },
  {
    id: 'money', label: 'Money', icon: 'coins', blurb: 'Septims, lockpicks and loot',
    sections: [
      {
        title: 'Gold',
        items: [
          { type: 'chips', name: 'Quick Gold', desc: 'Add gold straight to your purse.', options: [1000, 10000, 100000, 1000000], fmt: (v) => `+${v.toLocaleString()}`, cmds: (v) => [`player.additem f ${v}`] },
          { type: 'number', name: 'Custom Amount', desc: 'Add any amount of gold.', value: 5000, min: 1, max: 99999999, label: 'Add', cmds: (v) => [`player.additem f ${v}`] },
          { type: 'number', name: 'Remove Gold', desc: 'Take gold away (for challenge runs).', value: 1000, min: 1, max: 99999999, label: 'Remove', cmds: (v) => [`player.removeitem f ${v}`] },
        ],
      },
      {
        title: 'Supplies',
        items: [
          { type: 'chips', name: 'Lockpicks', desc: 'Never run out again.', options: [10, 50, 250], fmt: (v) => `+${v}`, cmds: (v) => [`player.additem a ${v}`] },
          { type: 'button', name: 'Smithing Starter Kit', desc: '20 each of iron, steel, ebony, leather and strips.', label: 'Give kit', cmds: ['player.additem 5ace4 20', 'player.additem 5ace5 20', 'player.additem 5ad9d 20', 'player.additem db5d2 20', 'player.additem 800e4 20'] },
        ],
      },
    ],
  },
  { id: 'shop', label: 'Shop', icon: 'cart', blurb: 'Buy gear with in-game gold — or for free', custom: 'shop' },
  { id: 'achievements', label: 'Achievements', icon: 'trophy', blurb: 'Earn Steam achievements', custom: 'achievements' },
  { id: 'console', label: 'Console', icon: 'terminal', blurb: 'Run any console command', custom: 'console' },
  { id: 'settings', label: 'Settings', icon: 'gear', blurb: 'Game path, keys and timing', custom: 'settings' },
];

// Shop catalogue — FormIDs from the base game (Skyrim.esm).
window.SHOP = [
  { cat: 'Weapons', items: [
    { id: '139b9', name: 'Daedric Sword', price: 2500, tag: 'Legendary' },
    { id: '139b5', name: 'Daedric Bow', price: 2500, tag: 'Legendary' },
    { id: '139c0', name: 'Daedric Arrows ×50', qty: 50, price: 1600 },
    { id: '139bf', name: 'Ebony Arrows ×50', qty: 50, price: 800 },
  ] },
  { cat: 'Crafting', items: [
    { id: '3ada4', name: 'Dragon Bone ×10', qty: 10, price: 5000, tag: 'Rare' },
    { id: '3ada3', name: 'Dragon Scales ×10', qty: 10, price: 5000, tag: 'Rare' },
    { id: '3ad5b', name: 'Daedra Heart ×5', qty: 5, price: 1250 },
    { id: '5ad9d', name: 'Ebony Ingot ×10', qty: 10, price: 1500 },
    { id: '5ada0', name: 'Quicksilver Ingot ×10', qty: 10, price: 600 },
    { id: '5ace5', name: 'Steel Ingot ×20', qty: 20, price: 400 },
    { id: 'db5d2', name: 'Leather ×20', qty: 20, price: 200 },
  ] },
  { cat: 'Magic', items: [
    { id: '2e4ff', name: 'Grand Soul Gem (filled) ×5', qty: 5, price: 2500, tag: 'Rare' },
    { id: '2e504', name: 'Black Soul Gem (filled) ×5', qty: 5, price: 4000, tag: 'Legendary' },
  ] },
  { cat: 'Misc', items: [
    { id: 'a', name: 'Lockpick ×25', qty: 25, price: 250 },
    { id: '64b3d', name: 'Sweetroll ×10', qty: 10, price: 50, tag: 'Iconic' },
  ] },
];

window.SKILLS = SKILLS;
