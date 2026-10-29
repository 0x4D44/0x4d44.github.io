// Inline SVG icons drawn for Skyblitz (items, stats, medals, misc). Owner: UI agent.
// Every icon is a 48x48 viewBox string using currentColor plus a few fixed accent fills, so CSS can recolour it.
const S = (body, extra = '') => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

export const ITEM_ICONS = {
  missile: S('<path d="M10 38 20 28" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M18 30 34 14c3-3 7-4 10-4 0 3-1 7-4 10L24 36z" fill="currentColor"/><path d="M18 30l-8 2 4 4zM24 36l-2 8-4-4z" fill="#ffd02e"/><circle cx="35" cy="13" r="2.4" fill="#0b1530"/><path d="M6 42l8-8" stroke="#ffd02e" stroke-width="3" stroke-linecap="round" opacity=".7"/>'),
  triple: S('<g fill="currentColor"><path d="M6 36 20 22c2-2 5-3 8-3-1 3-1 6-3 8L11 41z"/><path d="M14 40 28 26c2-2 5-3 8-3-1 3-1 6-3 8L19 45z" opacity=".85"/><path d="M20 30 34 16c2-2 5-3 8-3-1 3-1 6-3 8L25 35z" opacity=".7"/></g><circle cx="38" cy="15" r="2" fill="#0b1530"/>'),
  mine: S('<circle cx="24" cy="25" r="12" fill="currentColor"/><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M24 7v6M24 37v6M6 25h6M36 25h6M11 12l4 4M33 34l4 4M37 12l-4 4M15 34l-4 4"/></g><circle cx="20" cy="21" r="3.5" fill="#fff" opacity=".55"/><path d="M33 8c2-2 5-2 6 0" stroke="#ffd02e" stroke-width="2.5" fill="none" stroke-linecap="round"/>'),
  turbo: S('<path d="M28 4 10 27h11l-3 17 20-25H27z" fill="currentColor"/><path d="M28 4 10 27h5L31 8z" fill="#fff" opacity=".35"/>'),
  turbo3: S('<g fill="currentColor"><path d="M14 6 3 24h7l-2 14 13-18h-7z"/><path d="M27 6 16 24h7l-2 14 13-18h-7z" opacity=".8"/><path d="M40 8 31 24h6l-2 12 11-15h-6z" opacity=".6"/></g>'),
  shield: S('<path d="M24 3 8 9v14c0 11 7 18 16 22 9-4 16-11 16-22V9z" fill="currentColor"/><path d="M24 3v42c9-4 16-11 16-22V9z" fill="#0b1530" opacity=".22"/><path d="M16 24l6 6 11-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  emp: S('<circle cx="24" cy="24" r="5" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M13 13a16 16 0 0 0 0 22"/><path d="M35 13a16 16 0 0 1 0 22"/><path d="M6 7a26 26 0 0 0 0 34" opacity=".6"/><path d="M42 7a26 26 0 0 1 0 34" opacity=".6"/></g>'),
  storm: S('<path d="M14 30a9 9 0 0 1 1-17 11 11 0 0 1 21 3 7 7 0 0 1-1 14z" fill="currentColor"/><path d="M26 24 18 36h6l-3 10 11-14h-6l3-8z" fill="#ffd02e" stroke="#0b1530" stroke-width="1.5" stroke-linejoin="round"/>'),
  smoke: S('<g fill="currentColor"><circle cx="16" cy="30" r="9"/><circle cx="29" cy="26" r="11"/><circle cx="36" cy="34" r="7"/><circle cx="22" cy="38" r="7" opacity=".8"/></g><circle cx="27" cy="22" r="4" fill="#fff" opacity=".35"/>'),
  drone: S('<g fill="currentColor"><ellipse cx="24" cy="26" rx="9" ry="6"/><path d="M4 16h16M28 16h16" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M12 16v6M36 16v6" stroke="currentColor" stroke-width="3"/></g><circle cx="24" cy="25" r="3" fill="#4dff9d"/><path d="M20 33l-3 8M28 33l3 8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
};

export const STAT_ICONS = {
  speed: S('<path d="M6 34a18 18 0 1 1 36 0" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M24 34 34 18" stroke="#ff8a1f" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="34" r="4" fill="currentColor"/>'),
  accel: S('<path d="M8 38 22 24 8 10M24 38 38 24 24 10" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
  handling: S('<path d="M8 12c10 0 12 24 22 24h10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M34 28l8 8-8 8" fill="none" stroke="#ff8a1f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
  stability: S('<path d="M24 6 8 14v10c0 9 7 15 16 18 9-3 16-9 16-18V14z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M16 26h16" stroke="#ff8a1f" stroke-width="5" stroke-linecap="round"/>'),
  boost: S('<path d="M28 4 10 27h11l-3 17 20-25H27z" fill="currentColor"/>'),
  armor: S('<path d="M24 4 8 10v14c0 10 7 16 16 20 9-4 16-10 16-20V10z" fill="currentColor"/><path d="M24 12v26" stroke="#0b1530" stroke-width="3" opacity=".4"/>'),
};

export const MISC = {
  plane: S('<path d="M3 30 24 6l21 24-10-3-11 15-11-15z" fill="currentColor"/><path d="M24 6v36" stroke="#0b1530" stroke-width="2" opacity=".3"/>'),
  heart: S('<path d="M24 42 8 26a9 9 0 0 1 16-9 9 9 0 0 1 16 9z" fill="currentColor"/>'),
  gear: S('<circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" stroke-width="5"/><path d="M24 4v7M24 37v7M4 24h7M37 24h7M10 10l5 5M33 33l5 5M38 10l-5 5M15 33l-5 5" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'),
  pad: S('<path d="M12 14h24c5 0 8 5 9 12l1 8c0 3-3 4-5 2l-5-6H12l-5 6c-2 2-5 1-5-2l1-8c1-7 4-12 9-12z" fill="currentColor"/><path d="M14 20v6M11 23h6" stroke="#0b1530" stroke-width="3"/><circle cx="33" cy="21" r="2" fill="#0b1530"/><circle cx="37" cy="25" r="2" fill="#0b1530"/>'),
  star: S('<path d="m24 4 6 13 14 2-10 10 3 14-13-7-13 7 3-14L4 19l14-2z" fill="currentColor"/>'),
  starEmpty: S('<path d="m24 4 6 13 14 2-10 10 3 14-13-7-13 7 3-14L4 19l14-2z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" opacity=".5"/>'),
  clock: S('<circle cx="24" cy="25" r="17" fill="none" stroke="currentColor" stroke-width="5"/><path d="M24 14v12l8 5" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M18 4h12" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'),
  flag: S('<path d="M10 6v38" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M10 8h28l-6 8 6 8H10z" fill="currentColor"/>'),
  arrow: S('<path d="M10 24h26M26 12l12 12-12 12" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
  warn: S('<path d="M24 5 3 43h42z" fill="currentColor"/><path d="M24 17v13" stroke="#0b1530" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="36" r="3" fill="#0b1530"/>'),
};

const medal = (c1, c2, n) => S(`<path d="M14 3h8l4 14h-8zM34 3h-8l-4 14h8z" fill="#ff3d9a"/><circle cx="24" cy="30" r="14" fill="${c1}"/><circle cx="24" cy="30" r="10" fill="none" stroke="${c2}" stroke-width="3"/><text x="24" y="36" text-anchor="middle" font-family="Arial Black,Impact,sans-serif" font-size="16" font-weight="900" fill="${c2}">${n}</text>`);
export const MEDALS = [medal('#ffd02e', '#a86a00', 1), medal('#d5dde8', '#5d6b80', 2), medal('#e39a5a', '#7a3f12', 3)];
export const TROPHY = S('<path d="M12 6h24v12a12 12 0 0 1-24 0z" fill="currentColor"/><path d="M12 10H5c0 8 3 13 9 14M36 10h7c0 8-3 13-9 14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 30v8M15 43h18l-2-5H17z" fill="currentColor"/><path d="M17 9v9a7 7 0 0 0 4 6" stroke="#fff" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>');

export function icon(svg, cls = '') { const s = document.createElement('span'); s.className = 'ico ' + cls; s.innerHTML = svg; return s; }
