// quarto-themes.jsx — three "classy wooden tabletop" theme objects.
// Each direction stays within the brief but expresses a different mood:
//   salon  — deep-night walnut + brass     (members'-club, evening)
//   atelier — pale beech on parchment      (designer's desk, daylight)
//   modern — teak + gold on green felt    (high-end board-game café)

const QUARTO_THEMES = {
  salon: {
    name: 'Salon',
    blurb: 'Walnut & brass, after-hours.',
    // surfaces
    bg: 'radial-gradient(120% 80% at 50% -10%, #232a3b 0%, #131826 55%, #0a0d15 100%)',
    panel: 'linear-gradient(180deg, rgba(255,245,220,0.04), rgba(0,0,0,0.18))',
    panelBorder: 'rgba(200,154,75,0.18)',
    chrome: '#0e121b',
    text: '#f1e6cf',
    textDim: 'rgba(241,230,207,0.6)',
    textFaint: 'rgba(241,230,207,0.35)',
    accent: '#c89a4b',           // brass
    accentGlow: 'rgba(217,170,90,0.45)',
    danger: '#d96a4a',
    success: '#9ec07a',
    // board
    boardOuter: 'linear-gradient(155deg, #4a2f1c 0%, #2a1a0e 55%, #1a0f08 100%)',
    boardInner: 'linear-gradient(180deg, #2a1a0e, #1d1208)',
    boardGrid: 'rgba(216,170,90,0.32)',
    boardCell: 'rgba(255,234,190,0.025)',
    boardCellHover: 'rgba(216,170,90,0.10)',
    boardHole: 'radial-gradient(closest-side, #0c0805 0%, #1a0f08 70%)',
    // pieces
    pieceLight: { top: '#e6c082', topHi: '#fae7c0', sideTop: '#c69558', sideBot: '#7e5128', edge: '#3a230f', sheen: 'rgba(255,240,210,0.55)' },
    pieceDark:  { top: '#6f4d37', topHi: '#946a4b', sideTop: '#523623', sideBot: '#2e1c10', edge: '#170c04', sheen: 'rgba(235,195,145,0.42)' },
    // typography
    fontDisplay: '"Fraunces", "Cormorant Garamond", Georgia, serif',
    fontUI: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
    statusBarDark: true,
    grain: 0.06,
  },

  atelier: {
    name: 'Atelier',
    blurb: 'Pale beech on parchment.',
    bg: 'radial-gradient(120% 80% at 50% 0%, #f6ecd6 0%, #ecdfc2 60%, #d9c8a3 100%)',
    panel: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.18))',
    panelBorder: 'rgba(60,40,20,0.16)',
    chrome: '#efe5cd',
    text: '#2b1d10',
    textDim: 'rgba(43,29,16,0.62)',
    textFaint: 'rgba(43,29,16,0.32)',
    accent: '#8e3a2a',           // oxblood
    accentGlow: 'rgba(142,58,42,0.35)',
    danger: '#a93f23',
    success: '#5a7a3a',
    boardOuter: 'linear-gradient(155deg, #d8b97a 0%, #b6925a 55%, #8a6a3a 100%)',
    boardInner: 'linear-gradient(180deg, #e3c688, #c9a566)',
    boardGrid: 'rgba(58,38,18,0.5)',
    boardCell: 'rgba(255,245,215,0.20)',
    boardCellHover: 'rgba(142,58,42,0.16)',
    boardHole: 'radial-gradient(closest-side, #6a4a22 0%, #b6925a 70%)',
    pieceLight: { top: '#f3e5c0', topHi: '#fff6dc', sideTop: '#d8bf85', sideBot: '#a4854d', edge: '#5a4220', sheen: 'rgba(255,250,230,0.6)' },
    pieceDark:  { top: '#5c3a1f', topHi: '#82582f', sideTop: '#43280f', sideBot: '#26160a', edge: '#120800', sheen: 'rgba(235,185,130,0.4)' },
    fontDisplay: '"Fraunces", "Cormorant Garamond", Georgia, serif',
    fontUI: '"Inter Tight", "Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
    statusBarDark: false,
    grain: 0.08,
  },

  modern: {
    name: 'Tabletop',
    blurb: 'Teak, gold leaf, green felt.',
    bg: 'radial-gradient(120% 80% at 50% 0%, #2a553f 0%, #163826 60%, #0c2418 100%)',
    panel: 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.55))',
    panelBorder: 'rgba(212,175,55,0.22)',
    chrome: '#0c2418',
    text: '#f1e8d2',
    textDim: 'rgba(241,232,210,0.62)',
    textFaint: 'rgba(241,232,210,0.32)',
    accent: '#d4af37',           // gold leaf
    accentGlow: 'rgba(212,175,55,0.40)',
    danger: '#d97a4a',
    success: '#a4c878',
    boardOuter: 'linear-gradient(155deg, #6a3f22 0%, #3a200f 55%, #1f1208 100%)',
    boardInner: 'linear-gradient(180deg, #3a200f, #2a1608)',
    boardGrid: 'rgba(212,175,55,0.45)',
    boardCell: 'rgba(241,232,210,0.04)',
    boardCellHover: 'rgba(212,175,55,0.14)',
    boardHole: 'radial-gradient(closest-side, #0c0805 0%, #2a1608 70%)',
    pieceLight: { top: '#efe2bf', topHi: '#fff5d6', sideTop: '#cdb887', sideBot: '#8a7544', edge: '#3a2e15', sheen: 'rgba(255,248,220,0.65)' },
    pieceDark:  { top: '#574635', topHi: '#79634a', sideTop: '#3e3122', sideBot: '#241a11', edge: '#100b06', sheen: 'rgba(225,190,140,0.42)' },
    fontDisplay: '"Fraunces", Georgia, serif',
    fontUI: '"Manrope", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
    statusBarDark: true,
    grain: 0.05,
  },
};

window.QUARTO_THEMES = QUARTO_THEMES;
