/* ============================================================
   BARCELONA · SVG art — cartoon avatars, venue scenes, icons.
   All hand-built inline SVG (no external images). Each avatar
   fuses a Catalan/Spanish archetype with a GLaDOS optic eye.
   ============================================================ */
window.ART = (function () {

  // ---- small icons ----
  const apertureEye = (c1 = '#ff9d2f', c2 = '#ffe1ad') => `
  <svg viewBox="0 0 100 100" class="aperture-eye" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill="none" stroke="${c1}" stroke-width="4" opacity=".5"/>
    <g fill="none" stroke="${c1}" stroke-width="6" stroke-linecap="round">
      ${Array.from({length:8}).map((_,i)=>{const a=i*45*Math.PI/180;const x1=50+22*Math.cos(a),y1=50+22*Math.sin(a),x2=50+38*Math.cos(a+0.5),y2=50+38*Math.sin(a+0.5);return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A 40 40 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`}).join('')}
    </g>
    <circle cx="50" cy="50" r="16" fill="${c2}"/>
    <circle cx="50" cy="50" r="16" fill="none" stroke="${c1}" stroke-width="3"/>
    <circle cx="50" cy="50" r="6" fill="#0a0c11"/>
  </svg>`;

  const icons = {
    metro: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C7 2 4 3 4 7v7a4 4 0 0 0 4 4l-2 3h2l2-3h4l2 3h2l-2-3a4 4 0 0 0 4-4V7c0-4-3-5-8-5Zm-5 4h4v4H7V6Zm6 0h4v4h-4V6Zm-4.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    ticket: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z"/><path d="M14 6v12" stroke-dasharray="2 2"/></svg>`,
    spire: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1c-1 3-1 5-1 7-2 1-3 3-3 6v9h8v-9c0-3-1-5-3-6 0-2 0-4-1-7Z"/><circle cx="12" cy="3.5" r="1.2"/></svg>`,
    fish: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 12c3-5 9-6 13-4l4-3-1 5 1 5-4-3c-4 2-10 1-13-5Z"/><circle cx="9" cy="11" r="1.2" fill="#0a0c11"/></svg>`,
    ship: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2v4M8 6h8l1 5H7l1-5ZM3 13h18l-2 6a3 3 0 0 1-3 2H8a3 3 0 0 1-3-2l-2-6Z"/></svg>`,
  };

  // ---- helpers ----
  const tile = (x,y,w,h,f,r=2,rot=0) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}" transform="rotate(${rot} ${x+w/2} ${y+h/2})"/>`;

  // ================= AVATARS (200x200) =================

  // GLADÍS — Gaudí modernista genius reborn as an Aperture AI host.
  const glados = `
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GLADÍS avatar">
    <defs>
      <radialGradient id="g_face" cx="50%" cy="42%" r="65%">
        <stop offset="0%" stop-color="#f4a678"/><stop offset="60%" stop-color="#e2725b"/><stop offset="100%" stop-color="#b24a38"/>
      </radialGradient>
      <linearGradient id="g_crown" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffe08a"/><stop offset="100%" stop-color="#f2c14e"/>
      </linearGradient>
      <radialGradient id="g_eye" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff4d6"/><stop offset="45%" stop-color="#ff9d2f"/><stop offset="100%" stop-color="#c85a12"/>
      </radialGradient>
    </defs>
    <!-- spire crown -->
    <g fill="url(#g_crown)" stroke="#b98a1f" stroke-width="1">
      <path d="M100 8c-4 10-4 18-4 26h8c0-8 0-16-4-26Z"/>
      <path d="M74 24c-3 8-3 14-3 22h6c0-8 0-14-3-22Z"/>
      <path d="M126 24c-3 8-3 14-3 22h6c0-8 0-14-3-22Z"/>
    </g>
    <circle cx="100" cy="8" r="2.6" fill="#fff2c0"/>
    <!-- head chassis (organic Gaudí curve) -->
    <path d="M100 40C58 40 44 74 46 108c2 34 24 54 54 54s52-20 54-54c2-34-12-68-54-68Z" fill="url(#g_face)" stroke="#8f3a2c" stroke-width="2"/>
    <!-- trencadís shards -->
    <g opacity=".85">
      ${tile(58,66,13,11,'#2fb8a8',3,-12)}${tile(74,60,12,12,'#4bb3e6',3,8)}${tile(120,58,13,11,'#f2c14e',3,-6)}
      ${tile(134,70,11,12,'#e86a92',3,14)}${tile(52,96,12,12,'#9b6dd6',3,10)}${tile(140,100,12,11,'#7cb342',3,-10)}
      ${tile(60,128,12,11,'#4bb3e6',3,-8)}${tile(130,130,12,12,'#2fb8a8',3,12)}
    </g>
    <!-- single optic eye -->
    <ellipse cx="100" cy="104" rx="34" ry="27" fill="#141017"/>
    <ellipse cx="100" cy="104" rx="34" ry="27" fill="none" stroke="#f2c14e" stroke-width="3"/>
    <circle cx="100" cy="104" r="17" fill="url(#g_eye)"/>
    <circle cx="100" cy="104" r="17" fill="none" stroke="#7a3a10" stroke-width="2"/>
    <circle cx="100" cy="104" r="6" fill="#1a0e06"/>
    <circle cx="93" cy="97" r="4" fill="#fff" opacity=".9"/>
    <!-- little chin light -->
    <circle cx="100" cy="150" r="4" fill="#ff9d2f"><animate attributeName="opacity" values="1;.3;1" dur="2.4s" repeatCount="indefinite"/></circle>
  </svg>`;

  // SAGRADA — trencadís mosaic / stained-glass muse.
  const sagrada = `
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trencadís muse avatar">
    <defs>
      <linearGradient id="s_face" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#eaf3fb"/><stop offset="100%" stop-color="#cfe0ef"/>
      </linearGradient>
      <radialGradient id="s_eye" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="#4bb3e6"/><stop offset="100%" stop-color="#e86a92"/>
      </radialGradient>
    </defs>
    <!-- spire halo -->
    <g stroke="#f2c14e" stroke-width="3" fill="none" opacity=".9">
      <path d="M100 12c-6 8-9 16-9 24"/><path d="M100 12c6 8 9 16 9 24"/>
      <path d="M72 20c-3 8-4 14-4 20"/><path d="M128 20c3 8 4 14 4 20"/>
    </g>
    <circle cx="100" cy="12" r="3" fill="#ffe08a"/>
    <!-- face -->
    <path d="M100 42C64 42 52 74 54 106c2 32 22 52 46 52s44-20 46-52c2-32-10-64-46-64Z" fill="url(#s_face)" stroke="#9fb6ca" stroke-width="2"/>
    <!-- mosaic tiles across cheeks -->
    <g opacity=".95">
      ${tile(60,70,12,12,'#e86a92',2,-10)}${tile(74,64,11,11,'#f2c14e',2,8)}${tile(118,64,11,11,'#2fb8a8',2,-8)}
      ${tile(132,72,12,11,'#9b6dd6',2,12)}${tile(56,100,11,11,'#7cb342',2,10)}${tile(135,104,11,11,'#4bb3e6',2,-12)}
      ${tile(64,130,11,11,'#f2c14e',2,-6)}${tile(126,132,11,11,'#e86a92',2,10)}${tile(96,142,12,12,'#2fb8a8',2,0)}
    </g>
    <!-- stained-glass eyes -->
    <g>
      <ellipse cx="82" cy="100" rx="13" ry="15" fill="url(#s_eye)" stroke="#3a5568" stroke-width="2"/>
      <ellipse cx="118" cy="100" rx="13" ry="15" fill="url(#s_eye)" stroke="#3a5568" stroke-width="2"/>
      <circle cx="82" cy="100" r="4.5" fill="#1a2430"/><circle cx="118" cy="100" r="4.5" fill="#1a2430"/>
      <circle cx="79" cy="96" r="2.5" fill="#fff"/><circle cx="115" cy="96" r="2.5" fill="#fff"/>
    </g>
    <path d="M90 126q10 8 20 0" fill="none" stroke="#c98aa2" stroke-width="3" stroke-linecap="round"/>
  </svg>`;

  // SIRENA — Mediterranean siren / mermaid submerged AI.
  const sirena = `
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Siren avatar">
    <defs>
      <linearGradient id="m_face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7fe3d6"/><stop offset="100%" stop-color="#2fb8a8"/>
      </linearGradient>
      <linearGradient id="m_hair" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#37c1ff"/><stop offset="100%" stop-color="#1f6ea8"/>
      </linearGradient>
      <radialGradient id="m_eye" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#eafcff"/><stop offset="55%" stop-color="#37c1ff"/><stop offset="100%" stop-color="#1a6aa0"/>
      </radialGradient>
    </defs>
    <!-- flowing hair -->
    <path d="M100 40C58 40 40 66 44 104c-16 6-24 22-18 40 8-10 16-12 24-10-4 12 0 22 8 30 2-16 10-24 20-26 8 20 20 20 22 0 10 2 18 10 20 26 8-8 12-18 8-30 8-2 16 0 24 10 6-18-2-34-18-40 4-38-14-64-56-64Z" fill="url(#m_hair)"/>
    <!-- bubbles -->
    <g fill="#bff1ff" opacity=".7"><circle cx="46" cy="52" r="4"/><circle cx="158" cy="60" r="5"/><circle cx="40" cy="150" r="3"/><circle cx="164" cy="140" r="4"/></g>
    <!-- face -->
    <path d="M100 54C72 54 60 78 62 104c2 26 18 44 38 44s36-18 38-44c2-26-10-50-38-50Z" fill="url(#m_face)" stroke="#1c8577" stroke-width="2"/>
    <!-- scales on cheeks -->
    <g fill="#5fd0c2" opacity=".7">
      <path d="M70 118a6 6 0 0 1 12 0 6 6 0 0 1-12 0Z"/><path d="M84 124a6 6 0 0 1 12 0 6 6 0 0 1-12 0Z"/>
      <path d="M118 118a6 6 0 0 1 12 0 6 6 0 0 1-12 0Z"/><path d="M104 124a6 6 0 0 1 12 0 6 6 0 0 1-12 0Z"/>
    </g>
    <!-- eyes (one optic) -->
    <ellipse cx="84" cy="98" rx="11" ry="13" fill="#0d2a2a"/>
    <circle cx="84" cy="98" r="6.5" fill="url(#m_eye)"/><circle cx="82" cy="95" r="2" fill="#fff"/>
    <ellipse cx="116" cy="98" rx="13" ry="15" fill="#0d2a2a" stroke="#37c1ff" stroke-width="2"/>
    <circle cx="116" cy="98" r="7.5" fill="url(#m_eye)"/><circle cx="116" cy="98" r="2.6" fill="#04121a"/>
    <path d="M90 122q10 7 20 0" fill="none" stroke="#136a5f" stroke-width="3" stroke-linecap="round"/>
    <!-- coral crown -->
    <path d="M100 40c-3 6-3 10-3 14h6c0-4 0-8-3-14Z" fill="#ff8fa3"/>
  </svg>`;

  // CAPITÀ — grizzled old Catalan sea captain (echoes of Columbus).
  const capita = `
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sea captain avatar">
    <defs>
      <linearGradient id="c_cap" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2b4c78"/><stop offset="100%" stop-color="#16283f"/>
      </linearGradient>
      <linearGradient id="c_face" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e6b48c"/><stop offset="100%" stop-color="#c78a5f"/>
      </linearGradient>
      <radialGradient id="c_eye" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff3d0"/><stop offset="50%" stop-color="#f2c14e"/><stop offset="100%" stop-color="#a5761a"/>
      </radialGradient>
    </defs>
    <!-- face -->
    <path d="M100 54C74 54 62 74 64 100c1 14 6 24 12 30 4 14 12 22 24 22s20-8 24-22c6-6 11-16 12-30 2-26-10-46-36-46Z" fill="url(#c_face)" stroke="#9c6a44" stroke-width="2"/>
    <!-- beard -->
    <path d="M70 116c2 22 12 40 30 40s28-18 30-40c-8 8-18 12-30 12s-22-4-30-12Z" fill="#e9edf2"/>
    <path d="M70 116c2 22 12 40 30 40s28-18 30-40" fill="none" stroke="#c9d2db" stroke-width="1.5"/>
    <!-- moustache -->
    <path d="M82 118q18 10 36 0" fill="none" stroke="#e9edf2" stroke-width="8" stroke-linecap="round"/>
    <!-- cap -->
    <path d="M60 78c0-20 18-32 40-32s40 12 40 32Z" fill="url(#c_cap)"/>
    <rect x="56" y="76" width="88" height="12" rx="4" fill="#0f1d2f"/>
    <rect x="52" y="86" width="96" height="9" rx="4" fill="#1b1b1b"/>
    <!-- cap badge: anchor + aperture ring -->
    <circle cx="100" cy="66" r="10" fill="#f2c14e"/>
    <path d="M100 60v10M96 64h8M100 70c-3 0-5-2-5-4M100 70c3 0 5-2 5-4" stroke="#16283f" stroke-width="1.6" fill="none"/>
    <!-- eyes: left human, right brass optic (telescope) -->
    <circle cx="86" cy="98" r="5" fill="#3a2a1a"/><circle cx="84.5" cy="96" r="1.6" fill="#fff"/>
    <g>
      <circle cx="116" cy="98" r="12" fill="#12324f"/>
      <circle cx="116" cy="98" r="12" fill="none" stroke="#f2c14e" stroke-width="2.5"/>
      <circle cx="116" cy="98" r="6" fill="url(#c_eye)"/><circle cx="116" cy="98" r="2.4" fill="#0a0c11"/>
      <rect x="126" y="94" width="10" height="8" rx="2" fill="#b8862a"/>
    </g>
    <path d="M78 88q8-4 14 0" fill="none" stroke="#e9edf2" stroke-width="3" stroke-linecap="round"/>
  </svg>`;

  const avatars = { glados, sagrada, sirena, capita };

  // ================= VENUE SCENES (wide) =================

  const scene_sagrada = `
  <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a2540"/><stop offset="100%" stop-color="#3a2c4a"/></linearGradient>
      <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d9c39a"/><stop offset="100%" stop-color="#a98b5e"/></linearGradient>
      <radialGradient id="sun1" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffe6a8"/><stop offset="100%" stop-color="#ffb85c" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="400" height="300" fill="url(#sky1)"/>
    <circle cx="320" cy="70" r="80" fill="url(#sun1)"/>
    <g fill="url(#stone)" stroke="#7d643d" stroke-width="1">
      ${[70,120,200,280,330].map((x,i)=>{const h=[150,210,250,205,150][i];const w=[26,30,40,30,26][i];return `<path d="M${x-w/2} 300 L${x-w/2+4} ${300-h} Q${x} ${300-h-34} ${x+w/2-4} ${300-h} L${x+w/2} 300Z"/><circle cx="${x}" cy="${300-h-30}" r="6" fill="#f2c14e"/>`}).join('')}
    </g>
    <!-- stained glass window -->
    <g transform="translate(200,190)">
      <ellipse rx="34" ry="46" fill="#0f1524" stroke="#7d643d" stroke-width="3"/>
      ${['#e86a92','#4bb3e6','#f2c14e','#2fb8a8','#9b6dd6','#7cb342'].map((c,i)=>`<path d="M0 0 L${(20*Math.cos(i*Math.PI/3)).toFixed(1)} ${(30*Math.sin(i*Math.PI/3)).toFixed(1)} A34 46 0 0 1 ${(20*Math.cos((i+1)*Math.PI/3)).toFixed(1)} ${(30*Math.sin((i+1)*Math.PI/3)).toFixed(1)} Z" fill="${c}" opacity=".85"/>`).join('')}
    </g>
    <rect y="272" width="400" height="28" fill="#0e1220"/>
  </svg>`;

  const scene_aquarium = `
  <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0e5b7a"/><stop offset="100%" stop-color="#052235"/></linearGradient>
      <radialGradient id="glow2" cx="50%" cy="0%" r="80%"><stop offset="0%" stop-color="#5fd8ff" stop-opacity=".5"/><stop offset="100%" stop-color="#5fd8ff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="400" height="300" fill="url(#water)"/>
    <rect width="400" height="300" fill="url(#glow2)"/>
    <!-- caustic rays -->
    <g stroke="#7fe3ff" stroke-width="10" opacity=".12"><path d="M60 -20 L120 320"/><path d="M180 -20 L150 320"/><path d="M300 -20 L340 320"/></g>
    <!-- tunnel arch -->
    <path d="M40 300 Q200 90 360 300" fill="none" stroke="#8fd6ff" stroke-width="4" opacity=".5"/>
    <path d="M70 300 Q200 130 330 300" fill="none" stroke="#8fd6ff" stroke-width="2" opacity=".35"/>
    <!-- shark -->
    <g transform="translate(210,150)" fill="#cfe6f0">
      <path d="M-60 0 Q-20 -26 40 -8 Q66 -2 78 6 Q60 8 40 8 Q-20 24 -60 0Z"/>
      <path d="M4 -16 L18 -40 L26 -14Z"/><path d="M-40 6 L-58 22 L-30 12Z"/>
      <circle cx="52" cy="-2" r="2.6" fill="#04121a"/>
      <path d="M56 6 q10 2 16 -2" stroke="#7fa6b8" stroke-width="1.5" fill="none"/>
    </g>
    <!-- fish -->
    <g fill="#ffd27f">${[[90,80],[300,110],[120,220],[330,200],[60,140]].map(([x,y],i)=>`<g transform="translate(${x},${y})"><path d="M0 0 Q10 -6 20 0 Q10 6 0 0Z"/><path d="M20 0 l6 -4 v8Z"/></g>`).join('')}</g>
    <!-- corals -->
    <g fill="#ff7f9c"><path d="M20 300c0-30 6-42 2-60 8 14 14 20 24 22-12 6-14 20-14 38Z"/><path d="M360 300c0-24 8-34 4-52 8 12 16 16 24 18-14 6-16 18-16 34Z"/></g>
    <g fill="#7cf0c8"><path d="M330 300c-2-40 6-56 0-78 6 24 12 30 20 34-14 8-12 24-8 44Z" opacity=".8"/></g>
  </svg>`;

  const scene_cruise = `
  <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#243a5e"/><stop offset="55%" stop-color="#c98a6b"/><stop offset="100%" stop-color="#f2c14e"/></linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a6a8a"/><stop offset="100%" stop-color="#123246"/></linearGradient>
    </defs>
    <rect width="400" height="180" fill="url(#dawn)"/>
    <circle cx="200" cy="150" r="46" fill="#fff3c4" opacity=".85"/>
    <rect y="176" width="400" height="124" fill="url(#sea)"/>
    <g stroke="#bfe0ef" stroke-width="1" opacity=".25"><path d="M0 210 H400"/><path d="M0 240 H400"/><path d="M0 270 H400"/></g>
    <!-- Columbus column -->
    <g transform="translate(56,0)">
      <rect x="-6" y="70" width="12" height="106" fill="#2c3038"/>
      <rect x="-14" y="166" width="28" height="14" fill="#3a3f48"/>
      <circle cx="0" cy="62" r="9" fill="#4a5058"/>
      <circle cx="0" cy="52" r="3.5" fill="#f2c14e"/>
    </g>
    <!-- cruise ship -->
    <g transform="translate(150,120)">
      <path d="M0 56 H196 L182 84 H16 Z" fill="#e9eef4"/>
      <rect x="14" y="30" width="168" height="26" fill="#fff"/>
      <rect x="14" y="14" width="140" height="16" fill="#f2f5f9"/>
      <g fill="#37c1ff">${Array.from({length:22}).map((_,i)=>`<rect x="${20+i*7}" y="${36}" width="4" height="6" rx="1"/>`).join('')}${Array.from({length:18}).map((_,i)=>`<rect x="${20+i*7}" y="${18}" width="4" height="6" rx="1"/>`).join('')}</g>
      <rect x="60" y="-6" width="16" height="22" rx="3" fill="#e2725b"/>
      <rect x="96" y="-6" width="16" height="22" rx="3" fill="#e2725b"/>
      <path d="M0 56 H196" stroke="#37c1ff" stroke-width="2"/>
    </g>
    <!-- reflection -->
    <g transform="translate(150,120)" opacity=".2"><path d="M16 84 H182 L166 104 H32Z" fill="#e9eef4"/></g>
    <!-- gulls -->
    <g stroke="#eef2f8" stroke-width="2" fill="none" opacity=".7"><path d="M300 50 q6 -6 12 0 q6 -6 12 0"/><path d="M330 74 q5 -5 10 0 q5 -5 10 0"/></g>
  </svg>`;

  const scenes = { sagrada: scene_sagrada, aquarium: scene_aquarium, cruise: scene_cruise };

  return { apertureEye, icons, avatars, scenes };
})();
