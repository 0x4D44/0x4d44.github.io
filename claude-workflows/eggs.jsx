/* eggs.jsx — shared helpers + the organised silliness.
   Loaded first; exposes CWReveal, useCWReveal, and a global egg bus. */
const { useState, useEffect, useRef, useCallback } = React;

/* ---- reveal-on-scroll ------------------------------------------------ */
function useCWReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.01, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    // failsafe: never let content stay invisible (e.g. very tall elements,
    // deep-links, or odd viewports) — reveal after a beat regardless.
    const fs = setTimeout(() => { if (el && !el.classList.contains("in")) el.classList.add("in"); }, 2600);
    return () => { io.disconnect(); clearTimeout(fs); };
  }, []);
  return ref;
}
function CWReveal({ children, className = "", as: Tag = "div", ...rest }) {
  const ref = useCWReveal();
  return <Tag ref={ref} className={"cw-reveal " + className} {...rest}>{children}</Tag>;
}

/* ---- a tiny global event bus so any component can fire a gag --------- */
const cwBus = {
  _l: [],
  on(fn) { this._l.push(fn); return () => { this._l = this._l.filter((x) => x !== fn); }; },
  fire(name) { this._l.forEach((fn) => fn(name)); },
};
window.cwFireEgg = (name) => cwBus.fire(name);

/* ---- the lot ---------------------------------------------------------- */
function EasterEggs() {
  const [foot, setFoot] = useState(false);
  const [fart, setFart] = useState(false);
  const [signs, setSigns] = useState([]);     // keep-left sign gang
  const [popup, setPopup] = useState(null);   // {emoji,big,body}
  const [bubble, setBubble] = useState(null);
  const sillyCount = useRef(0);

  const dropFoot = useCallback(() => {
    setFoot(false);
    requestAnimationFrame(() => {
      setFoot(true);
      setTimeout(() => setFart(true), 950);
      setTimeout(() => setFart(false), 2600);
      setTimeout(() => setFoot(false), 2400);
    });
  }, []);

  const summonSigns = useCallback(() => {
    const gang = Array.from({ length: 11 }).map((_, i) => ({
      id: Date.now() + "_" + i,
      top: 12 + Math.random() * 72,
      delay: i * 90,
      dur: 2600 + Math.random() * 1400,
      flip: Math.random() > 0.5,
    }));
    setSigns(gang);
    setTimeout(() => setSigns([]), 4600);
  }, []);

  const POPUPS = {
    inquisition: { emoji: "🃏", big: "Nobody expects the token bill!", body: "Our chief weapon is surprise… surprise and a substantially higher usage than a typical session. Two weapons. Check /usage." },
    parrot: { emoji: "🦜", big: "This workflow is not dead.", body: "It's resting! Remarkable runtime, the Norwegian Orchestrator. Lovely plumage. Progress is saved — it picks up right where it left off." },
    fawlty: { emoji: "🏨", big: "Don't mention the migration!", body: "I mentioned it once, but I think I got away with it. (You can absolutely mention the migration. It ports thousands of files end-to-end.)" },
  };

  useEffect(() => {
    const off = cwBus.on((name) => {
      if (name === "foot") dropFoot();
      else if (name === "signs") summonSigns();
      else if (name === "silly") {
        sillyCount.current += 1;
        if (sillyCount.current % 3 === 0) summonSigns();
        else dropFoot();
      }
      else if (POPUPS[name]) setPopup(POPUPS[name]);
      else if (name === "gag") {
        const g = window.GAGS[Math.floor(Math.random() * window.GAGS.length)];
        setBubble(g);
        clearTimeout(window.__cwBub);
        window.__cwBub = setTimeout(() => setBubble(null), 4200);
      }
    });
    return off;
  }, [dropFoot, summonSigns]);

  // konami-lite: type "ni"
  useEffect(() => {
    let buf = "";
    const onKey = (e) => {
      buf = (buf + e.key.toLowerCase()).slice(-3);
      if (buf.endsWith("ni")) setPopup({ emoji: "🌳", big: "We are the Knights who say… Ni!", body: "We demand a shrubbery! Then you must arrange these subagents so they fan out — fan-out / merge being a fine shrubbery indeed." });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <React.Fragment>
      {foot && (
        <div className="cw-foot-wrap stomp" aria-hidden="true">
          <div className="cw-foot">🦶</div>
        </div>
      )}
      {fart && <div className="cw-fart" role="status">…and now for something completely parallel.</div>}

      {signs.map((s) => (
        <div
          key={s.id}
          className="cw-sign"
          aria-hidden="true"
          style={{
            top: s.top + "vh",
            left: "-80px",
            animation: `cw-marchSign ${s.dur}ms linear ${s.delay}ms forwards`,
            transform: s.flip ? "scaleX(-1)" : "none",
          }}
        >↰</div>
      ))}

      {/* floating gag button */}
      <button className="cw-gagbtn" onClick={() => cwBus.fire("gag")} title="Say something silly">
        ✦ say something silly
      </button>
      {bubble && <div className="cw-gagbubble" onClick={() => setBubble(null)}>“{bubble}”</div>}

      {popup && (
        <div className="cw-popup-mask" onClick={() => setPopup(null)}>
          <div className="cw-popup" onClick={(e) => e.stopPropagation()}>
            <button className="cw-x x" onClick={() => setPopup(null)} aria-label="close">✕</button>
            <div className="emoji" aria-hidden="true">{popup.emoji}</div>
            <div className="big">{popup.big}</div>
            <p>{popup.body}</p>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

/* inject the keyframe the signs need (keeps it out of the static CSS) */
(function injectSignKeyframes() {
  if (document.getElementById("cw-sign-kf")) return;
  const s = document.createElement("style");
  s.id = "cw-sign-kf";
  s.textContent =
    "@keyframes cw-marchSign{0%{left:-80px;}100%{left:108vw;}}";
  document.head.appendChild(s);
})();

Object.assign(window, { CWReveal, useCWReveal, EasterEggs });
