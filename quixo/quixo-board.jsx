// quixo-board.jsx — the playable board screen.
//
// The hardest UX moment in Quixo is that a move has two halves: pick UP a
// cube, then push it back IN. We split the turn into two visually distinct
// beats so it's impossible to miss which beat we're on:
//
//   BEAT A — "pick" : every cube you may take glows faintly at the edge.
//   BEAT B — "push" : the picked cube lifts, arrows sprout at the legal
//                     entry ends of its row and column. Tap an arrow to
//                     push; tap the cube again to put it down.
//
// The edges of the board carry per-line tally chips (the assist): a line
// with three-plus of one symbol and none of the other shows its count —
// filled and pulsing when it's one push from five.

const { useState, useEffect, useRef, useMemo, useCallback } = React;
const E = window.QuixoEngine;
const Cube = window.QuixoCube;

// ── Board geometry (px) — shared by cells, arrows, chips, win overlay ──
const OUT = 290;                 // outer wooden frame
const FR = 8;                    // frame padding
const PAD = 7;                   // playing-surface padding
const GAP = 4;                   // cell gap
const CELL = (OUT - 2 * FR - 2 * PAD - 4 * GAP) / 5;   // 48.8
const STEP = CELL + GAP;                               // 52.8
const centerOf = (k) => FR + PAD + k * STEP + CELL / 2;

// ─────────────────────────────────────────────────────────────
// Small atoms
// ─────────────────────────────────────────────────────────────

function Avatar({ kind, theme, thinking = false, size = 36 }) {
  const isAI = kind === 'ai';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: isAI
        ? `linear-gradient(135deg, ${theme.symO}, ${theme.cube.edge})`
        : `linear-gradient(135deg, ${theme.cube.sideTop}, ${theme.cube.sideBot})`,
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
      {isAI ? '◯' : '✕'}
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
// Turn bar — the most important affordance in the game.
// (The Quixo analogue of Quarto's held-piece bar.)
// ─────────────────────────────────────────────────────────────

function TurnBar({ state, theme, symbols, selected, aiThinking }) {
  const { phase, current } = state;
  const youPick = phase === 'play' && current === 'you' && selected == null;
  const youPush = phase === 'play' && current === 'you' && selected != null;
  const aiTurn  = phase === 'play' && current === 'ai';
  const ended   = phase === 'ended';

  const lost    = ended && state.winner === 'ai';
  const wonGame = ended && state.winner === 'you';
  const drawn   = ended && state.winner === 'draw';
  const attr    = E.lineName(state.winLine);

  let title, sub, tone;
  if (youPick)      { title = 'Take a cube'; sub = 'Any edge cube that is blank or a cross'; tone = 'accent'; }
  else if (youPush) { title = 'Now push it back in'; sub = 'Tap an arrow · tap the cube again to cancel'; tone = 'accent'; }
  else if (aiTurn)  { title = 'Pavlov is moving'; sub = 'He plays the circles'; tone = 'neutral'; }
  else if (lost)    { title = 'You\u2019ve lost'; sub = state.winLine ? `Five circles along ${attr}` : 'You conceded the match'; tone = 'danger'; }
  else if (wonGame) { title = 'Quixo \u2014 you won'; sub = `Five crosses along ${attr} in ${state.moveCount} moves`; tone = 'win'; }
  else if (drawn)   { title = 'Drawn game'; sub = 'Neither side could line up five'; tone = 'neutral'; }
  else              { title = 'Quixo'; sub = ''; tone = 'neutral'; }

  const accent = tone === 'accent';
  const toneGlow = tone === 'danger' ? `${theme.danger}66` : theme.accentGlow;
  const endMarker = lost ? '\u2715' : wonGame ? '\u2726' : '\u2013';

  // The slot shows the cube in play: your cross (lifted while picking a
  // push), Pavlov's circle while he thinks.
  const slotCube = ended ? null : (current === 'you' ? 'you' : 'ai');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      background: tone === 'danger'
          ? `linear-gradient(90deg, ${theme.danger}30, transparent 78%)`
        : tone === 'win'
          ? `linear-gradient(90deg, ${theme.accentGlow}40, transparent 75%)`
        : accent
          ? `linear-gradient(90deg, ${theme.accentGlow}33, transparent 70%)`
          : theme.panel,
      borderTop: `1px solid ${tone === 'danger' ? theme.danger + '55' : theme.panelBorder}`,
      borderBottom: `1px solid ${tone === 'danger' ? theme.danger + '55' : theme.panelBorder}`,
      position: 'relative',
    }}>
      {/* the cube slot */}
      <div style={{
        width: 54, height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.18)',
        borderRadius: 10,
        border: `1px ${ended ? 'solid' : 'dashed'} ${slotCube != null ? 'transparent' : (lost ? theme.danger + '66' : theme.panelBorder)}`,
        boxShadow: slotCube != null
          ? `inset 0 0 0 1px ${theme.panelBorder}, 0 6px 14px ${youPush ? theme.accentGlow : 'rgba(0,0,0,0.25)'}`
          : (lost ? `inset 0 0 12px ${theme.danger}22` : 'none'),
        flexShrink: 0,
      }}>
        {slotCube != null && (
          <Cube v={slotCube} theme={theme} size={40} symbols={symbols} lifted={youPush} />
        )}
        {slotCube == null && ended && (
          <div style={{
            fontSize: 24, lineHeight: 1, fontWeight: 700,
            color: lost ? theme.danger : wonGame ? theme.accent : theme.textDim,
            textShadow: `0 0 12px ${toneGlow}`,
          }}>{endMarker}</div>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily: theme.fontDisplay, fontSize: lost || wonGame ? 19 : 17,
          color: lost ? theme.danger : (accent || wonGame ? theme.text : theme.textDim),
          lineHeight: 1.15,
        }}>{title}</div>
        <div style={{
          fontFamily: theme.fontUI, fontSize: 11,
          color: lost ? `${theme.danger}cc` : theme.textFaint, marginTop: 2,
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
        }}>{'\u2192'}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// The 5×5 board.
// ─────────────────────────────────────────────────────────────

function Board({
  state, theme, symbols, assists,
  selected, hintMove, aiSel, animSpeed = 1,
  onCubeClick, onArrow,
}) {
  const { board, phase, current, winLine, lastMove } = state;
  const yourTurn = phase === 'play' && current === 'you';

  // Which cubes may be picked up right now?
  const eligibleSet = useMemo(() => {
    if (!yourTurn) return new Set();
    return new Set(E.legalMoves(board, 'you').map(m => m.src));
  }, [board, yourTurn]);

  // Push arrows for the selected cube.
  const dests = selected != null ? E.legalDests(selected) : [];

  // Slide animation bookkeeping: cells moved by the last push, and the
  // direction they came from.
  const anim = useMemo(() => {
    if (!lastMove) return null;
    const { cells, step } = E.shiftedCells(lastMove.src, lastMove.dest);
    const name = step === 1 ? 'qFromR' : step === -1 ? 'qFromL'
               : step === 5 ? 'qFromB' : 'qFromT';
    return { cells: new Set(cells), name };
  }, [lastMove]);

  const lineInfo = useMemo(() => E.analyzeLines(board), [board]);
  const winSet = winLine ? new Set(winLine) : null;

  return (
    <div style={{
      padding: '4px 16px 22px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        position: 'relative',
        width: OUT, height: OUT,
        background: theme.boardOuter,
        borderRadius: 16,
        padding: FR,
        boxSizing: 'border-box',
        boxShadow: `0 14px 32px rgba(0,0,0,0.4), inset 0 1px 0 ${theme.accent}33, 0 0 0 1px ${theme.panelBorder}`,
      }}>
        {/* Inner playing surface */}
        <div style={{
          width: '100%', height: '100%',
          background: theme.boardInner,
          borderRadius: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gridTemplateRows: 'repeat(5, 1fr)',
          gap: GAP,
          padding: PAD,
          boxSizing: 'border-box',
          position: 'relative',
        }}>
          {board.map((v, i) => {
            const eligible = eligibleSet.has(i);
            const isSel = selected === i || aiSel === i;
            const winner = winSet && winSet.has(i)
              ? (state.winner === 'ai' ? 'danger' : 'accent')
              : null;
            return (
              <div
                key={i}
                onClick={() => yourTurn && (eligible || selected === i) && onCubeClick(i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: yourTurn && eligible ? 'pointer' : 'default',
                  background: eligible && selected == null ? theme.boardCell : 'transparent',
                  borderRadius: 8,
                  transition: 'background .15s',
                  position: 'relative',
                }}
                onMouseOver={e => { if (yourTurn && eligible) e.currentTarget.style.background = theme.boardCellHover; }}
                onMouseOut={e => { if (yourTurn && eligible) e.currentTarget.style.background = (eligible && selected == null) ? theme.boardCell : 'transparent'; }}
              >
                <div
                  key={`${i}:${state.moveCount}`}
                  style={anim && anim.cells.has(i) ? {
                    animation: `${anim.name} ${0.28 / Math.max(0.3, animSpeed)}s cubic-bezier(.25,.8,.3,1) both`,
                  } : undefined}
                >
                  <Cube
                    v={v} theme={theme} size={CELL - 3} symbols={symbols}
                    eligible={eligible && selected == null}
                    selected={isSel}
                    hint={hintMove != null && hintMove.src === i && selected == null}
                    dim={selected != null && selected !== i && phase === 'play'}
                    winner={winner}
                  />
                </div>
              </div>
            );
          })}

          {/* Winning line highlight */}
          {winLine && (
            <svg viewBox="0 0 5 5" preserveAspectRatio="none" style={{
              position: 'absolute', inset: PAD, width: `calc(100% - ${PAD * 2}px)`, height: `calc(100% - ${PAD * 2}px)`,
              pointerEvents: 'none', zIndex: 5,
            }}>
              {(() => {
                const a = winLine[0], b = winLine[4];
                const ax = (a % 5) + 0.5, ay = Math.floor(a / 5) + 0.5;
                const bx = (b % 5) + 0.5, by = Math.floor(b / 5) + 0.5;
                const lineColor = state.winner === 'ai' ? theme.danger : theme.accent;
                return (
                  <line x1={ax} y1={ay} x2={bx} y2={by}
                    stroke={lineColor} strokeWidth="0.07"
                    strokeLinecap="round"
                    style={{ animation: 'qLinePulse 1.3s ease-in-out infinite' }}
                  />
                );
              })()}
            </svg>
          )}

          {/* assist: a pulsing guide line through any line one push from five —
              gold when it's yours to complete, red when it's Pavlov's threat */}
          {assists && !winLine && selected == null && (
            <svg viewBox="0 0 5 5" preserveAspectRatio="none" style={{
              position: 'absolute', inset: PAD, width: `calc(100% - ${PAD * 2}px)`, height: `calc(100% - ${PAD * 2}px)`,
              pointerEvents: 'none', zIndex: 4,
            }}>
              {lineInfo.map((li, k) => {
                if (!li.hotYou && !li.hotAi) return null;
                const a = li.line[0], b = li.line[4];
                const ax = (a % 5) + 0.5, ay = Math.floor(a / 5) + 0.5;
                const bx = (b % 5) + 0.5, by = Math.floor(b / 5) + 0.5;
                const col = li.hotAi ? theme.danger : theme.accent;
                return (
                  <line key={k} x1={ax} y1={ay} x2={bx} y2={by}
                    stroke={col} strokeWidth="0.055" strokeLinecap="round"
                    strokeDasharray="0.1 0.18" opacity="0.75"
                    style={{ animation: 'qLinePulse 1.3s ease-in-out infinite' }} />
                );
              })}
            </svg>
          )}
        </div>

        {/* Push arrows for the selected cube */}
        {selected != null && dests.map(d => {
          const r = Math.floor(d / 5), c = d % 5;
          const sameRow = r === Math.floor(selected / 5);
          let pos, glyph;
          if (sameRow) {
            if (c === 0) { pos = { left: -15, top: centerOf(r) - 15 }; glyph = '→'; }
            else         { pos = { right: -15, top: centerOf(r) - 15 }; glyph = '←'; }
          } else {
            if (r === 0) { pos = { top: -15, left: centerOf(c) - 15 }; glyph = '↓'; }
            else         { pos = { bottom: -15, left: centerOf(c) - 15 }; glyph = '↑'; }
          }
          const hinted = hintMove != null && hintMove.src === selected && hintMove.dest === d;
          return (
            <button key={d} onClick={() => onArrow(d)} aria-label={`push ${glyph}`} style={{
              position: 'absolute', ...pos,
              width: 30, height: 30, borderRadius: '50%',
              border: 'none',
              background: theme.accent, color: theme.chrome,
              fontSize: 16, fontWeight: 700, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', zIndex: 10,
              boxShadow: `0 4px 12px rgba(0,0,0,0.4), 0 0 14px ${theme.accentGlow}`,
              animation: hinted ? 'qHintPulse 1.4s ease-in-out infinite' : 'qArrowIn .18s ease-out both',
            }}>{glyph}</button>
          );
        })}

        {/* per-line tally chips — the assist */}
        {assists && selected == null && <LineChips lineInfo={lineInfo} theme={theme} ended={phase === 'ended'} />}

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

// Row chips down the right edge, column chips along the bottom — shown when
// a line has 3+ of one symbol and none of the other. Filled + pulsing when
// one push from five. Diagonal chips sit on the two right corners.
function LineChips({ lineInfo, theme, ended }) {
  if (ended) return null;
  const chip = (info, key, style) => {
    const yours = info.you > 0 && info.ai === 0 && info.you >= 2;
    const theirs = info.ai > 0 && info.you === 0 && info.ai >= 2;
    if (!yours && !theirs) return null;
    const n = yours ? info.you : info.ai;
    const hot = info.hotYou || info.hotAi;
    const color = yours ? theme.accent : theme.danger;
    return (
      <div key={key} style={{
        position: 'absolute', ...style,
        minWidth: 18, height: 18, padding: '0 3px',
        borderRadius: 9, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hot ? color : `${color}33`,
        color: hot ? theme.chrome : color,
        fontFamily: theme.fontUI, fontSize: 10, lineHeight: 1, fontWeight: 700,
        boxShadow: hot ? `0 0 8px ${yours ? theme.accentGlow : theme.danger + '88'}` : 'none',
        animation: hot ? 'qLinePulse 1.3s ease-in-out infinite' : 'none',
        pointerEvents: 'none', zIndex: 8,
      }} title={`${n}/5 ${yours ? 'crosses' : 'circles'}${hot ? ' — one push from five' : ''}`}>
        {n}
      </div>
    );
  };
  return (
    <>
      {[0, 1, 2, 3, 4].map(r => chip(lineInfo[r], `r${r}`, { right: -22, top: centerOf(r) - 9 }))}
      {[0, 1, 2, 3, 4].map(c => chip(lineInfo[5 + c], `c${c}`, { bottom: -22, left: centerOf(c) - 9 }))}
      {chip(lineInfo[10], 'd0', { top: -22, left: -10 })}
      {chip(lineInfo[11], 'd1', { bottom: -22, left: -10 })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer action bar
// ─────────────────────────────────────────────────────────────

function ActionBar({ theme, onHint, onUndo, onConcede, hintActive, canUndo }) {
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
      <Btn icon="⚑" label="Concede" onClick={onConcede} />
    </div>
  );
}

window.QuixoBoardKit = { GameHeader, TurnBar, Board, ActionBar, Avatar };
