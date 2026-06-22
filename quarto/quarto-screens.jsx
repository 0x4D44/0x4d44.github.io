// quarto-screens.jsx — non-board screens.
//
// Home, Win/Lose modal, Settings, History, Onboarding cards.
// All read from a single `theme` object so the same components compose into
// any of the three direction artboards.

const Q = window.QuartoBoardKit;
const QPiece = window.QuartoPiece;

// ─────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────
function HomeScreen({ theme, onPlay, pieceStyle, onSettings, onHistory, onLearn, resumable = false, onResume, stats }) {
  const liveStats = stats || [
    { k: 'Rank', v: '—' },
    { k: 'Won', v: '0' },
    { k: 'Streak', v: '0' },
  ];
  return (
    <div style={{
      height: '100%', boxSizing: 'border-box',
      padding: '70px 24px 50px',
      display: 'flex', flexDirection: 'column',
      gap: 26,
      background: theme.bg,
      color: theme.text,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* decorative pieces in the corner */}
      <div style={{ position: 'absolute', top: 60, right: -30, opacity: 0.7 }}>
        <QPiece p={0b0101} theme={theme} size={70} flatStyle={pieceStyle} />
      </div>
      <div style={{ position: 'absolute', top: 100, right: 36, opacity: 0.85 }}>
        <QPiece p={0b1110} theme={theme} size={48} flatStyle={pieceStyle} />
      </div>

      {/* Eyebrow */}
      <div style={{
        fontFamily: theme.fontUI, fontSize: 11, letterSpacing: '0.32em',
        color: theme.accent, textTransform: 'uppercase',
      }}>Quarto · est. 1991</div>

      {/* Title */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{
          fontFamily: theme.fontDisplay,
          fontSize: 64, fontWeight: 400, lineHeight: 0.92,
          letterSpacing: '-0.03em', color: theme.text,
        }}>Quarto.</div>
        <div style={{
          fontFamily: theme.fontDisplay,
          fontStyle: 'italic',
          fontSize: 19, color: theme.textDim,
          marginTop: 14, lineHeight: 1.35, maxWidth: 260,
        }}>
          The strategy game where every piece you play <span style={{ color: theme.accent }}>is chosen by your opponent</span>.
        </div>
      </div>

      {/* Quick stats */}
      <div style={{
        display: 'flex', gap: 0,
        borderTop: `1px solid ${theme.panelBorder}`,
        borderBottom: `1px solid ${theme.panelBorder}`,
        padding: '14px 0',
      }}>
        {liveStats.map((s, i, arr) => (
          <div key={s.k} style={{
            flex: 1, textAlign: 'center',
            borderRight: i < arr.length - 1 ? `1px solid ${theme.panelBorder}` : 'none',
          }}>
            <div style={{ fontFamily: theme.fontDisplay, fontSize: 22, color: theme.text }}>{s.v}</div>
            <div style={{ fontFamily: theme.fontUI, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.textFaint, marginTop: 2 }}>{s.k}</div>
          </div>
        ))}
      </div>

      {/* Primary actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {resumable && (
          <button onClick={onResume} style={{
            height: 52, border: `1px solid ${theme.accent}`, borderRadius: 14,
            background: theme.panel, color: theme.text,
            fontFamily: theme.fontUI, fontSize: 13, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px',
          }}>
            <span>Resume game</span>
            <span style={{ color: theme.accent, fontSize: 18 }}>↻</span>
          </button>
        )}
        <button onClick={() => onPlay('ai')} style={{
          height: 56, border: 'none', borderRadius: 14,
          background: `linear-gradient(180deg, ${theme.accent}, ${theme.pieceDark.sideTop})`,
          color: theme.chrome, fontFamily: theme.fontUI, fontSize: 15, fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: `0 12px 28px ${theme.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px',
        }}>
          <span>{resumable ? 'New game' : 'Play vs Pavlov'}</span>
          <span style={{ fontFamily: theme.fontDisplay, fontStyle: 'italic', fontSize: 12, opacity: 0.7, textTransform: 'none', letterSpacing: 0 }}>medium</span>
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <SecondaryBtn theme={theme} label="How to play" onClick={onLearn || (() => onPlay('learn'))} />
          <SecondaryBtn theme={theme} label="Matches" onClick={onHistory || (() => onPlay('history'))} />
        </div>
        <SecondaryBtn theme={theme} label="Settings" onClick={onSettings || (() => onPlay('settings'))} />
      </div>

      {/* Bottom strip */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: theme.fontUI, fontSize: 10, color: theme.textFaint,
        letterSpacing: '0.15em', textTransform: 'uppercase',
      }}>
        <span>Friends · 12 online</span>
        <span>{theme.name}</span>
      </div>
    </div>
  );
}

function SecondaryBtn({ theme, label, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, height: 48, padding: '0 14px',
      background: theme.panel, border: `1px solid ${theme.panelBorder}`,
      borderRadius: 12, color: theme.text,
      fontFamily: theme.fontUI, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'relative',
    }}>
      <span>{label}</span>
      {badge && <span style={{
        fontSize: 9, padding: '2px 6px', borderRadius: 99,
        background: theme.accent, color: theme.chrome, letterSpacing: '0.1em',
      }}>{badge}</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// WIN / LOSE / DRAW MODAL
// ─────────────────────────────────────────────────────────────
function ResultModal({ state, theme, pieceStyle, onAgain, onMenu }) {
  if (state.phase !== 'ended') return null;
  const won = state.winner === 'you';
  const draw = state.winner === 'draw';
  const lost = state.winner === 'ai';
  const winPieces = state.winLine ? state.winLine.map(i => state.board[i]) : [];

  // ── LOSS: keep the board (and its red pulsing line) fully visible. ──
  // Instead of a blocking modal we anchor a slim action strip to the bottom,
  // veiling only the now-defunct pool / action bar — never the board.
  if (lost) {
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        zIndex: 100,
        paddingTop: 60,
        background: `linear-gradient(180deg, transparent 0%, ${theme.chrome}d9 42%, ${theme.chrome} 100%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
        gap: 12, padding: '60px 18px 18px',
        animation: 'qFadeIn .3s ease',
        pointerEvents: 'none',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: theme.danger,
            boxShadow: `0 0 10px ${theme.danger}`,
            animation: 'qLinePulse 1.3s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <div style={{
            fontFamily: theme.fontUI, fontSize: 11, letterSpacing: '0.04em',
            color: theme.textDim,
          }}>
            Pavlov closed the line in {state.moveCount} moves. Study it above.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <button onClick={onMenu} style={{
            flex: 1, height: 48, borderRadius: 12,
            background: 'transparent', border: `1px solid ${theme.panelBorder}`,
            color: theme.text, fontFamily: theme.fontUI, fontSize: 12,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Menu</button>
          <button onClick={onAgain} style={{
            flex: 2, height: 48, borderRadius: 12,
            background: theme.accent, border: 'none',
            color: theme.chrome, fontFamily: theme.fontUI, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            boxShadow: `0 0 18px ${theme.accentGlow}`,
          }}>Rematch</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      animation: 'qFadeIn .3s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 320,
        background: theme.chrome,
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: 22,
        padding: '28px 24px 22px',
        boxShadow: `0 30px 60px rgba(0,0,0,0.6), 0 0 0 1px ${theme.accent}33`,
        position: 'relative',
      }}>
        {/* Decorative line of brass */}
        <div style={{
          position: 'absolute', top: -1, left: 24, right: 24,
          height: 2, background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
        }} />

        <div style={{
          fontFamily: theme.fontUI, fontSize: 10, letterSpacing: '0.32em',
          textTransform: 'uppercase', color: theme.accent, textAlign: 'center',
        }}>
          {won ? '— a winning line —' : draw ? '— stalemate —' : '— opponent\'s line —'}
        </div>

        <div style={{
          fontFamily: theme.fontDisplay,
          fontSize: 52, fontWeight: 400, letterSpacing: '-0.02em',
          color: won ? theme.accent : (draw ? theme.text : theme.textDim),
          textAlign: 'center', lineHeight: 1, marginTop: 12,
        }}>
          {won ? 'Quarto!' : draw ? 'Drawn.' : 'Their line.'}
        </div>

        <div style={{
          fontFamily: theme.fontDisplay, fontStyle: 'italic',
          fontSize: 14, color: theme.textDim, textAlign: 'center',
          marginTop: 8,
        }}>
          {won ? 'You closed the line in ' + state.moveCount + ' moves.'
              : draw ? 'No one could complete a line.'
              : 'Pavlov closed the line in ' + state.moveCount + ' moves.'}
        </div>

        {/* The winning quartet */}
        {winPieces.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 8,
            marginTop: 22, padding: '14px 8px',
            background: theme.panel,
            border: `1px solid ${theme.panelBorder}`,
            borderRadius: 12,
          }}>
            {winPieces.map((p, i) => (
              <div key={i} style={{
                animation: `qWinHop .6s ${i * 0.08}s ease-out both`,
              }}>
                <QPiece p={p} theme={theme} size={38} flatStyle={pieceStyle} />
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <button onClick={onMenu} style={{
            flex: 1, height: 46, borderRadius: 12,
            background: 'transparent', border: `1px solid ${theme.panelBorder}`,
            color: theme.text, fontFamily: theme.fontUI, fontSize: 12,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Menu</button>
          <button onClick={onAgain} style={{
            flex: 2, height: 46, borderRadius: 12,
            background: theme.accent, border: 'none',
            color: theme.chrome, fontFamily: theme.fontUI, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            boxShadow: `0 0 18px ${theme.accentGlow}`,
          }}>Rematch</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SETTINGS  &  HISTORY  &  ONBOARDING
// (Compact, single-screen variants for the canvas.)
// ─────────────────────────────────────────────────────────────

// Backward-compat: if `settings` + `onChange` are passed, SettingsScreen is
// fully controlled. If not, it renders a static demo (used by canvas).
function SettingsScreen({ theme, onBack, settings, onChange }) {
  const ctrl = !!settings;
  const get = (k, fallback) => ctrl ? settings[k] : fallback;
  const set = (k, v) => ctrl && onChange && onChange(k, v);

  return (
    <div style={{
      height: '100%', boxSizing: 'border-box',
      padding: '64px 22px 40px',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column', gap: 16,
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'transparent', border: `1px solid ${theme.panelBorder}`,
          color: theme.text, fontSize: 18, cursor: 'pointer',
        }}>←</button>
        <div style={{ fontFamily: theme.fontDisplay, fontSize: 28 }}>Settings</div>
      </div>

      <SetGroup theme={theme} label="Direction">
        <SetSegment theme={theme} label="Theme"
          value={get('theme', 'atelier')}
          options={[
            { value: 'salon',   label: 'Salon'    },
            { value: 'atelier', label: 'Atelier'  },
            { value: 'modern',  label: 'Tabletop' },
          ]}
          onChange={v => set('theme', v)} />
        <SetSegment theme={theme} label="Piece style"
          value={get('pieceStyle', 'iso')}
          options={[
            { value: 'iso',           label: 'Iso'  },
            { value: 'three-quarter', label: '3/4'  },
            { value: 'topdown',       label: 'Top'  },
          ]}
          onChange={v => set('pieceStyle', v)} />
      </SetGroup>

      <SetGroup theme={theme} label="Match">
        <SetSegment theme={theme} label="Difficulty"
          value={get('difficulty', 'medium')}
          options={[
            { value: 'easy',   label: 'Easy'   },
            { value: 'medium', label: 'Medium' },
            { value: 'hard',   label: 'Hard'   },
          ]}
          onChange={v => set('difficulty', v)} />
        <SetSegment theme={theme} label="Animation"
          value={get('animSpeed', 1)}
          options={[
            { value: 1.6, label: 'Snappy' },
            { value: 1,   label: 'Smooth' },
            { value: 0.6, label: 'Slow'   },
          ]}
          onChange={v => set('animSpeed', v)} />
        <SetToggle theme={theme} label="Player assists"
          on={get('assists', true)} onChange={v => set('assists', v)} />
        <SetToggle theme={theme} label="Haptics"
          on={get('haptics', true)} onChange={v => set('haptics', v)} />
      </SetGroup>

      <SetGroup theme={theme} label="Data">
        <SetButton theme={theme} label="Clear match history"
          danger onClick={() => ctrl && onChange && onChange('__clearHistory', true)} />
        <SetButton theme={theme} label="Reset settings"
          onClick={() => ctrl && onChange && onChange('__reset', true)} />
      </SetGroup>

      <div style={{
        fontFamily: theme.fontUI, fontSize: 10, letterSpacing: '0.15em',
        textTransform: 'uppercase', color: theme.textFaint,
        textAlign: 'center', padding: '8px 0',
      }}>Quarto · v0.1</div>
    </div>
  );
}

// Controlled segmented control — used by SettingsScreen.
function SetSegment({ theme, label, value, options, onChange }) {
  const current = options.find(o => o.value === value);
  const labelText = current ? current.label : '';
  return (
    <div style={{
      padding: '10px 14px', borderBottom: `1px solid ${theme.panelBorder}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: theme.fontUI, fontSize: 13, color: theme.text }}>{label}</div>
        <div style={{ fontFamily: theme.fontDisplay, fontStyle: 'italic', fontSize: 12, color: theme.textDim }}>{labelText}</div>
      </div>
      <div style={{
        display: 'flex', background: 'rgba(0,0,0,0.18)',
        border: `1px solid ${theme.panelBorder}`, borderRadius: 8, padding: 2,
      }}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button key={String(opt.value)}
              onClick={() => onChange && onChange(opt.value)}
              style={{
                flex: 1, padding: '8px 0', border: 'none',
                fontFamily: theme.fontUI, fontSize: 11, letterSpacing: '0.04em',
                color: active ? theme.chrome : theme.textDim,
                background: active ? theme.accent : 'transparent',
                borderRadius: 6, transition: 'all .15s', cursor: 'pointer',
              }}>{opt.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function SetGroup({ theme, label, children }) {
  return (
    <div>
      <div style={{
        fontFamily: theme.fontUI, fontSize: 10, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: theme.textFaint, marginBottom: 6, paddingLeft: 4,
      }}>{label}</div>
      <div style={{
        background: theme.panel, border: `1px solid ${theme.panelBorder}`,
        borderRadius: 14, overflow: 'hidden',
      }}>{children}</div>
    </div>
  );
}

function SetRow({ theme, label, value, segment, selected }) {
  return (
    <div style={{
      padding: '10px 14px', borderBottom: `1px solid ${theme.panelBorder}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: theme.fontUI, fontSize: 13, color: theme.text }}>{label}</div>
        <div style={{ fontFamily: theme.fontDisplay, fontStyle: 'italic', fontSize: 12, color: theme.textDim }}>{value}</div>
      </div>
      <div style={{
        display: 'flex', background: 'rgba(0,0,0,0.18)',
        border: `1px solid ${theme.panelBorder}`, borderRadius: 8, padding: 2,
      }}>
        {segment.map((s, i) => (
          <div key={s} style={{
            flex: 1, textAlign: 'center', padding: '6px 0',
            fontFamily: theme.fontUI, fontSize: 11, letterSpacing: '0.04em',
            color: i === selected ? theme.chrome : theme.textDim,
            background: i === selected ? theme.accent : 'transparent',
            borderRadius: 6, transition: 'all .15s',
          }}>{s}</div>
        ))}
      </div>
    </div>
  );
}

function SetToggle({ theme, label, on, onChange }) {
  const toggle = () => onChange && onChange(!on);
  return (
    <div onClick={onChange ? toggle : undefined} style={{
      padding: '12px 14px', borderBottom: `1px solid ${theme.panelBorder}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: onChange ? 'pointer' : 'default',
      userSelect: 'none',
    }}>
      <div style={{ fontFamily: theme.fontUI, fontSize: 13, color: theme.text }}>{label}</div>
      <div style={{
        width: 38, height: 22, borderRadius: 99,
        background: on ? theme.accent : 'rgba(255,255,255,0.1)',
        border: `1px solid ${theme.panelBorder}`,
        position: 'relative', transition: 'all .2s',
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          background: theme.chrome,
          position: 'absolute', top: 2, left: on ? 19 : 2,
          transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
    </div>
  );
}

function SetLink({ theme, label, v }) {
  return (
    <div style={{
      padding: '14px', borderBottom: `1px solid ${theme.panelBorder}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div style={{ fontFamily: theme.fontUI, fontSize: 13, color: theme.text }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.textDim }}>
        <span style={{ fontFamily: theme.fontDisplay, fontStyle: 'italic', fontSize: 12 }}>{v}</span>
        <span style={{ fontSize: 14 }}>›</span>
      </div>
    </div>
  );
}

// Settings action row (a button styled like a list item).
function SetButton({ theme, label, onClick, danger = false }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '14px', display: 'block',
      background: 'transparent', border: 'none',
      borderBottom: `1px solid ${theme.panelBorder}`,
      textAlign: 'left', cursor: 'pointer',
      fontFamily: theme.fontUI, fontSize: 13,
      color: danger ? theme.danger : theme.text,
    }}>{label}</button>
  );
}

// ─────────────────────────────────────────────────────────────
// HISTORY / MATCHES
// ─────────────────────────────────────────────────────────────

// Controlled history: pass a `history` array of {opp, result ('won'|'lost'|'draw'),
// attr (optional), moves, when (ms timestamp) }. If omitted, renders a demo.
function HistoryScreen({ theme, pieceStyle, onBack, history }) {
  const demo = [
    { opp: 'Pavlov',       result: 'won',  attr: 'all round',  moves: 11, when: Date.now() - 2*3600e3 },
    { opp: 'Sasha A.',     result: 'won',  attr: 'all dark',   moves: 14, when: Date.now() - 22*3600e3 },
    { opp: 'Pavlov',       result: 'lost', attr: 'all hollow', moves:  9, when: Date.now() - 30*3600e3 },
    { opp: 'Daily · #182', result: 'won',  attr: 'all tall',   moves:  7, when: Date.now() - 3*86400e3, daily: true },
    { opp: 'Quentin R.',   result: 'draw', attr: '—',          moves: 16, when: Date.now() - 4*86400e3 },
    { opp: 'Pavlov',       result: 'lost', attr: 'all square', moves: 12, when: Date.now() - 5*86400e3 },
  ];
  const matches = Array.isArray(history) ? history : demo;
  const wins   = matches.filter(m => m.result === 'won').length;
  const losses = matches.filter(m => m.result === 'lost').length;
  const draws  = matches.filter(m => m.result === 'draw').length;
  const ago = (when) => {
    if (!when) return '';
    const dt = Date.now() - when;
    const h = dt / 3600e3;
    if (h < 1)        return Math.max(1, Math.round(dt / 60e3)) + 'm';
    if (h < 24)       return Math.round(h) + 'h';
    if (h < 24 * 7)   return Math.round(h / 24) + 'd';
    return Math.round(h / 24 / 7) + 'w';
  };

  return (
    <div style={{
      height: '100%', boxSizing: 'border-box',
      padding: '64px 22px 40px',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'transparent', border: `1px solid ${theme.panelBorder}`,
          color: theme.text, fontSize: 18, cursor: 'pointer',
        }}>←</button>
        <div style={{ fontFamily: theme.fontDisplay, fontSize: 28 }}>Matches</div>
      </div>

      {/* Stats strip */}
      <div style={{
        display: 'flex', marginTop: 16,
        background: theme.panel, border: `1px solid ${theme.panelBorder}`,
        borderRadius: 14, padding: '12px 0',
      }}>
        {[
          { k: 'won', v: wins, c: theme.success },
          { k: 'lost', v: losses, c: theme.danger },
          { k: 'drawn', v: draws, c: theme.textDim },
        ].map((s, i, arr) => (
          <div key={s.k} style={{
            flex: 1, textAlign: 'center',
            borderRight: i < arr.length - 1 ? `1px solid ${theme.panelBorder}` : 'none',
          }}>
            <div style={{ fontFamily: theme.fontDisplay, fontSize: 28, color: s.c }}>{s.v}</div>
            <div style={{ fontFamily: theme.fontUI, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.textFaint, marginTop: 2 }}>{s.k}</div>
          </div>
        ))}
      </div>

      {/* Quartet of pieces row — visual flavor */}
      <div style={{
        display: 'flex', gap: 4, marginTop: 16, marginBottom: 8,
        alignItems: 'flex-end', justifyContent: 'center',
        padding: '8px 0', borderBottom: `1px solid ${theme.panelBorder}`,
      }}>
        <div style={{
          fontFamily: theme.fontUI, fontSize: 9, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: theme.textFaint, marginRight: 8,
        }}>Recent</div>
      </div>

      {/* Match list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {matches.length === 0 && (
          <div style={{
            padding: '40px 16px', textAlign: 'center',
            fontFamily: theme.fontDisplay, fontStyle: 'italic',
            color: theme.textDim, fontSize: 14,
          }}>
            No matches yet.<br/>Win one against Pavlov.
          </div>
        )}
        {matches.map((m, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 4px', borderBottom: `1px solid ${theme.panelBorder}`,
          }}>
            {/* Result chip */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: m.result === 'won' ? `${theme.success}33`
                       : m.result === 'lost' ? `${theme.danger}33`
                       : `${theme.textFaint}33`,
              color: m.result === 'won' ? theme.success
                   : m.result === 'lost' ? theme.danger
                   : theme.textDim,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: theme.fontUI, fontWeight: 600, fontSize: 11,
              letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0,
            }}>{m.result === 'won' ? 'W' : m.result === 'lost' ? 'L' : 'D'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: theme.fontDisplay, fontSize: 15, color: theme.text, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                {m.opp}
                {m.daily && <span style={{
                  fontSize: 8, padding: '2px 5px', background: theme.accent, color: theme.chrome,
                  borderRadius: 99, letterSpacing: '0.15em', textTransform: 'uppercase',
                }}>daily</span>}
              </div>
              <div style={{ fontFamily: theme.fontUI, fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
                {m.moves} moves · <span style={{ fontStyle: 'italic', fontFamily: theme.fontDisplay, color: theme.textDim }}>{m.attr}</span>
              </div>
            </div>
            <div style={{
              fontFamily: theme.fontUI, fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: theme.textFaint,
            }}>{m.ago || ago(m.when)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ONBOARDING — single card, 3 dots
// ─────────────────────────────────────────────────────────────

function OnboardingScreen({ theme, pieceStyle, step = 1, onNext, onSkip }) {
  const steps = [
    {
      title: 'Sixteen pieces.',
      sub: 'Tall or short. Light or dark. Round or square. Solid or hollow. Every piece is unique.',
      art: <PieceRow theme={theme} pieces={[0b0000, 0b1111, 0b0101, 0b1010]} pieceStyle={pieceStyle} />,
    },
    {
      title: 'Four in a row wins.',
      sub: 'Line up four pieces that share any one attribute — across, down, or diagonally.',
      art: <PieceRow theme={theme} pieces={[0b0010, 0b0110, 0b1010, 0b1110]} pieceStyle={pieceStyle} caption="all dark" />,
    },
    {
      title: 'Here\'s the twist.',
      sub: 'You don\'t choose your own piece. Your opponent hands you the one you must play. And you hand them theirs.',
      art: <HandoffArt theme={theme} pieceStyle={pieceStyle} />,
    },
  ];
  const s = steps[Math.max(0, Math.min(steps.length - 1, step - 1))];
  return (
    <div style={{
      height: '100%', boxSizing: 'border-box',
      padding: '70px 28px 40px',
      background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column',
      gap: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{
          fontFamily: theme.fontUI, fontSize: 11, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: theme.accent,
        }}>How to play · {step}/3</div>
        <button onClick={onSkip} style={{
          background: 'none', border: 'none', color: theme.textDim,
          fontFamily: theme.fontUI, fontSize: 12, cursor: 'pointer',
        }}>Skip</button>
      </div>

      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px 0',
      }}>
        {s.art}
      </div>

      <div>
        <div style={{
          fontFamily: theme.fontDisplay, fontSize: 32,
          lineHeight: 1.05, letterSpacing: '-0.02em',
        }}>{s.title}</div>
        <div style={{
          fontFamily: theme.fontDisplay, fontStyle: 'italic',
          fontSize: 16, color: theme.textDim, marginTop: 12, lineHeight: 1.4,
        }}>{s.sub}</div>
      </div>

      {/* dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            width: i === step ? 20 : 6, height: 6, borderRadius: 99,
            background: i === step ? theme.accent : theme.textFaint,
            transition: 'all .2s',
          }} />
        ))}
      </div>

      <button onClick={onNext} style={{
        height: 52, border: 'none', borderRadius: 14,
        background: theme.accent, color: theme.chrome,
        fontFamily: theme.fontUI, fontSize: 13, fontWeight: 600,
        letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
        boxShadow: `0 8px 22px ${theme.accentGlow}`,
      }}>{step < 3 ? 'Next' : 'Begin'}</button>
    </div>
  );
}

function PieceRow({ theme, pieces, pieceStyle, caption }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {pieces.map((p, i) => <QPiece key={i} p={p} theme={theme} size={52} flatStyle={pieceStyle} />)}
      </div>
      {caption && (
        <div style={{
          fontFamily: theme.fontDisplay, fontStyle: 'italic', fontSize: 13,
          color: theme.accent, letterSpacing: '0.04em',
        }}>{caption}</div>
      )}
    </div>
  );
}

function HandoffArt({ theme, pieceStyle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <Q.Avatar kind="you" theme={theme} size={48} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          fontFamily: theme.fontDisplay, fontStyle: 'italic', fontSize: 11, color: theme.accent,
          marginBottom: 4,
        }}>plays this</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 18, color: theme.accent }}>→</span>
          <QPiece p={0b0110} theme={theme} size={42} flatStyle={pieceStyle} />
          <span style={{ fontSize: 18, color: theme.accent }}>→</span>
        </div>
      </div>
      <Q.Avatar kind="ai" theme={theme} size={48} />
    </div>
  );
}

window.QuartoScreens = {
  HomeScreen, ResultModal, SettingsScreen, HistoryScreen, OnboardingScreen,
};
