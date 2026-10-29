// Aircraft roster + AI pilots. Stats are 1..10 (UI bars); flight.js maps them to physics via flightParams(spec).
// Owner: craft agent (visual fields may be extended freely; keep ids, names and the stats object stable).
const L = (name, primary, secondary, accent) => ({ name, primary, secondary, accent });

export const AIRCRAFT = [
  { id: 'falcon', name: 'Falcon F-1', cls: 'All-rounder', tagline: 'Balanced, forgiving, and quick off the line.',
    stats: { speed: 7, accel: 6, handling: 7, stability: 6, boost: 6, armor: 5 },
    visual: { kind: 'jet', wingspan: 11, length: 13 },
    liveries: [L('Skyline', '#2f7bff', '#f4f8ff', '#ff8a1f'), L('Ember', '#ff5a36', '#fff1e0', '#ffd02e'), L('Mint', '#22c9a0', '#eafff7', '#1b4bd8')] },
  { id: 'wasp', name: 'Wasp W-2', cls: 'Light canard', tagline: 'Twitchy and tiny: snaps into turns, runs out of top speed.',
    stats: { speed: 5, accel: 8, handling: 9, stability: 4, boost: 6, armor: 3 },
    visual: { kind: 'canard', wingspan: 8, length: 9.5 },
    liveries: [L('Hornet', '#ffcf1f', '#1b1b22', '#ff4d2e'), L('Orchid', '#b04bff', '#f6eaff', '#ffe14a'), L('Glacier', '#3fb6ff', '#f4fbff', '#ff4d6e')] },
  { id: 'manta', name: 'Manta M-3', cls: 'Flying wing', tagline: 'The fastest in a straight line; floaty in the corners.',
    stats: { speed: 9, accel: 5, handling: 5, stability: 7, boost: 7, armor: 4 },
    visual: { kind: 'flying-wing', wingspan: 15, length: 8 },
    liveries: [L('Lagoon', '#18b8b0', '#0d2d4a', '#ff4fa3'), L('Dusk', '#6a4bff', '#1a1340', '#ffb020'), L('Coral', '#ff6f61', '#fff0e6', '#00a6a6')] },
  { id: 'bulldog', name: 'Bulldog B-4', cls: 'Heavy twin-prop', tagline: 'Tough and rock-steady: shrugs off hits, wide in the corners.',
    stats: { speed: 6, accel: 5, handling: 6, stability: 9, boost: 5, armor: 9 },
    visual: { kind: 'twin-prop', wingspan: 16, length: 12 },
    liveries: [L('Olive', '#86b02f', '#f0ecd0', '#e63b2e'), L('Navy', '#2f5fb8', '#eef3ff', '#ffc425'), L('Sand', '#f0d9a0', '#2b2b30', '#e63b2e')] },
  { id: 'comet', name: 'Comet C-5', cls: 'Delta racer', tagline: 'Savage acceleration and a hot boost; wants a firm hand.',
    stats: { speed: 8, accel: 8, handling: 6, stability: 5, boost: 8, armor: 4 },
    visual: { kind: 'delta', wingspan: 10, length: 14 },
    liveries: [L('Redline', '#e6212b', '#ffffff', '#222633'), L('Volt', '#c8ff1f', '#1a1f2b', '#ff3df0'), L('Ice', '#9fe7ff', '#ffffff', '#2f5bff')] },
  { id: 'sprite', name: 'Sprite S-6', cls: 'Sport biplane', tagline: 'Nimble, loopy and forgiving, with the fastest boost recharge.',
    stats: { speed: 4, accel: 7, handling: 10, stability: 8, boost: 9, armor: 5 },
    visual: { kind: 'biplane', wingspan: 10, length: 8.5 },
    liveries: [L('Bubblegum', '#ff7bc0', '#fff6e8', '#2f7bff'), L('Lemon', '#ffe14a', '#2a2f45', '#ff5a36'), L('Meadow', '#5bd16a', '#f6fff0', '#ff9a1f')] },
];

// AI pilots. personality values are 0..1. craft = their default aircraft (the grid builder avoids duplicates with the player's pick).
export const PILOTS = [
  { id: 'ace',   name: 'Ace Hardcastle', tag: 'ACE', craft: 'falcon',  color: '#2f7bff', bio: 'Three-time sky champion. Clean lines, no mistakes.',
    personality: { skill: 0.92, aggression: 0.35, itemSense: 0.8, stunts: 0.4, shortcuts: 0.6, consistency: 0.95 }, quips: { win: 'Textbook.', lose: 'You earned that one.', hit: 'Nice shot!' } },
  { id: 'nova',  name: 'Nova Kim',       tag: 'NOV', craft: 'comet',   color: '#e6212b', bio: 'Hot-headed and missile-happy.',
    personality: { skill: 0.8, aggression: 0.95, itemSense: 0.55, stunts: 0.3, shortcuts: 0.5, consistency: 0.6 }, quips: { win: 'Burn bright!', lose: 'Rematch. Now.', hit: 'Boom!' } },
  { id: 'rosa',  name: 'Rosa Vega',      tag: 'ROS', craft: 'sprite',  color: '#ff7bc0', bio: 'Stunt queen. If there is a loop, she is in it.',
    personality: { skill: 0.78, aggression: 0.4, itemSense: 0.5, stunts: 0.98, shortcuts: 0.85, consistency: 0.7 }, quips: { win: 'Did you see that roll?!', lose: 'Next time, more style.', hit: 'Oops, sorry!' } },
  { id: 'dutch', name: 'Dutch Bergman',  tag: 'DUT', craft: 'bulldog', color: '#6f8f3a', bio: 'A bruiser who hoards shields and plays the long game.',
    personality: { skill: 0.7, aggression: 0.6, itemSense: 0.9, stunts: 0.1, shortcuts: 0.25, consistency: 0.85 }, quips: { win: 'Slow and steady.', lose: 'Hmph.', hit: 'Out of my way.' } },
  { id: 'mika',  name: 'Mika Tanaka',    tag: 'MIK', craft: 'manta',   color: '#18b8b0', bio: 'Precision flyer, savours a perfect racing line.',
    personality: { skill: 0.88, aggression: 0.15, itemSense: 0.4, stunts: 0.35, shortcuts: 0.7, consistency: 0.98 }, quips: { win: 'Perfect line.', lose: 'I braked too late.', hit: 'Apologies.' } },
  { id: 'zed',   name: 'Zed',            tag: 'ZED', craft: 'wasp',    color: '#ffcf1f', bio: 'Pure chaos. Takes every shortcut, crashes in half.',
    personality: { skill: 0.6, aggression: 0.75, itemSense: 0.3, stunts: 0.7, shortcuts: 1, consistency: 0.3 }, quips: { win: 'WOOOO!', lose: 'Worth it.', hit: 'Hehehe.' } },
  { id: 'pip',   name: 'Pip Moreau',     tag: 'PIP', craft: 'sprite',  color: '#5bd16a', bio: 'Cheerful trickster who drops mines on every straight.',
    personality: { skill: 0.65, aggression: 0.5, itemSense: 0.7, stunts: 0.6, shortcuts: 0.5, consistency: 0.55 }, quips: { win: 'Surprise!', lose: 'Ooh, close.', hit: 'Gotcha!' } },
];

export const getAircraft = (id) => AIRCRAFT.find((a) => a.id === id) || AIRCRAFT[0];
export const getPilot = (id) => PILOTS.find((p) => p.id === id) || PILOTS[0];
