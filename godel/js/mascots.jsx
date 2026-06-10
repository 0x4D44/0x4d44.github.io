/* global React */
// ============================================================
// MASCOTS — friendly SVG plushies who guide the reader
//   Kurt    : a green snake (narrator, nod to Kurt Gödel)
//   Esther  : an E. coli bacterium (microbiology buddy)
//   Cassini : Saturn plushie
//   Jove    : Jupiter plushie
// ============================================================

function MascotKurt({ size = 64 }) {
  // a friendly coiled snake
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M14 44c0-10 8-16 18-16s16 5 16 12-6 11-13 11c-6 0-9-3-9-7s3-6 6-6 5 2 5 4"
        stroke="#3f9b54" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M14 44c0-10 8-16 18-16s16 5 16 12-6 11-13 11c-6 0-9-3-9-7s3-6 6-6 5 2 5 4"
        stroke="#7ddb8a" strokeWidth="3.4" strokeLinecap="round" fill="none" strokeDasharray="1.5 5" />
      {/* head */}
      <circle cx="14" cy="40" r="9" fill="#5cc06d" />
      <circle cx="11" cy="38" r="1.7" fill="#0a130d" />
      <circle cx="17" cy="38" r="1.7" fill="#0a130d" />
      <circle cx="11.5" cy="37.4" r="0.6" fill="#fff" />
      <circle cx="17.5" cy="37.4" r="0.6" fill="#fff" />
      <path d="M9 45c2 1.5 5 1.5 7 0" stroke="#0a130d" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M6 41l-4-1 4-1" stroke="#e88a8a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function MascotEsther({ size = 64 }) {
  // a rod-shaped bacterium with flagella
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M52 30c4 2 6-2 9 0M52 36c4 3 7 0 10 2M50 24c3-3 7-1 9-4"
        stroke="#3f7f88" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <rect x="8" y="20" width="44" height="26" rx="13" fill="#1f6f7d" />
      <rect x="8" y="20" width="44" height="26" rx="13" fill="none" stroke="#6cd6e8" strokeWidth="2" />
      <circle cx="20" cy="29" r="3.2" fill="#9fe9f4" opacity="0.55" />
      <circle cx="34" cy="38" r="2.4" fill="#9fe9f4" opacity="0.45" />
      <circle cx="22" cy="32" r="2" fill="#0a130d" />
      <circle cx="31" cy="32" r="2" fill="#0a130d" />
      <circle cx="22.7" cy="31.3" r="0.7" fill="#fff" />
      <circle cx="31.7" cy="31.3" r="0.7" fill="#fff" />
      <path d="M21 37c2.5 2.5 7 2.5 10 0" stroke="#0a130d" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function MascotCassini({ size = 64 }) {
  // Saturn plushie
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <ellipse cx="32" cy="34" rx="30" ry="9" fill="none" stroke="#e0b35e" strokeWidth="3.4" opacity="0.85" />
      <circle cx="32" cy="32" r="17" fill="#d8a44e" />
      <path d="M16 28c10 3 22 3 32 0M17 37c9 2 21 2 30 0" stroke="#b5832f" strokeWidth="2" fill="none" opacity="0.6" />
      <ellipse cx="32" cy="34" rx="30" ry="9" fill="none" stroke="#f0cd86" strokeWidth="1.4" opacity="0.9"
        strokeDasharray="2 4" />
      <circle cx="27" cy="30" r="2" fill="#3a2a10" />
      <circle cx="37" cy="30" r="2" fill="#3a2a10" />
      <circle cx="27.7" cy="29.3" r="0.7" fill="#fff" />
      <circle cx="37.7" cy="29.3" r="0.7" fill="#fff" />
      <path d="M27 36c2.5 2.5 7.5 2.5 10 0" stroke="#3a2a10" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="23" cy="35" r="2.4" fill="#e88a8a" opacity="0.45" />
      <circle cx="41" cy="35" r="2.4" fill="#e88a8a" opacity="0.45" />
    </svg>
  );
}

function MascotJove({ size = 64 }) {
  // Jupiter plushie with great red spot
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <clipPath id="jclip"><circle cx="32" cy="32" r="20" /></clipPath>
      </defs>
      <circle cx="32" cy="32" r="20" fill="#cf9b6a" />
      <g clipPath="url(#jclip)">
        <rect x="12" y="20" width="40" height="4.5" fill="#b87f4e" opacity="0.7" />
        <rect x="12" y="28" width="40" height="3.5" fill="#e3c08f" opacity="0.6" />
        <rect x="12" y="38" width="40" height="5" fill="#b87f4e" opacity="0.6" />
        <rect x="12" y="46" width="40" height="3.5" fill="#e3c08f" opacity="0.5" />
        <ellipse cx="40" cy="40" rx="6" ry="4" fill="#d4795a" opacity="0.85" />
      </g>
      <circle cx="32" cy="32" r="20" fill="none" stroke="#e3c08f" strokeWidth="1.5" opacity="0.5" />
      <circle cx="27" cy="30" r="2" fill="#3a2410" />
      <circle cx="37" cy="30" r="2" fill="#3a2410" />
      <circle cx="27.7" cy="29.3" r="0.7" fill="#fff" />
      <circle cx="37.7" cy="29.3" r="0.7" fill="#fff" />
      <path d="M28 35c2 2 6 2 8 0" stroke="#3a2410" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const MASCOTS = { kurt: MascotKurt, esther: MascotEsther, cassini: MascotCassini, jove: MascotJove };
const MASCOT_NAMES = {
  kurt: "Kurt · the snake",
  esther: "Esther · the bacterium",
  cassini: "Cassini · Saturn",
  jove: "Jove · Jupiter",
};

function Aside({ who = "kurt", children }) {
  const M = MASCOTS[who] || MascotKurt;
  return (
    <aside className={"aside " + who}>
      <div className="aside-avatar"><M size={58} /></div>
      <div className="aside-body">
        <span className="aside-name">{MASCOT_NAMES[who]}</span>
        {children}
      </div>
    </aside>
  );
}

// big ouroboros for the hero
function Ouroboros({ size = 180 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true"
      style={{ filter: "drop-shadow(0 0 26px rgba(47,184,107,0.25))" }}>
      <circle cx="100" cy="100" r="62" fill="none" stroke="#2a6d3a" strokeWidth="20" />
      <circle cx="100" cy="100" r="62" fill="none" stroke="#7ddb8a" strokeWidth="9"
        strokeDasharray="3 14" strokeLinecap="round" opacity="0.8" />
      <circle cx="100" cy="100" r="62" fill="none" stroke="#3f9b54" strokeWidth="20"
        strokeDasharray="80 310" strokeLinecap="round"
        transform="rotate(-30 100 100)" opacity="0.0" />
      {/* head biting tail near top */}
      <g transform="rotate(8 100 38)">
        <circle cx="100" cy="38" r="15" fill="#5cc06d" />
        <circle cx="94" cy="35" r="2.4" fill="#0a130d" />
        <circle cx="105" cy="35" r="2.4" fill="#0a130d" />
        <circle cx="94.8" cy="34" r="0.9" fill="#fff" />
        <circle cx="105.8" cy="34" r="0.9" fill="#fff" />
        <path d="M92 44c5 3 11 3 16 0" stroke="#0a130d" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M100 52l-3 6 3-2 3 2z" fill="#e88a8a" />
      </g>
    </svg>
  );
}

Object.assign(window, { MascotKurt, MascotEsther, MascotCassini, MascotJove, Aside, Ouroboros, MASCOTS });
