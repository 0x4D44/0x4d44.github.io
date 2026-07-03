// quixo-screens.jsx — non-board screens.
//
// Home, Win/Lose modal, Settings, History, Onboarding cards.
// All read from a single `theme` object so the same components compose into
// any of the three direction artboards. Mirrors the sibling Quarto app.

const Q = window.QuixoBoardKit;
const QCube = window.QuixoCube;

// ─────────────────────────────────────────────────────────────
// HOME SCREEN
// ─────────────────────────────────────────────────────────────
function HomeScreen({ theme, onPlay, symbols, onSettings, onHistory, onLearn, resumable = false, onResume, stats, isLight, onToggleLight }) {
  const liveStats = stats || [
    { k: 'Played', v: '0' },
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
      {/* decorative cubes in the corner */}
      <div style={{ position: 'absolute', top: 60, right: -20, opacity: 0.7 }}>
        <QCube v="you" theme={theme} size={70} symbols={symbols} />
      </div>
      <div style={{ position: 'absolute', top: 118, right: 46, opacity: 0.85 }}>
        <QCube v="ai" theme={theme} size={44} symbols={symbols} />
      </div>

      {/* Eyebrow + light/dark toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
        <div style={{
          fontFamily: theme.fontUI, fontSize: 11, letterSpacing: '0.32em',
          color: theme.accent, textTransform: 'uppercase',
        }}>Quixo · est. 1995</div>
        {onToggleLight && (
          <button onClick={onToggleLight} aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            height: 34, padding: '0 12px 0 10px',
            borderRadius: 99,
            background: theme.panel,
            border: `1px solid ${theme.panelBorder}`,
            color: theme.text, cursor: 'pointer',
            fontFamily: theme.fontUI, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            <span style={{ fontSize: 15, lineHeight: 1, color: theme.accent }}>{isLight ? '☀' : '☾'}</span>
            <span>{isLight ? 'Light' : 'Dark'}</span>
          </button>
        )}
      </div>

      {/* Title */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{
          fontFamily: theme.fontDisplay,
          fontSize: 64, fontWeight: 400, lineHeight: 0.92,
          letterSpacing: '-0.03em', color: theme.text,
        }}>Quixo.</div>
        <div style={{
          fontFamily: theme.fontDisplay,
          fontStyle: 'italic',
          fontSize: 19, color: theme.textDim,
          marginTop: 14, lineHeight: 1.35, maxWidth: 270,
        }}>
          The strategy game where every move <span style={{ color: theme.accent }}>pushes a whole row of the board</span>.
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
          background: `linear-gradient(180deg, ${theme.accent}, ${theme.cube.sideBot})`,
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
        <span>Gigamic classics · № 3</span>
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
function ResultModal({ state, theme, symbols, onAgain, onMenu }) {
  if (state.phase !== 'ended') return null;
  const E = window.QuixoEngine;
  const won = state.winner === 'you';
  const draw = state.winner === 'draw';
  const lost = state.winner === 'ai';
  const attr = E.lineName(state.winLine);

  // ── LOSS: keep the board (and its red pulsing line) fully visible. ──
  // A slim action strip anchors to the bottom instead of a blocking modal.
  if (lost) {
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        zIndex: 100,
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
            {state.winLine
              ? `Pavlov lined up five circles in ${state.moveCount} moves. Study it above.`
              : 'You conceded the match.'}
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
          {won ? '— five in a row —' : '— stalemate —'}
        </div>

        <div style={{
          fontFamily: theme.fontDisplay,
          fontSize: 52, fontWeight: 400, letterSpacing: '-0.02em',
          color: won ? theme.accent : theme.text,
          textAlign: 'center', lineHeight: 1, marginTop: 12,
        }}>
          {won ? 'Quixo!' : 'Drawn.'}
        </div>

        <div style={{
          fontFamily: theme.fontDisplay, fontStyle: 'italic',
          fontSize: 14, color: theme.textDim, textAlign: 'center',
          marginTop: 8,
        }}>
          {won ? `Five crosses along ${attr} in ${state.moveCount} moves.`
               : 'Neither side could line up five.'}
        </div>

        {/* The winning five */}
        {won && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 6,
            marginTop: 22, padding: '14px 8px',
            background: theme.panel,
            border: `1px solid ${theme.panelBorder}`,
            borderRadius: 12,
          }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{
                animation: `qWinHop .6s ${i * 0.08}s ease-out both`,
              }}>
                <QCube v="you" theme={theme} size={36} symbols={symbols} />
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
// SETTINGS
// ─────────────────────────────────────────────────────────────

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
        <SetSegment theme={theme} label="Symbols"
          value={get('symbols', 'tinted')}
          options={[
            { value: 'tinted',   label: 'Tinted'   },
            { value: 'engraved', label: 'Engraved' },
          ]}
          onChange={v => set('symbols', v)} />
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
      }}>Quixo · v0.1</div>
    </div>
  );
}

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

function HistoryScreen({ theme, symbols, onBack, history }) {
  const matches = Array.isArray(history) ? history : [];
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
              <div style={{ fontFamily: theme.fontDisplay, fontSize: 15, color: theme.text }}>
                {m.opp}
              </div>
              <div style={{ fontFamily: theme.fontUI, fontSize: 11, color: theme.textFaint, marginTop: 2 }}>
                {m.moves} moves · <span style={{ fontStyle: 'italic', fontFamily: theme.fontDisplay, color: theme.textDim }}>{m.attr || '—'}</span>
              </div>
            </div>
            <div style={{
              fontFamily: theme.fontUI, fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: theme.textFaint,
            }}>{ago(m.when)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ONBOARDING — single card, 3 dots
// ─────────────────────────────────────────────────────────────

function OnboardingScreen({ theme, symbols, step = 1, onNext, onSkip }) {
  const steps = [
    {
      title: 'Twenty-five cubes.',
      sub: 'All blank at the start. On your turn, take any cube from the edge of the board that is blank or already shows your cross. Never one of theirs.',
      art: <CubeRow theme={theme} cubes={['you', null, null, 'ai']} symbols={symbols} />,
    },
    {
      title: 'Push, don\u2019t place.',
      sub: 'Your cube turns to a cross and goes back in from a different end of its row or column — sliding the whole line one square.',
      art: <PushArt theme={theme} symbols={symbols} />,
    },
    {
      title: 'Five in a row wins.',
      sub: 'Across, down or diagonally. But careful — if your push lines up five circles, Pavlov wins on the spot. Even if it lines up your five too.',
      art: <CubeRow theme={theme} cubes={['you', 'you', 'you', 'you', 'you']} symbols={symbols} caption="quixo!" />,
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

function CubeRow({ theme, cubes, symbols, caption }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {cubes.map((v, i) => <QCube key={i} v={v} theme={theme} size={cubes.length > 4 ? 46 : 52} symbols={symbols} />)}
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

// A row mid-push: the lifted cross re-enters from the right, the line slides.
function PushArt({ theme, symbols }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <QCube v={null} theme={theme} size={48} symbols={symbols} />
        <QCube v="ai" theme={theme} size={48} symbols={symbols} />
        <QCube v={null} theme={theme} size={48} symbols={symbols} />
        <span style={{ fontSize: 20, color: theme.accent, margin: '0 2px' }}>←</span>
        <QCube v="you" theme={theme} size={48} symbols={symbols} selected />
      </div>
      <div style={{
        fontFamily: theme.fontDisplay, fontStyle: 'italic', fontSize: 13,
        color: theme.accent, letterSpacing: '0.04em',
      }}>the row slides one square</div>
    </div>
  );
}

window.QuixoScreens = {
  HomeScreen, ResultModal, SettingsScreen, HistoryScreen, OnboardingScreen,
};
