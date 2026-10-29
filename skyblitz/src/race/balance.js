// Item + difficulty tables (STUB values; the race agent owns and tunes these).
export const ITEMS = {
  missile: { id: 'missile', name: 'Homing Missile', icon: '🚀' },
  triple:  { id: 'triple',  name: 'Triple Missiles', icon: '🚀' },
  mine:    { id: 'mine',    name: 'Flak Mine', icon: '💣' },
  turbo:   { id: 'turbo',   name: 'Turbo Burst', icon: '⚡' },
  turbo3:  { id: 'turbo3',  name: 'Triple Turbo', icon: '⚡' },
  shield:  { id: 'shield',  name: 'Aegis Shield', icon: '🛡' },
  emp:     { id: 'emp',     name: 'Shock Pulse', icon: '📡' },
  storm:   { id: 'storm',   name: 'Thunderstorm', icon: '⛈' },
  smoke:   { id: 'smoke',   name: 'Smoke Screen', icon: '💨' },
  drone:   { id: 'drone',   name: 'Wingman Drone', icon: '🛸' },
};

export const DIFFICULTY = {
  easy:   { id: 'easy',   aiSpeed: 0.9,  aiSkill: 0.55, rubber: 0.10 },
  normal: { id: 'normal', aiSpeed: 0.96, aiSkill: 0.75, rubber: 0.08 },
  hard:   { id: 'hard',   aiSpeed: 1.0,  aiSkill: 0.9,  rubber: 0.06 },
  expert: { id: 'expert', aiSpeed: 1.04, aiSkill: 1.0,  rubber: 0.05 },
};
