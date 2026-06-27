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
    bg: 'radial-gradient(120% 80% at 50% -10%, #2b3447 0%, #1a2236 55%, #0e1320 100%)',
    panel: 'linear-gradient(180deg, rgba(255,245,220,0.06), rgba(0,0,0,0.16))',
    panelBorder: 'rgba(214,168,90,0.24)',
    chrome: '#11151f',
    text: '#f5ecd8',
    textDim: 'rgba(245,236,216,0.66)',
    textFaint: 'rgba(245,236,216,0.4)',
    accent: '#dcab57',           // brass (brightened)
    accentGlow: 'rgba(226,180,100,0.5)',
    danger: '#d96a4a',
    success: '#9ec07a',
    // board
    boardOuter: 'linear-gradient(155deg, #6a4427 0%, #432916 55%, #2a1a0e 100%)',
    boardInner: 'linear-gradient(180deg, #3e2815, #2a1a0e)',
    boardGrid: 'rgba(224,178,98,0.4)',
    boardCell: 'rgba(255,238,200,0.06)',
    boardCellHover: 'rgba(224,178,98,0.16)',
    tileSeat: 'rgba(255,236,200,0.13)',
    boardHole: 'radial-gradient(closest-side, #0c0805 0%, #1a0f08 70%)',
    // iso plinth wood (kept dark & woody; pieces read lighter against it)
    board: { top: '#4a3018', side: '#32200f', edge: '#1c1208' },
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
    boardOuter: 'linear-gradient(155deg, #ecdab0 0%, #d2b884 55%, #b0935f 100%)',
    boardInner: 'linear-gradient(180deg, #f4eace, #e2d0a6)',
    boardGrid: 'rgba(70,46,22,0.45)',
    boardCell: 'rgba(110,80,38,0.10)',
    boardCellHover: 'rgba(142,58,42,0.18)',
    tileSeat: 'rgba(255,251,240,0.5)',
    boardHole: 'radial-gradient(closest-side, #6a4a22 0%, #b6925a 70%)',
    // iso plinth wood (pale limed beech — dark pieces pop on it)
    board: { top: '#e6d3a6', side: '#c9ad78', edge: '#9c8050' },
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
    bg: 'radial-gradient(120% 80% at 50% 0%, #336249 0%, #1d4630 60%, #103021 100%)',
    panel: 'linear-gradient(180deg, rgba(0,0,0,0.28), rgba(0,0,0,0.46))',
    panelBorder: 'rgba(218,182,72,0.28)',
    chrome: '#103021',
    text: '#f5edd9',
    textDim: 'rgba(245,237,217,0.66)',
    textFaint: 'rgba(245,237,217,0.38)',
    accent: '#e0bc52',           // gold leaf (brightened)
    accentGlow: 'rgba(224,188,82,0.46)',
    danger: '#d97a4a',
    success: '#a4c878',
    boardOuter: 'linear-gradient(155deg, #855730 0%, #4f2f18 55%, #301c0d 100%)',
    boardInner: 'linear-gradient(180deg, #4a2c16, #36200f)',
    boardGrid: 'rgba(224,188,82,0.5)',
    boardCell: 'rgba(245,237,217,0.07)',
    boardCellHover: 'rgba(224,188,82,0.18)',
    tileSeat: 'rgba(255,240,205,0.13)',
    boardHole: 'radial-gradient(closest-side, #0c0805 0%, #2a1608 70%)',
    // iso plinth wood (warm dark teak; pieces read lighter against it)
    board: { top: '#563620', side: '#3c2412', edge: '#23150a' },
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
