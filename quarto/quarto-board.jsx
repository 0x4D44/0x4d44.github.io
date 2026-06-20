// quarto-board.jsx — the playable board screen.
//
// The hardest UX moment in Quarto is the handoff: you pick the piece your
// opponent plays next. We split each turn into two visually distinct beats
// so it's impossible to miss which beat we're on:
//
//   PHASE A — "place"   : board glows, tray fades. The held piece floats
//                         above the board ready to drop.
//   PHASE B — "select"  : board fades, tray glows. The label flips from
//                         "place the piece" to "hand them a piece →".
//
// The right-edge of the board renders subtle attribute chips for each
// row/col/diag that's "live" (every piece in that line shares an
// attribute) — the assist that makes Quarto playable without losing track.

const { useState, useEffect, useRef, useMemo, useCallback } = React;
const E = window.QuartoEngine;
const Piece = window.QuartoPiece;

// ─────────────────────────────────────────────────────────────
// Small atoms
// ─────────────────────────────────────────────────────────────

function Avatar({ kind, theme, thinking = false, size = 36 }) {
  // 'kind' is 'you' or 'ai'. Just an initial in a chip.
  const isAI = kind === 'ai';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: isAI
        ? `linear-gradient(135deg, ${theme.pieceDark.sideTop}, ${theme.pieceDark.sideBot})`
        : `linear-gradient(135deg, ${theme.pieceLight.sideTop}, ${theme.pieceLight.sideBot})`,
      border: `1px solid ${theme.panelBorder}`,
      color: isAI ? theme.text : theme.chrome,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: theme.fontDisplay,
      fontSize: size * 0.42, fontWeight: 600,
      letterSpacing: '0.04em',
      boxShadow: thinking ? `0 0 0 3px ${theme.accentGlow}` : 'none',
      transition: 'box-shadow .25s',
      flexShrink: 0,
      position: 'relative',
    }}>
      {isAI ? '⏶' : 'Y'}
    </div>
  );
}

function TurnPill({ active, label, sub, theme, glow }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'flex-start',
      padding: '4px 12px',
      borderRadius: 10,
      background: active ? theme.panel : 'transparent',
      border: active ? `1px solid ${theme.panelBorder}` : '1px solid transparent',
      boxShadow: active && glow ? `inset 0 0 0 1px ${theme.accent}55` : 'none',
      transition: 'all .25s',
      minWidth: 0,
    }}>
      <div style={{
        fontFamily: theme.fontUI, fontSize: 11, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: active ? theme.accent : theme.textFaint,
      }}>{label}</div>
      <div style={{
        fontFamily: theme.fontDisplay, fontSize: 14,
        color: active ? theme.text : theme.textDim,
        marginTop: 1,
      }}>{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────

function GameHeader({ state, theme, aiThinking, onMenu, opponentName = 'Pavlov' }) {
  const youTurn = state.current === 'you' && state.phase !== 'ended';
  const aiTurn  = state.current === 'ai'  && state.phase !== 'ended';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px 6px',
      borderBottom: `1px solid ${theme.panelBorder}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <Avatar kind="ai" theme={theme} thinking={aiTurn && aiThinking} size={32} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: theme.fontDisplay, fontSize: 15, color: theme.text,
            lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{opponentName}</div>
          <div style={{
            fontFamily: theme.fontUI, fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: theme.textFaint, marginTop: 1,
          }}>
            {state.difficulty} engine · {aiTurn && aiThinking ? 'thinking…' : (youTurn ? 'waiting' : 'idle')}
          </div>
        </div>
      </div>
      <button onClick={onMenu} aria-label="menu" style={{
        width: 34, height: 34, borderRadius: 10,
        background: 'transparent', border: `1px solid ${theme.panelBorder}`,
        color: theme.textDim, fontFamily: theme.fontUI, fontSize: 18,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>⋯</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Held piece bar — the most important affordance in the game.
// ─────────────────────────────────────────────────────────────

function HeldBar({ state, theme, pieceStyle }) {
  const { phase, current, held } = state;
  const youPlace = phase === 'place' && current === 'you';
  const youSelect = phase === 'select' && current === 'you';
  const aiPlace = phase === 'place' && current === 'ai';
  const ended = phase === 'ended';

  let title, sub, accent;
  if (youPlace)       { title = 'Place this piece'; sub = 'Tap any open square'; accent = true; }
  else if (youSelect) { title = 'Hand a piece to opponent'; sub = 'Choose from the pool below'; accent = true; }
  else if (aiPlace)   { title = 'They have this piece'; sub = 'Pavlov is choosing a square'; accent = false; }
  else if (ended)     { title = state.winner === 'you' ? 'Quarto.' : (state.winner === 'ai' ? 'They got four.' : 'No moves left.'); sub = state.winner === 'you' ? 'You won the line.' : (state.winner === 'ai' ? 'Pavlov won the line.' : 'Drawn game.'); accent = false; }
  else                { title = 'Their selection'; sub = 'You\'ll place this next'; accent = false; }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      background: accent
        ? `linear-gradient(90deg, ${theme.accentGlow}33, transparent 70%)`
        : theme.panel,
      borderTop: `1px solid ${theme.panelBorder}`,
      borderBottom: `1px solid ${theme.panelBorder}`,
      position: 'relative',
    }}>
      {/* the held piece slot */}
      <div style={{
        width: 54, height: 64,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.18)',
        borderRadius: 10,
        border: `1px dashed ${held != null ? 'transparent' : theme.panelBorder}`,
        boxShadow: held != null
          ? `inset 0 0 0 1px ${theme.panelBorder}, 0 6px 14px ${youPlace ? theme.accentGlow : 'rgba(0,0,0,0.25)'}`
          : 'none',
        flexShrink: 0,
      }}>
        {held != null && (
          <Piece p={held} theme={theme} size={42} flatStyle={pieceStyle} lifted={youPlace} glow={youPlace} />
        )}
        {held == null && (
          <div style={{
            color: theme.textFaint, fontSize: 9, fontFamily: theme.fontUI,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            alignSelf: 'center', paddingBottom: 4,
          }}>empty</div>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: theme.fontDisplay, fontSize: 17,
          color: accent ? theme.text : theme.textDim,
          lineHeight: 1.15,
        }}>{title}</div>
        <div style={{
          fontFamily: theme.fontUI, fontSize: 11,
          color: theme.textFaint, marginTop: 2,
          letterSpacing: '0.02em',
        }}>{sub}</div>
      </div>
      {accent && (
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: theme.accent, color: theme.chrome,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.fontUI, fontWeight: 700, fontSize: 14,
          boxShadow: `0 0 12px ${theme.accentGlow}`,
          flexShrink: 0,
        }}>→</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// The 4×4 board.
// ─────────────────────────────────────────────────────────────

function Board({ state, theme, onCellClick, pieceStyle, assists, hintCell, animationSpeed = 1 }) {
  // ISO board renders as one composed SVG plinth — entirely different geometry.
  if (pieceStyle === 'iso' && window.IsoBoard) {
    const Iso = window.IsoBoard;
    return <Iso
      state={state} theme={theme} onCellClick={onCellClick}
      assists={assists} hintCell={hintCell}
    />;
  }
  const { board, phase, current, held, winLine } = state;
  const youPlace = phase === 'place' && current === 'you';
  const placeable = youPlace && held != null;
  const lineInfo = useMemo(() => E.analyzeLines(board), [board]);

  // Map cell → set of lines it's part of, with hot-line info.
  const cellHotness = useMemo(() => {
    const out = Array(16).fill(null).map(() => ({ lines: [], hot: false }));
    lineInfo.forEach((info, lineIdx) => {
      info.line.forEach(cell => {
        out[cell].lines.push({ ...info, idx: lineIdx });
        if (info.isHot) out[cell].hot = true;
      });
    });
    return out;
  }, [lineInfo]);

  // ───── Board chrome (wooden frame + grid) ─────
  return (
    <div style={{
      padding: '4px 16px 22px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: phase === 'select' && current === 'you' ? 0.5 : 1,
      transition: 'opacity .3s',
    }}>
      <div style={{
        position: 'relative',
        width: 280, height: 280,
        background: theme.boardOuter,
        borderRadius: 16,
        padding: 7,
        boxShadow: `0 14px 32px rgba(0,0,0,0.4), inset 0 1px 0 ${theme.accent}33, 0 0 0 1px ${theme.panelBorder}`,
      }}>
        {/* Inner playing surface */}
        <div style={{
          width: '100%', height: '100%',
          background: theme.boardInner,
          borderRadius: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: 'repeat(4, 1fr)',
          gap: 0,
          padding: 6,
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* grid lines */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{
            position: 'absolute', inset: 6, width: 'calc(100% - 12px)', height: 'calc(100% - 12px)',
            pointerEvents: 'none',
          }}>
            {[1, 2, 3].map(i => (
              <React.Fragment key={i}>
                <line x1={i * 25} y1="0" x2={i * 25} y2="100" stroke={theme.boardGrid} strokeWidth="0.3" />
                <line x1="0" y1={i * 25} x2="100" y2={i * 25} stroke={theme.boardGrid} strokeWidth="0.3" />
              </React.Fragment>
            ))}
          </svg>

          {/* Winning line highlight */}
          {winLine && (
            <svg viewBox="0 0 4 4" preserveAspectRatio="none" style={{
              position: 'absolute', inset: 6, width: 'calc(100% - 12px)', height: 'calc(100% - 12px)',
              pointerEvents: 'none', zIndex: 5,
            }}>
              {(() => {
                const a = winLine[0], b = winLine[3];
                const ax = (a % 4) + 0.5, ay = Math.floor(a / 4) + 0.5;
                const bx = (b % 4) + 0.5, by = Math.floor(b / 4) + 0.5;
                return (
                  <line x1={ax} y1={ay} x2={bx} y2={by}
                    stroke={theme.accent} strokeWidth="0.06"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 0.05px ${theme.accent})` }}
                  />
                );
              })()}
            </svg>
          )}

          {board.map((piece, i) => (
            <Cell
              key={i}
              i={i}
              piece={piece}
              theme={theme}
              placeable={placeable && piece == null}
              winning={winLine && winLine.includes(i)}
              pieceStyle={pieceStyle}
              hot={assists.threats && cellHotness[i].hot && piece == null}
              hint={hintCell === i}
              onClick={() => placeable && piece == null && onCellClick(i)}
            />
          ))}
        </div>

        {/* attribute chips — assists.liveAttrs */}
        {assists.liveAttrs && <LineChips lineInfo={lineInfo} theme={theme} />}

        {/* brass corner dots */}
        {[[8, 8], [8, 'auto'], ['auto', 8], ['auto', 'auto']].map((pos, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: typeof pos[1] === 'number' ? pos[1] : undefined,
            bottom: pos[1] === 'auto' ? 8 : undefined,
            left: typeof pos[0] === 'number' ? pos[0] : undefined,
            right: pos[0] === 'auto' ? 8 : undefined,
            width: 4, height: 4, borderRadius: '50%',
            background: theme.accent, opacity: 0.7,
            boxShadow: `0 0 4px ${theme.accentGlow}`,
            pointerEvents: 'none',
          }} />
        ))}
      </div>
    </div>
  );
}

// Single board cell.
function Cell({ piece, theme, placeable, winning, hot, hint, pieceStyle, onClick, i }) {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        cursor: placeable ? 'pointer' : 'default',
        background: hot ? `${theme.accentGlow}1a`
                   : (placeable ? theme.boardCell : 'transparent'),
        transition: 'background .15s, transform .1s',
        transform: pressed && placeable ? 'scale(0.96)' : 'none',
      }}
      onMouseOver={e => { if (placeable) e.currentTarget.style.background = theme.boardCellHover; }}
      onMouseOut={e => { if (placeable) e.currentTarget.style.background = hot ? `${theme.accentGlow}1a` : theme.boardCell; }}
    >
      {piece != null && (
        <div style={{ paddingBottom: 3, transform: 'scale(0.82)' }}>
          <Piece p={piece} theme={theme} size={48} flatStyle={pieceStyle} />
        </div>
      )}
      {hint && piece == null && (
        <div style={{
          position: 'absolute', inset: 6,
          border: `2px dashed ${theme.accent}`,
          borderRadius: 6,
          animation: 'qHintPulse 1.4s ease-in-out infinite',
        }} />
      )}
    </div>
  );
}

// Per-line "live attribute" chips: 4 along the right (rows), 4 along the
// bottom (cols), 2 in the corners (diags).
function LineChips({ lineInfo, theme }) {
  // lineInfo order: 4 rows, 4 cols, 2 diags (matches engine LINES order)
  const chipFor = (info, key) => {
    if (info.count === 0 || !info.completable) return null;
    const live = info.liveOnes | info.liveZeros;
    if (!live) return null;
    return <AttrChip key={key} info={info} theme={theme} />;
  };
  return (
    <>
      {/* row chips on the right edge */}
      {[0, 1, 2, 3].map(r => (
        <div key={`r${r}`} style={{
          position: 'absolute', right: -20, top: 7 + (r * (280 - 14) / 4) + (280 - 14) / 8 - 8,
          width: 18,
        }}>{chipFor(lineInfo[r], `r${r}`)}</div>
      ))}
      {/* col chips on the bottom edge */}
      {[0, 1, 2, 3].map(c => (
        <div key={`c${c}`} style={{
          position: 'absolute', bottom: -20, left: 7 + (c * (280 - 14) / 4) + (280 - 14) / 8 - 8,
          height: 18,
        }}>{chipFor(lineInfo[4 + c], `c${c}`)}</div>
      ))}
    </>
  );
}

// Tiny pill showing which attributes are live in a line.
// Renders up to 2 tiny iconic glyphs (or "•" for empty / "✓" for hot).
function AttrChip({ info, theme }) {
  const { liveOnes, liveZeros, isHot, count } = info;
  const liveBits = [];
  for (let b = 0; b < 4; b++) {
    if (liveOnes & (1 << b)) liveBits.push({ bit: b, value: 1 });
    else if (liveZeros & (1 << b)) liveBits.push({ bit: b, value: 0 });
  }
  // Pick the most informative ones (show up to 2 dots — different attributes)
  const glyphs = liveBits.slice(0, 2).map(({ bit, value }) => {
    // Tall=▲ Short=▽, Dark=●, Light=○, Round=⬭ Square=□, Hollow=◌ Solid=■
    const m = [
      [value ? '▲' : '▽'],   // tall/short
      [value ? '●' : '○'],   // dark/light
      [value ? '◌' : '◼'],   // round/square (using bold square fallback)
      [value ? '◌' : '◼'],   // hollow/solid
    ];
    // Use distinct glyphs for each bit
    const set = [
      [value ? '▲' : '▽'],   // bit 0 tall vs short
      [value ? '●' : '○'],   // bit 1 dark vs light
      [value ? '◯' : '◻'],   // bit 2 round vs square
      [value ? '◌' : '◼'],   // bit 3 hollow vs solid
    ];
    return set[bit][0];
  });
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, padding: '0 4px',
      borderRadius: 9, gap: 2,
      background: isHot ? `${theme.accent}` : `${theme.accent}33`,
      color: isHot ? theme.chrome : theme.text,
      fontSize: 9, lineHeight: 1, fontWeight: 600,
      boxShadow: isHot ? `0 0 8px ${theme.accentGlow}` : 'none',
      transition: 'all .2s',
      whiteSpace: 'nowrap',
    }} title={`${count}/4 placed${isHot ? ' — one move from Quarto' : ''}`}>
      {glyphs.length ? glyphs.join('') : '·'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Piece pool (the tray)
// ─────────────────────────────────────────────────────────────

function Pool({ state, theme, onSelect, pieceStyle, suggestedPiece }) {
  const { board, held, current, phase } = state;
  const onBoard = new Set(board.filter(p => p != null));
  const active = phase === 'select' && current === 'you';

  return (
    <div style={{
      padding: '4px 16px 2px',
      opacity: phase === 'place' ? 0.65 : 1,
      transition: 'opacity .3s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <div style={{
          fontFamily: theme.fontUI, fontSize: 9, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: theme.textFaint,
        }}>Pool · {16 - onBoard.size - (held != null ? 1 : 0)} left</div>
        {active && (
          <div style={{
            fontFamily: theme.fontDisplay, fontSize: 11, color: theme.accent,
            fontStyle: 'italic',
          }}>tap to hand over</div>
        )}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: 3,
        background: theme.panel,
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: 10,
        padding: 6,
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)',
      }}>
        {E.ALL_PIECES.map(p => {
          const used = onBoard.has(p);
          const inHand = p === held;
          const tappable = active && !used && !inHand;
          return (
            <button key={p}
              onClick={() => tappable && onSelect(p)}
              disabled={!tappable}
              style={{
                aspectRatio: '1 / 1',
                padding: 0, border: 'none',
                background: tappable && !used
                  ? `${theme.boardCell}`
                  : 'transparent',
                borderRadius: 6,
                cursor: tappable ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                transition: 'background .15s, transform .1s',
                outline: suggestedPiece === p ? `2px dashed ${theme.accent}` : 'none',
              }}
              onMouseOver={e => { if (tappable) e.currentTarget.style.background = theme.boardCellHover; }}
              onMouseOut={e => { if (tappable) e.currentTarget.style.background = theme.boardCell; }}
            >
              <Piece p={p} theme={theme} size={26} flatStyle={pieceStyle}
                dim={used || inHand} />
              {used && <div style={{
                position: 'absolute', inset: 2,
                background: 'repeating-linear-gradient(135deg, transparent 0 4px, rgba(0,0,0,0.12) 4px 5px)',
                borderRadius: 4, pointerEvents: 'none',
              }} />}
              {inHand && (
                <div style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 6, height: 6, borderRadius: '50%',
                  background: theme.accent,
                  boxShadow: `0 0 6px ${theme.accentGlow}`,
                }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer action bar
// ─────────────────────────────────────────────────────────────

function ActionBar({ theme, onHint, onUndo, onConcede, hintActive, canUndo, assists, onToggleAssists }) {
  const Btn = ({ icon, label, onClick, active, disabled }) => (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, height: 42,
      background: active ? `${theme.accent}22` : 'transparent',
      border: `1px solid ${active ? theme.accent : theme.panelBorder}`,
      borderRadius: 10,
      color: disabled ? theme.textFaint : (active ? theme.accent : theme.text),
      fontFamily: theme.fontUI, fontSize: 10, fontWeight: 500,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'all .15s',
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
  return (
    <div style={{
      display: 'flex', gap: 6, padding: '6px 14px 10px',
    }}>
      <Btn icon="✦" label="Hint" onClick={onHint} active={hintActive} />
      <Btn icon="↶" label="Undo" onClick={onUndo} disabled={!canUndo} />
      <Btn icon={assists ? '◉' : '◯'} label="Assist" onClick={onToggleAssists} active={assists} />
      <Btn icon="⚑" label="Concede" onClick={onConcede} />
    </div>
  );
}

window.QuartoBoardKit = { GameHeader, HeldBar, Board, Pool, ActionBar, Avatar, TurnPill };
