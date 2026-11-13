// Cheat definitions. Every entry turns into console commands that are written
// to the batch file and run in-game with `bat dovahtrainer`.
// Command references: UESP Skyrim:Console and the CK ActorValueInfo list.

const SKILLS = ['OneHanded', 'TwoHanded', 'Marksman', 'Block', 'Smithing', 'HeavyArmor', 'LightArmor', 'Pickpocket',
  'Lockpicking', 'Sneak', 'Alchemy', 'Speechcraft', 'Alteration', 'Conjuration', 'Destruction', 'Illusion', 'Restoration', 'Enchanting'];

const SKILL_LABELS = { OneHanded: 'One-Handed', TwoHanded: 'Two-Handed', Marksman: 'Archery', HeavyArmor: 'Heavy Armor', LightArmor: 'Light Armor', Speechcraft: 'Speech' };
const SKILL_NAMES = SKILLS.map((s) => [s, SKILL_LABELS[s] || s]);

// Quest IDs from each quest's page on UESP (en.uesp.net/wiki/Skyrim:<Quest>).
// completequest <id> finishes the quest; movetoqt <id> teleports you to its current objective.
const QUEST_LINES = [
  { name: 'Main Quest', desc: 'The Dragonborn story, from Helgen to Sovngarde.', quests: [
    ['MQ101', 'Unbound'], ['MQ102', 'Before the Storm'], ['MQ103', 'Bleak Falls Barrow'], ['MQ104', 'Dragon Rising'],
    ['MQ105', 'The Way of the Voice'], ['MQ105Ustengrav', 'The Horn of Jurgen Windcaller'], ['MQ106', 'A Blade in the Dark'],
    ['MQ201', 'Diplomatic Immunity'], ['MQ202', 'A Cornered Rat'], ['MQ203', "Alduin's Wall"], ['MQ204', 'The Throat of the World'],
    ['MQ205', 'Elder Knowledge'], ['MQ206', "Alduin's Bane"], ['MQ301', 'The Fallen'], ['MQ302', 'Season Unending'],
    ['MQ303', "The World-Eater's Eyrie"], ['MQ304', 'Sovngarde'], ['MQ305', 'Dragonslayer'],
  ] },
  { name: 'Companions', desc: 'Jorrvaskr and the Circle.', quests: [
    ['C00', 'Take Up Arms'], ['C01', 'Proving Honor'], ['C03', 'The Silver Hand'], ['C04', "Blood's Honor"], ['C05', 'Purity of Revenge'], ['C06', 'Glory of the Dead'],
  ] },
  { name: 'College of Winterhold', desc: 'The mages’ questline.', quests: [
    ['MG01', 'First Lessons'], ['MG02', 'Under Saarthal'], ['MG03', 'Hitting the Books'], ['MG04', 'Good Intentions'],
    ['MG05', 'Containment'], ['MG06', 'Revealing the Unseen'], ['MG07', 'The Staff of Magnus'], ['MG08', 'The Eye of Magnus'],
  ] },
  { name: 'Thieves Guild', desc: 'Riften’s Ratway and the Nightingales.', quests: [
    ['TG00', 'A Chance Arrangement'], ['TG01', 'Taking Care of Business'], ['TG02', 'Loud and Clear'], ['TG03', 'Dampened Spirits'],
    ['TG04', "Scoundrel's Folly"], ['TG05', 'Speaking With Silence'], ['TG06', 'Hard Answers'], ['TG07', 'The Pursuit'],
    ['TG08A', 'Trinity Restored'], ['TG08B', 'Blindsighted'], ['TG09', 'Darkness Returns'],
  ] },
  { name: 'Dark Brotherhood', desc: 'The Family’s contracts.', quests: [
    ['DB02', 'With Friends Like These...'], ['DB02a', 'Sanctuary'], ['DB04a', 'The Silence Has Been Broken'], ['DB05', 'Bound Until Death'],
    ['DB06', 'Breaching Security'], ['DB11', 'Hail Sithis!'],
  ] },
];

// Hold crime factions (for clearing bounties).
const HOLDS = [
  ['000267EA', 'Whiterun Hold'], ['0002816B', 'The Rift (Riften)'], ['00029DB0', 'Haafingar (Solitude)'],
  ['000267E3', 'Eastmarch (Windhelm)'], ['0002816C', 'The Reach (Markarth)'], ['00028170', 'Falkreath Hold'],
  ['0002816D', 'Hjaalmarch (Morthal)'], ['0002816E', 'The Pale (Dawnstar)'], ['0002816F', 'Winterhold'],
];
const CRIME_FACTIONS = HOLDS.map(([id]) => id);
// paycrimegold <go to jail 0/1> <remove stolen items 0/1> <faction>
const clearBounty = (f) => `player.paycrimegold 0 0 ${f}`;

// Junk misc items, FormIDs from UESP "Skyrim:Miscellaneous Items" (base game only).
// Worthless clutter: tableware, kitchenware, tools with no crafting use.
const JUNK = [
  '98626', '98627', 'b9bcc', 'b9bd8', 'f08fa', 'f08fb', // Bowl
  '318fa', '318fb', // Cast Iron Pot
  'b9bdc', 'f08f8', // Cup
  'aebf3', 'aebf4', 'aebf7', // Fork, Spoon, Knife
  '98620', '98621', 'b9bda', 'f08f9', // Goblet
  '8632c', '98623', 'b9bd6', 'b9bde', 'f08f1', 'f08f3', // Jug
  '12fe6', // Kettle
  '98624', 'b9bd0', 'e2617', 'e2618', 'f08f5', // Plate
  '319e3', '3199a', '319e5', '31941', // Tankard, Wooden Bowl, Wooden Ladle, Wooden Plate
  '12fe7', '12fe8', '12fe9', '12fea', '12feb', '12fec', '9baf8', 'abd30', // Basket
  '5cadf', '5cae0', '5cae1', // Bellows, Tongs, Hammer
  '12fdf', '747fb', '747fe', // Bucket
  'e3cb7', 'f03f8', // Burned Book, Empty Skooma Bottle
  'f2012', 'f2013', 'f2014', 'f2015', 'fed17', // Empty Wine Bottle
  '4c3c6', '4c3c8', // Inkwell, Quill
  '318ec', // Lantern
  'f5d07', 'f5d08', 'f5d0a', 'f5d05', 'f5d06', // Pitchfork, Saw, Shovel
  'b9bd2', 'f08f6', 'b9bd4', 'f08f7', // Pot
];
// Clutter that sells for a bit more: candlesticks, Dwemer tableware, instruments, urns.
const CLUTTER = [
  'e42df', 'e42e0', 'e42e1', 'aa03e', // Candlestick, Silver Candlestick
  '8632a', // Glazed Urn
  '25c13', '25c68', 'e1fc3', '27f07', '27f08', '27f09', '27f03', '27f12', '27f15', // Dwemer bowls, cups, pans, plate
  'daba9', 'daba7', 'dabab', // Drum, Flute, Lute
];
const removeAll = (ids) => ids.map((id) => `player.removeitem ${id} 1000`);

// Speed changes only apply once carry weight changes, so nudge it.
const speedCmds = (v) => [`player.setav speedmult ${v}`, 'player.modav carryweight 1', 'player.modav carryweight -1'];

window.TABS = [
  {
    id: 'player', label: 'Player', icon: 'user', blurb: 'Survival, combat and movement',
    sections: [
      {
        title: 'Survival',
        items: [
          // persist: 'session' = console toggle, survives death/loads, reset when Skyrim restarts.
          //          'save'    = stat change stored in the save; re-applied after death. Uses setav
          //                      (absolute values), so re-applying never stacks.
          { type: 'toggle', id: 'god', persist: 'session', name: 'God Mode', desc: 'Invulnerable, unlimited magicka/stamina, no carry limit.', on: ['tgm'], off: ['tgm'], hotkey: 'F1' },
          { type: 'toggle', id: 'mana', persist: 'save', name: 'Infinite Magicka', desc: 'Magicka refills almost instantly.', on: ['player.setav magickarate 5000'], off: ['player.setav magickarate 3'], hotkey: 'F2' },
          { type: 'toggle', id: 'stam', persist: 'save', name: 'Infinite Stamina', desc: 'Sprint and power-attack forever.', on: ['player.setav staminarate 5000'], off: ['player.setav staminarate 5'], hotkey: 'F3' },
          { type: 'toggle', id: 'regen', persist: 'save', name: 'Fast Health Regen', desc: 'Health regenerates rapidly, even in combat.', on: ['player.setav healrate 500', 'player.setav combathealthregenmult 100'], off: ['player.setav healrate 0.7', 'player.setav combathealthregenmult 0.7'] },
          { type: 'toggle', id: 'weight', persist: 'save', name: 'Unlimited Carry Weight', desc: 'Never be over-encumbered. Off restores the default 300 base (items and perks still add on top).', on: ['player.setav carryweight 100000'], off: ['player.setav carryweight 300'] },
          { type: 'button', name: 'Full Restore', desc: 'Refill health, magicka and stamina now.', label: 'Restore', cmds: ['player.restoreav health 100000', 'player.restoreav magicka 100000', 'player.restoreav stamina 100000'] },
          { type: 'button', name: 'Repair Stats', desc: 'Puts magicka, stamina and health regeneration back to normal if an older trainer version left them stuck.', label: 'Repair', cmds: ['player.forceav magickarate 3', 'player.forceav staminarate 5', 'player.forceav healrate 0.7', 'player.forceav combathealthregenmult 0.7'] },
        ],
      },
      {
        title: 'Combat',
        items: [
          { type: 'toggle', id: 'crit', persist: 'save', name: 'Always Critical', desc: '100% critical hit chance.', on: ['player.setav critchance 100'], off: ['player.setav critchance 0'], hotkey: 'F4' },
          { type: 'toggle', id: 'ohk', persist: 'save', name: 'One-Hit Kills', desc: '100x weapon attack damage.', on: ['player.setav attackdamagemult 100'], off: ['player.setav attackdamagemult 1'], hotkey: 'F6' },
          { type: 'toggle', id: 'stealth', persist: 'session', name: 'Undetectable', desc: 'Turns off AI detection — sneak anywhere.', on: ['tdetect'], off: ['tdetect'] },
          { type: 'slider', name: 'Damage Multiplier', desc: 'Fine-tune attack damage (1 = normal).', min: 1, max: 50, step: 1, value: 1, unit: 'x', cmds: (v) => [`player.setav attackdamagemult ${v}`] },
        ],
      },
      {
        title: 'Movement',
        items: [
          { type: 'toggle', id: 'speed', persist: 'save', name: 'Super Speed', desc: 'Run at 3x speed.', on: speedCmds(300), off: speedCmds(100), hotkey: 'F7' },
          { type: 'slider', name: 'Movement Speed', desc: 'Custom speed (100 = normal).', min: 50, max: 1000, step: 10, value: 100, unit: '%', cmds: speedCmds },
          { type: 'slider', name: 'Jump Height', desc: 'Jump height (76 = normal).', min: 76, max: 1500, step: 2, value: 76, cmds: (v) => [`setgs fJumpHeightMin ${v}`] },
          { type: 'toggle', id: 'nofall', persist: 'session', name: 'No Fall Damage', desc: 'Survive any drop.', on: ['setgs fJumpFallHeightMin 100000'], off: ['setgs fJumpFallHeightMin 600'] },
          { type: 'toggle', id: 'noclip', persist: 'session', name: 'No Clip', desc: 'Walk through walls and fly (toggle collision).', on: ['tcl'], off: ['tcl'], hotkey: 'F8' },
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
          { type: 'pick', name: 'Set One Skill', desc: 'Pick a skill and the level you want (15–100).', options: SKILL_NAMES, value: 100, min: 15, max: 100, label: 'Set', cmds: (s, v) => [`player.setav ${s} ${v}`] },
          { type: 'pick', name: 'Train One Skill', desc: 'Adds real skill XP, so the game levels you up and counts it for perks and achievements.', options: SKILL_NAMES, value: 5000, min: 100, max: 50000, label: 'Train', cmds: (s, v) => [`player.advskill ${s} ${v}`] },
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
      {
        title: 'Appearance',
        items: [
          { type: 'button', name: 'Change Looks & Name', desc: 'Opens the character creator. Changing your race can reset skills, so only change face, hair and name.', label: 'Open', danger: true, cmds: ['showracemenu'] },
        ],
      },
    ],
  },
  {
    id: 'fixes', label: 'Saves & Fixes', icon: 'wrench', blurb: 'Auto-save so a crash or death costs you nothing, plus one-click fixes for common Skyrim bugs',
    sections: [
      {
        title: 'Saves',
        items: [
          { type: 'autosave', name: 'Auto-Save', desc: 'Saves on a timer into three rotating slots (DovahAuto1–3) while you play, so a crash or a bad death never costs you more than a few minutes. It only saves while Skyrim is the active window and the trainer panel is closed. The trainer also warns you if Skyrim closes unexpectedly.' },
          { type: 'savenow', name: 'Save Now', desc: 'Make a save right away, e.g. before a hard fight or a risky cheat.' },
          { type: 'button', name: 'Load Latest Auto-Save', desc: 'Loads the newest DovahAuto save. Unsaved progress is lost.', label: 'Load', danger: true, dynamic: 'loadLatest' },
        ],
      },
      {
        title: 'Stuck',
        items: [
          // Sources: UESP Skyrim:Bugs, Nexus/Steam threads (see README).
          { type: 'button', name: 'Can’t Move / Controls Locked', desc: 'After a cutscene, a crafting station, mining or a mod menu you can’t move, attack or open menus. Re-enables all player controls.', label: 'Fix', cmds: ['enableplayercontrols'] },
          { type: 'button', name: 'Stuck Crouching, Sitting or at a Workbench', desc: 'Can’t stand up, can’t use crafting stations or interact with anything. Resets your character’s AI (toggled off and back on), which makes you stand and interact again.', label: 'Fix', cmds: ['player.tai', 'player.tai', 'enableplayercontrols'] },
          { type: 'toggle', id: 'unstuck', persist: 'none', name: 'Stuck in a Wall, Rock or the Ground', desc: 'Turn on, walk out of whatever you’re stuck in, then turn it off again (collision off while on).', on: ['tcl'], off: ['tcl'] },
          { type: 'button', name: 'Stuck Walking Slowly', desc: 'Your speed is stuck low after a spell, a mod or a bugged effect. Resets movement speed to normal.', label: 'Fix', cmds: ['player.setav speedmult 100', 'player.modav carryweight 1', 'player.modav carryweight -1'] },
          { type: 'button', name: 'Frozen by a Lingering Spell', desc: 'Paralysis or another effect that never wore off. Removes all active spell effects on you.', label: 'Fix', cmds: ['player.dispelallspells'] },
        ],
      },
      {
        title: 'Combat & Saving',
        items: [
          { type: 'button', name: '"You Can’t Save With Enemies Nearby"', desc: 'The game thinks you’re still in combat. Calls off everyone hunting you and stops the battle music.', label: 'Fix', cmds: ['player.stopcombatalarm', 'removemusic muscombat'] },
          { type: 'button', name: 'Combat Music Won’t Stop', desc: 'Battle music keeps playing after the fight ended.', label: 'Fix', cmds: ['removemusic muscombat'] },
        ],
      },
      {
        title: 'Visuals & Camera',
        items: [
          { type: 'button', name: 'Character Looks Broken', desc: 'Invisible body parts, wrong textures or a stretched model. Forces your character to re-render.', label: 'Fix', cmds: ['player.sexchange', 'player.sexchange'] },
          { type: 'toggle', id: 'fixcam', persist: 'none', name: 'Camera Stuck Floating', desc: 'Free camera got left on. Toggles it; flip again if it made things worse.', on: ['tfc'], off: ['tfc'] },
          { type: 'toggle', id: 'fixhud', persist: 'none', name: 'HUD or Menus Disappeared', desc: 'Toggles the HUD back on; flip again if it hid it instead.', on: ['tm'], off: ['tm'] },
          { type: 'button', name: 'Health / Magicka / Stamina Stuck Empty', desc: 'Refills all three bars.', label: 'Fix', cmds: ['player.restoreav health 100000', 'player.restoreav magicka 100000', 'player.restoreav stamina 100000'] },
        ],
      },
      {
        title: 'Quests',
        items: [
          { type: 'text', name: 'Restart a Bugged Quest', desc: 'A quest won’t progress? Restart it from the beginning by its ID (UESP lists it on the quest page). Quick Save first.', placeholder: 'Quest ID, e.g. MQ103', label: 'Restart', pattern: /^[A-Za-z0-9_]{2,40}$/, danger: true, cmds: (v) => [`resetquest ${v}`] },
        ],
      },
      {
        title: 'Everything at Once',
        items: [
          { type: 'button', name: 'Fix All Common Bugs', desc: 'Runs the safe fixes together: controls, stuck animation, combat lock, combat music and walking speed.', label: 'Fix all', cmds: ['enableplayercontrols', 'player.tai', 'player.tai', 'player.stopcombatalarm', 'removemusic muscombat', 'player.setav speedmult 100', 'player.modav carryweight 1', 'player.modav carryweight -1'] },
        ],
      },
    ],
  },
  { id: 'mods', label: 'Mods', icon: 'puzzle', blurb: 'Your plugins, quick installs and Nexus Mods', custom: 'mods' },
  {
    id: 'quests', label: 'Quests', icon: 'scroll', blurb: 'Finish quests or jump to their objectives',
    sections: [
      {
        title: 'Story Questlines',
        items: QUEST_LINES.map((line) => ({
          type: 'quest', name: line.name, desc: line.desc, options: line.quests,
        })),
      },
      {
        title: 'Any Quest',
        items: [
          { type: 'questid', name: 'Quest by ID', desc: 'Type any quest ID (shown on its UESP page, e.g. MQ101, C00, DA01). Works for side quests and Daedric quests too.' },
          { type: 'button', name: 'Complete ALL Quests', desc: 'Runs every quest to its end at once. This WILL break your game: NPCs vanish, questlines lock up. Only for a throwaway save.', label: 'Complete all', danger: true, cmds: ['caqs'] },
        ],
      },
    ],
  },
  {
    id: 'world', label: 'World', icon: 'globe', blurb: 'Time, crime, map, dialogue and teleports',
    sections: [
      {
        title: 'Time',
        items: [
          { type: 'chips', name: 'Time Presets', desc: 'Jump straight to a time of day.', options: [6, 12, 18, 0], fmt: (v) => ({ 6: 'Dawn', 12: 'Noon', 18: 'Dusk', 0: 'Midnight' })[v], cmds: (v) => [`set gamehour to ${v}`] },
          { type: 'slider', name: 'Time of Day', desc: 'Jump to an hour (0–23).', min: 0, max: 23, step: 1, value: 12, unit: ':00', cmds: (v) => [`set gamehour to ${v}`] },
          { type: 'slider', name: 'Timescale', desc: 'Game time speed (20 = normal).', min: 1, max: 200, step: 1, value: 20, cmds: (v) => [`set timescale to ${v}`] },
        ],
      },
      {
        title: 'World Rules',
        items: [
          { type: 'toggle', id: 'freezeai', persist: 'session', name: 'Freeze All NPCs', desc: 'Toggle AI processing.', on: ['tai'], off: ['tai'], hotkey: 'F10' },
          { type: 'toggle', id: 'nocombat', persist: 'session', name: 'Peaceful NPCs', desc: 'Toggle combat AI — nobody fights.', on: ['tcai'], off: ['tcai'] },
          { type: 'toggle', id: 'flycam', persist: 'session', name: 'Free Camera', desc: 'Detach the camera to fly around.', on: ['tfc'], off: ['tfc'] },
          { type: 'button', name: 'Kill Nearby NPCs', desc: 'Kills every loaded, non-essential actor around you.', label: 'Kill all', danger: true, cmds: ['killall'] },
        ],
      },
      {
        title: 'Crime & Bounty',
        items: [
          { type: 'button', name: 'Remove All Bounties', desc: 'Wipes your bounty in every hold for free. No jail, and you keep stolen items.', label: 'Clear all', cmds: CRIME_FACTIONS.map(clearBounty) },
          { type: 'select', name: 'Remove Bounty in One Hold', desc: 'Clear the bounty in a single hold only.', label: 'Clear', options: HOLDS, cmds: (v) => [clearBounty(v)] },
          { type: 'button', name: 'Call Off the Guards', desc: 'Stops guards and NPCs who are already chasing or attacking you. Pair it with Remove All Bounties.', label: 'Calm', cmds: [...CRIME_FACTIONS.map(clearBounty), 'player.stopcombatalarm'] },
        ],
      },
      {
        title: 'Game Tools',
        items: [
          { type: 'button', name: 'Quick Save', desc: 'Saves to a "DovahQuick" slot from the console. Useful before trying risky cheats.', label: 'Save', cmds: ['save DovahQuick'] },
          { type: 'button', name: 'Load Quick Save', desc: 'Loads the "DovahQuick" save. Unsaved progress is lost.', label: 'Load', danger: true, cmds: ['load DovahQuick'] },
          { type: 'toggle', id: 'hud', persist: 'session', name: 'Hide HUD & Menus', desc: 'Clean screenshots. Press again (or use the trainer) to bring the HUD back.', on: ['tm'], off: ['tm'] },
          { type: 'slider', name: 'Slow Motion', desc: 'Global game speed (1 = normal). Lower for bullet time.', min: 0.1, max: 2, step: 0.1, value: 1, unit: 'x', cmds: (v) => [`sgtm ${v}`] },
          { type: 'button', name: 'Free Up Memory', desc: 'Purges cached cells. Can fix stutter after long sessions.', label: 'Purge', cmds: ['pcb'] },
        ],
      },
      {
        title: 'Map & Fast Travel',
        items: [
          // tmm <show>,<set discovered>,<include hidden>  (UESP: ToggleMapMarkers)
          { type: 'button', name: 'Unlock All Waypoints', desc: 'Every map marker, hidden ones too, becomes discovered, so you can fast travel anywhere. Only loading an older save undoes this.', label: 'Unlock all', danger: true, cmds: ['tmm 1,1,1'] },
          { type: 'button', name: 'Reveal Map Only', desc: 'Shows every location on the map but keeps them undiscovered. You still have to visit a place to fast travel there.', label: 'Reveal', cmds: ['tmm 1,0,1'] },
        ],
      },
      {
        title: 'Dialogue',
        items: [
          { type: 'toggle', id: 'autoskip', native: 'autoskip', name: 'Auto-Skip Dialogue',
            desc: 'When a conversation starts, Alt+Tab here, turn this on and press Esc. It presses Activate about once a second to skip NPC lines (and picks the highlighted reply). Stops after 45 seconds.' },
          { type: 'subtitles' },
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
    id: 'money', label: 'Money', icon: 'coins', blurb: 'Add or remove septims',
    sections: [
      {
        title: 'Gold',
        items: [
          { type: 'chips', name: 'Quick Gold', desc: 'Add gold straight to your purse.', options: [1000, 10000, 100000, 1000000], fmt: (v) => `+${v.toLocaleString()}`, cmds: (v) => [`player.additem f ${v}`] },
          { type: 'number', name: 'Custom Amount', desc: 'Add any amount of gold.', value: 5000, min: 1, max: 99999999, label: 'Add', cmds: (v) => [`player.additem f ${v}`] },
          { type: 'number', name: 'Remove Gold', desc: 'Take gold away (for challenge runs).', value: 1000, min: 1, max: 99999999, label: 'Remove', cmds: (v) => [`player.removeitem f ${v}`] },
        ],
      },
    ],
  },
  {
    id: 'inventory', label: 'Inventory', icon: 'bag', blurb: 'Junk removal and supplies',
    sections: [
      {
        title: 'Junk Removal',
        items: [
          { type: 'button', name: 'Quick Junk Removal', desc: `Deletes 29 kinds of worthless clutter: bowls, plates, cups, baskets, buckets, pots, tools, empty bottles and more. Crafting materials, gems and quest items are never touched.`, label: 'Remove junk', cmds: removeAll(JUNK) },
          { type: 'button', name: 'Remove Sellable Clutter', desc: 'Also deletes candlesticks, Dwemer tableware, instruments and urns, which sell for a few gold each.', label: 'Remove', danger: true, cmds: removeAll(CLUTTER) },
          { type: 'button', name: 'Lighten My Load', desc: 'Removes all junk and sellable clutter in one go.', label: 'Clean up', danger: true, cmds: removeAll([...JUNK, ...CLUTTER]) },
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
