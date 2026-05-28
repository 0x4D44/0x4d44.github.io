// SVG diagrams for the Physical & Encoding deep-dive section
// Reads from CSS custom properties to stay on-palette.

const DIAGRAMS = {
  // ── Flux & ST-506 ─────────────────────────────────────────────────────
  flux: `
<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMid meet">
  <!-- title -->
  <text x="20" y="22" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#9a9da6" text-transform="uppercase">FLUX → PULSE → DELTA</text>

  <!-- magnetic-polarity strip -->
  <g transform="translate(20,42)">
    <text x="0" y="-4" font-family="JetBrains Mono" font-size="10" fill="#5d6068">platter polarity</text>
    <!-- alternating N/S regions -->
    <rect x="0"  y="0" width="60" height="22" fill="#1c1f26" stroke="#2a2e38"/>
    <rect x="60" y="0" width="40" height="22" fill="#232730" stroke="#2a2e38"/>
    <rect x="100" y="0" width="80" height="22" fill="#1c1f26" stroke="#2a2e38"/>
    <rect x="180" y="0" width="40" height="22" fill="#232730" stroke="#2a2e38"/>
    <rect x="220" y="0" width="100" height="22" fill="#1c1f26" stroke="#2a2e38"/>
    <rect x="320" y="0" width="60" height="22" fill="#232730" stroke="#2a2e38"/>
    <rect x="380" y="0" width="40" height="22" fill="#1c1f26" stroke="#2a2e38"/>
    <rect x="420" y="0" width="80" height="22" fill="#232730" stroke="#2a2e38"/>
    <rect x="500" y="0" width="100" height="22" fill="#1c1f26" stroke="#2a2e38"/>
    <text x="20"  y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">N</text>
    <text x="80"  y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">S</text>
    <text x="140" y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">N</text>
    <text x="200" y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">S</text>
    <text x="270" y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">N</text>
    <text x="350" y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">S</text>
    <text x="400" y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">N</text>
    <text x="460" y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">S</text>
    <text x="550" y="14" font-family="JetBrains Mono" font-size="11" fill="#5d6068" text-anchor="middle">N</text>
  </g>

  <!-- analog head signal: small spikes at each boundary -->
  <g transform="translate(20,100)">
    <text x="0" y="-4" font-family="JetBrains Mono" font-size="10" fill="#5d6068">head EMF (analog)</text>
    <line x1="0" y1="20" x2="600" y2="20" stroke="#2a2e38" stroke-dasharray="2,3"/>
    <path d="M 0,20
             L 55,20 Q 60,5  65,20  T 95,20
             Q 100,35 105,20
             L 175,20 Q 180,5 185,20
             Q 215,35 220,20
             L 315,20 Q 320,5 325,20
             Q 375,35 380,20
             Q 415,5 420,20
             Q 495,35 500,20
             L 600,20"
          fill="none" stroke="#e0a85a" stroke-width="1.4" opacity="0.85"/>
  </g>

  <!-- ST-506 RDATA pulse train -->
  <g transform="translate(20,165)">
    <text x="0" y="-4" font-family="JetBrains Mono" font-size="10" fill="#5d6068">ST-506 RDATA pulse train (digital)</text>
    <line x1="0" y1="24" x2="600" y2="24" stroke="#2a2e38"/>
    <!-- 1px-wide pulses at transition points -->
    <g stroke="#7dbf8e" stroke-width="1.5" fill="none">
      <path d="M0,24 L60,24 L60,4 L62,4 L62,24 L100,24 L100,4 L102,4 L102,24 L180,24 L180,4 L182,4 L182,24 L220,24 L220,4 L222,4 L222,24 L320,24 L320,4 L322,4 L322,24 L380,24 L380,4 L382,4 L382,24 L420,24 L420,4 L422,4 L422,24 L500,24 L500,4 L502,4 L502,24 L600,24"/>
    </g>
  </g>

  <!-- delta annotations -->
  <g transform="translate(20,210)" font-family="JetBrains Mono" font-size="10" fill="#e0a85a">
    <line x1="62" y1="0" x2="100" y2="0" stroke="#e0a85a"/>
    <text x="81" y="-3" text-anchor="middle">Δt=40</text>
    <line x1="102" y1="0" x2="180" y2="0" stroke="#e0a85a"/>
    <text x="141" y="-3" text-anchor="middle">Δt=80</text>
    <line x1="182" y1="0" x2="220" y2="0" stroke="#e0a85a"/>
    <text x="201" y="-3" text-anchor="middle">40</text>
    <line x1="222" y1="0" x2="320" y2="0" stroke="#e0a85a"/>
    <text x="271" y="-3" text-anchor="middle">100</text>
    <line x1="322" y1="0" x2="380" y2="0" stroke="#e0a85a"/>
    <text x="351" y="-3" text-anchor="middle">60</text>
    <line x1="382" y1="0" x2="420" y2="0" stroke="#e0a85a"/>
    <text x="401" y="-3" text-anchor="middle">40</text>
    <line x1="422" y1="0" x2="500" y2="0" stroke="#e0a85a"/>
    <text x="461" y="-3" text-anchor="middle">80</text>
  </g>
  <text x="20" y="232" font-family="JetBrains Mono" font-size="10" fill="#5d6068">↑ deltas, in 5ns ticks @ 200 MHz — this is what .tr files store</text>

  <!-- block diagram -->
  <g transform="translate(20,265)" font-family="JetBrains Mono" font-size="10">
    <rect x="0"   y="0" width="80" height="50" fill="#14161b" stroke="#2a2e38"/>
    <text x="40"  y="22" fill="#e8e6df" text-anchor="middle">PLATTER</text>
    <text x="40"  y="36" fill="#5d6068" text-anchor="middle">magnetic</text>

    <rect x="110" y="0" width="80" height="50" fill="#14161b" stroke="#2a2e38"/>
    <text x="150" y="22" fill="#e8e6df" text-anchor="middle">HEAD</text>
    <text x="150" y="36" fill="#5d6068" text-anchor="middle">inductive</text>

    <rect x="220" y="0" width="120" height="50" fill="#14161b" stroke="#2a2e38"/>
    <text x="280" y="22" fill="#e8e6df" text-anchor="middle">DRIVE</text>
    <text x="280" y="36" fill="#5d6068" text-anchor="middle">amp + peak detect</text>

    <rect x="360" y="0" width="120" height="50" fill="#14161b" stroke="#e0a85a"/>
    <text x="420" y="22" fill="#e0a85a" text-anchor="middle">CONTROLLER</text>
    <text x="420" y="36" fill="#5d6068" text-anchor="middle">decode + framing</text>

    <rect x="500" y="0" width="100" height="50" fill="#14161b" stroke="#2a2e38" stroke-dasharray="3,3"/>
    <text x="550" y="22" fill="#9a9da6" text-anchor="middle">.tr capture</text>
    <text x="550" y="36" fill="#5d6068" text-anchor="middle">(in mdrll's place)</text>

    <g stroke="#5d6068" fill="none" stroke-width="1">
      <path d="M80,25 L110,25" marker-end="url(#arrow)"/>
      <path d="M190,25 L220,25" marker-end="url(#arrow)"/>
      <path d="M340,25 L360,25" marker-end="url(#arrow)"/>
    </g>
    <g stroke="#7dbf8e" fill="none" stroke-width="1.5">
      <path d="M340,38 C 360,38 360,38 360,38" />
    </g>
    <text x="350" y="50" font-size="9" fill="#7dbf8e" text-anchor="middle">RDATA</text>
  </g>

  <defs>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 z" fill="#5d6068"/>
    </marker>
  </defs>
</svg>
  `,

  // ── MFM rules ─────────────────────────────────────────────────────────
  mfm: `
<svg viewBox="0 0 640 320" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMid meet">
  <text x="20" y="22" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#9a9da6">MFM ENCODING OF "0 1 1 0 1 0 0 1"</text>

  <!-- data bits row -->
  <g transform="translate(40,50)" font-family="JetBrains Mono" font-size="14">
    <text x="-22" y="14" fill="#5d6068" font-size="10">data</text>
    <g fill="#e8e6df">
      <text x="35"  y="14" text-anchor="middle">0</text>
      <text x="105" y="14" text-anchor="middle">1</text>
      <text x="175" y="14" text-anchor="middle">1</text>
      <text x="245" y="14" text-anchor="middle">0</text>
      <text x="315" y="14" text-anchor="middle">1</text>
      <text x="385" y="14" text-anchor="middle">0</text>
      <text x="455" y="14" text-anchor="middle">0</text>
      <text x="525" y="14" text-anchor="middle">1</text>
    </g>
  </g>

  <!-- bit cells with C and D slots -->
  <g transform="translate(40,80)" font-family="JetBrains Mono" font-size="9">
    <text x="-22" y="14" fill="#5d6068">cells</text>
    <!-- 8 cells × 70px each, each with C and D slots -->
    ${Array.from({length: 8}, (_, i) => {
      const x = i * 70;
      return `
        <rect x="${x}"     y="0" width="35" height="48" fill="#14161b" stroke="#2a2e38"/>
        <rect x="${x + 35}" y="0" width="35" height="48" fill="#1c1f26" stroke="#2a2e38"/>
        <text x="${x + 17}"  y="40" fill="#5d6068" text-anchor="middle">C</text>
        <text x="${x + 52}" y="40" fill="#5d6068" text-anchor="middle">D</text>
      `;
    }).join('')}
  </g>

  <!-- transitions per the MFM rule -->
  <!-- data: 0 1 1 0 1 0 0 1 -->
  <!-- prev: - 0 1 1 0 1 0 0 -->
  <!-- D-transition when data=1: cells 1, 2, 4, 7 -->
  <!-- C-transition when data=0 AND prev=0: cells 0 (no prev, treat 0), 5, 6 -->
  <g transform="translate(40,80)" stroke="#e0a85a" stroke-width="2">
    <!-- cell 0 (data=0, no prev): no transition (cold start) -->
    <!-- cell 1 (data=1): D-transition at x=87 (35 + 52) -->
    <line x1="87" y1="0" x2="87" y2="48"/>
    <!-- cell 2 (data=1): D-transition at x=157 -->
    <line x1="157" y1="0" x2="157" y2="48"/>
    <!-- cell 3 (data=0, prev=1): no transition -->
    <!-- cell 4 (data=1, prev=0): D-transition at x=297 -->
    <line x1="297" y1="0" x2="297" y2="48"/>
    <!-- cell 5 (data=0, prev=1): no transition -->
    <!-- cell 6 (data=0, prev=0): C-transition at x=420 -->
    <line x1="420" y1="0" x2="420" y2="48"/>
    <!-- cell 7 (data=1, prev=0): D-transition at x=507 -->
    <line x1="507" y1="0" x2="507" y2="48"/>
  </g>

  <!-- inter-transition spacings -->
  <g transform="translate(40,140)" font-family="JetBrains Mono" font-size="11" fill="#e0a85a">
    <line x1="87" y1="0" x2="157" y2="0" stroke="#e0a85a"/>
    <text x="122" y="-4" text-anchor="middle">2T</text>
    <line x1="157" y1="0" x2="297" y2="0" stroke="#e0a85a"/>
    <text x="227" y="-4" text-anchor="middle">4T</text>
    <line x1="297" y1="0" x2="420" y2="0" stroke="#e0a85a"/>
    <text x="358" y="-4" text-anchor="middle">3.5T → 3T+gap</text>
    <line x1="420" y1="0" x2="507" y2="0" stroke="#e0a85a"/>
    <text x="463" y="-4" text-anchor="middle">2.5T → 2T+gap</text>
  </g>

  <!-- rule callout -->
  <g transform="translate(20,200)">
    <rect x="0" y="0" width="600" height="100" fill="#0a0b0e" stroke="#2a2e38"/>
    <text x="14" y="22" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#e0a85a">THE MFM RULE</text>
    <text x="14" y="44" font-family="JetBrains Mono" font-size="12" fill="#e8e6df">
      <tspan>data bit = </tspan><tspan fill="#7dbf8e">1</tspan><tspan>   →  transition at </tspan><tspan fill="#e0a85a">D</tspan><tspan> slot (middle of cell)</tspan>
    </text>
    <text x="14" y="62" font-family="JetBrains Mono" font-size="12" fill="#e8e6df">
      <tspan>data bit = </tspan><tspan fill="#7dbf8e">0</tspan><tspan>, prev = </tspan><tspan fill="#7dbf8e">0</tspan><tspan>  →  transition at </tspan><tspan fill="#e0a85a">C</tspan><tspan> slot (cell boundary)</tspan>
    </text>
    <text x="14" y="80" font-family="JetBrains Mono" font-size="12" fill="#e8e6df">
      <tspan>data bit = </tspan><tspan fill="#7dbf8e">0</tspan><tspan>, prev = </tspan><tspan fill="#7dbf8e">1</tspan><tspan>  →  no transition (silence)</tspan>
    </text>
  </g>
</svg>
  `,

  // ── RLL 2,7 codebook + run constraint ─────────────────────────────────
  rll: `
<svg viewBox="0 0 640 380" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMid meet">
  <text x="20" y="22" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#9a9da6">RLL 2,7 — (d=2, k=7) RUN-LENGTH CONSTRAINT</text>

  <!-- constraint visualization -->
  <g transform="translate(20,50)" font-family="JetBrains Mono" font-size="11">
    <text x="0" y="-6" fill="#5d6068">Between any two 1s in the code stream:</text>

    <!-- min: 2 zeros -->
    <g transform="translate(0,8)">
      <text x="0" y="14" fill="#9a9da6" font-size="10">min</text>
      <g font-size="13">
        <text x="40"  y="16" fill="#e0a85a">1</text>
        <text x="60"  y="16" fill="#5d6068">0</text>
        <text x="80"  y="16" fill="#5d6068">0</text>
        <text x="100" y="16" fill="#e0a85a">1</text>
      </g>
      <line x1="48" y1="22" x2="108" y2="22" stroke="#7dbf8e"/>
      <text x="78" y="34" fill="#7dbf8e" font-size="10" text-anchor="middle">d = 2 zeros</text>
    </g>

    <!-- max: 7 zeros -->
    <g transform="translate(200,8)">
      <text x="0" y="14" fill="#9a9da6" font-size="10">max</text>
      <g font-size="13">
        <text x="40"  y="16" fill="#e0a85a">1</text>
        <text x="60"  y="16" fill="#5d6068">0</text>
        <text x="80"  y="16" fill="#5d6068">0</text>
        <text x="100" y="16" fill="#5d6068">0</text>
        <text x="120" y="16" fill="#5d6068">0</text>
        <text x="140" y="16" fill="#5d6068">0</text>
        <text x="160" y="16" fill="#5d6068">0</text>
        <text x="180" y="16" fill="#5d6068">0</text>
        <text x="200" y="16" fill="#e0a85a">1</text>
      </g>
      <line x1="48" y1="22" x2="208" y2="22" stroke="#d96453"/>
      <text x="128" y="34" fill="#d96453" font-size="10" text-anchor="middle">k = 7 zeros</text>
    </g>
  </g>

  <!-- codebook table -->
  <g transform="translate(20,120)" font-family="JetBrains Mono" font-size="12">
    <text x="0" y="-6" font-size="10" letter-spacing="0.14em" fill="#e0a85a">CODEBOOK</text>
    <rect x="0" y="0" width="600" height="216" fill="#0a0b0e" stroke="#2a2e38"/>

    <!-- header -->
    <text x="20"  y="22" fill="#9a9da6" font-size="10">data bits</text>
    <text x="160" y="22" fill="#9a9da6" font-size="10">→</text>
    <text x="200" y="22" fill="#9a9da6" font-size="10">code bits</text>
    <text x="430" y="22" fill="#9a9da6" font-size="10">transitions</text>
    <line x1="0" y1="32" x2="600" y2="32" stroke="#2a2e38"/>

    ${[
      ['10',   '0100',     '1'],
      ['11',   '1000',     '1'],
      ['000',  '000100',   '1'],
      ['010',  '100100',   '2'],
      ['011',  '001000',   '1'],
      ['0010', '00100100', '2'],
      ['0011', '00001000', '1']
    ].map((row, i) => {
      const y = 52 + i * 22;
      return `
        <text x="20"  y="${y}" fill="#e8e6df">${row[0]}</text>
        <text x="160" y="${y}" fill="#5d6068">→</text>
        <text x="200" y="${y}" fill="#e0a85a">${row[1]}</text>
        <text x="450" y="${y}" fill="#9a9da6">${row[2]}</text>
      `;
    }).join('')}
  </g>

  <!-- density comparison -->
  <g transform="translate(20,355)" font-family="JetBrains Mono" font-size="10" fill="#5d6068">
    <text x="0" y="0">↑ greedy left-to-right prefix match decodes uniquely (proven prefix-free)</text>
    <text x="0" y="14" fill="#7dbf8e">→ 1.5× data per flux transition vs MFM, at the same min spacing</text>
  </g>
</svg>
  `,

  // ── Sync mark — 0x4489 vs 0x44A9 ──────────────────────────────────────
  sync: `
<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMid meet">
  <text x="20" y="22" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#9a9da6">MFM ENCODING OF 0xA1 — DATA VS SYNC</text>

  <!-- byte value -->
  <text x="20" y="50" font-family="JetBrains Mono" font-size="13" fill="#e8e6df">
    <tspan fill="#5d6068">byte:</tspan>  <tspan fill="#e8e6df" font-weight="600">0xA1</tspan>  <tspan fill="#5d6068">= </tspan><tspan>1010 0001</tspan>
  </text>

  <!-- normal A1 -->
  <g transform="translate(20,80)">
    <text x="0" y="14" font-family="JetBrains Mono" font-size="11" fill="#9a9da6">DATA A1 — follows the MFM rule</text>
    <text x="0" y="34" font-family="JetBrains Mono" font-size="11" fill="#5d6068">encoded:</text>

    <!-- 16-bit pattern as a row of cells -->
    ${(() => {
      const bits = '0100010010101001'.split(''); // 0x44A9
      return bits.map((b, i) => {
        const x = 80 + i * 32;
        const isSet = b === '1';
        return `
          <rect x="${x}" y="22" width="30" height="22" fill="${isSet ? '#e0a85a' : '#14161b'}" stroke="#2a2e38"/>
          <text x="${x + 15}" y="38" font-family="JetBrains Mono" font-size="11" fill="${isSet ? '#0a0b0e' : '#9a9da6'}" text-anchor="middle" font-weight="${isSet ? 600 : 400}">${b}</text>
        `;
      }).join('');
    })()}

    <text x="80" y="62" font-family="JetBrains Mono" font-size="11" fill="#9a9da6">= </text>
    <text x="100" y="62" font-family="JetBrains Mono" font-size="11" fill="#e8e6df" font-weight="600">0x44A9</text>
    <text x="160" y="62" font-family="JetBrains Mono" font-size="10" fill="#5d6068">(valid MFM — could appear in any data byte)</text>
  </g>

  <!-- sync A1 -->
  <g transform="translate(20,180)">
    <text x="0" y="14" font-family="JetBrains Mono" font-size="11" fill="#e0a85a">SYNC A1 — clock bit C2 deliberately suppressed</text>
    <text x="0" y="34" font-family="JetBrains Mono" font-size="11" fill="#5d6068">encoded:</text>

    ${(() => {
      const bits = '0100010010001001'.split(''); // 0x4489
      const diffIdx = 9; // the bit that differs (was 1 in 0x44A9, now 0)
      return bits.map((b, i) => {
        const x = 80 + i * 32;
        const isSet = b === '1';
        const isDiff = i === diffIdx;
        const fill = isDiff ? '#d96453' : (isSet ? '#e0a85a' : '#14161b');
        const txtFill = isDiff ? '#e8e6df' : (isSet ? '#0a0b0e' : '#9a9da6');
        return `
          <rect x="${x}" y="22" width="30" height="22" fill="${fill}" stroke="${isDiff ? '#d96453' : '#2a2e38'}" stroke-width="${isDiff ? 1.5 : 1}"/>
          <text x="${x + 15}" y="38" font-family="JetBrains Mono" font-size="11" fill="${txtFill}" text-anchor="middle" font-weight="${(isSet || isDiff) ? 600 : 400}">${b}</text>
          ${isDiff ? `<text x="${x + 15}" y="60" font-family="JetBrains Mono" font-size="9" fill="#d96453" text-anchor="middle">↑ missing</text>` : ''}
        `;
      }).join('');
    })()}

    <text x="80" y="80" font-family="JetBrains Mono" font-size="11" fill="#9a9da6">= </text>
    <text x="100" y="80" font-family="JetBrains Mono" font-size="11" fill="#e0a85a" font-weight="600">0x4489</text>
    <text x="160" y="80" font-family="JetBrains Mono" font-size="10" fill="#5d6068">(rule violation — impossible in valid data)</text>
  </g>

  <!-- frame structure callout -->
  <g transform="translate(20,295)">
    <rect x="0" y="0" width="600" height="60" fill="#0a0b0e" stroke="#2a2e38"/>
    <text x="14" y="20" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#e0a85a">SECTOR FIELD START</text>
    <text x="14" y="42" font-family="JetBrains Mono" font-size="12" fill="#e8e6df">
      <tspan fill="#6b8dba">[0x4489] [0x4489] [0x4489]</tspan><tspan fill="#5d6068"> · </tspan><tspan fill="#e0a85a">[0xFE | 0xFB]</tspan><tspan fill="#5d6068"> · </tspan><tspan fill="#9a9da6">[ID body | data 512B]</tspan><tspan fill="#5d6068"> · </tspan><tspan fill="#e8e6df">[CRC]</tspan>
    </text>
  </g>
</svg>
  `,

  // ── CRC shift register ────────────────────────────────────────────────
  crc: `
<svg viewBox="0 0 640 320" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMid meet">
  <text x="20" y="22" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#9a9da6">CRC-16 / 0x1021 — POLYNOMIAL DIVISION AS A SHIFT REGISTER</text>

  <!-- polynomial expression -->
  <text x="20" y="56" font-family="JetBrains Mono" font-size="13" fill="#e8e6df">
    G(x) = <tspan fill="#e0a85a">x¹⁶ + x¹² + x⁵ + 1</tspan>
  </text>
  <text x="20" y="76" font-family="JetBrains Mono" font-size="11" fill="#5d6068">= 0x1021 (low 16 bits; x¹⁶ implied by register width)</text>

  <!-- 16-bit shift register diagram -->
  <g transform="translate(20,110)">
    <text x="0" y="-8" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#e0a85a">SHIFT REGISTER (16 BITS)</text>

    <!-- 16 cells -->
    ${Array.from({length: 16}, (_, i) => {
      const x = i * 36;
      const bitIdx = 15 - i;
      // XOR taps at bit positions 0, 5, 12 (from low) — and feedback at 15
      const isTap = [0, 5, 12].includes(bitIdx);
      return `
        <rect x="${x}" y="0" width="34" height="34" fill="${isTap ? '#1c1f26' : '#14161b'}" stroke="${isTap ? '#e0a85a' : '#2a2e38'}"/>
        <text x="${x + 17}" y="22" font-family="JetBrains Mono" font-size="11" fill="${isTap ? '#e0a85a' : '#9a9da6'}" text-anchor="middle">b${bitIdx}</text>
      `;
    }).join('')}

    <!-- feedback loop from bit 15 -->
    <g stroke="#7dbf8e" fill="none" stroke-width="1.4">
      <path d="M17,0 L17,-22 L580,-22 L580,17 L576,17" marker-end="url(#arr2)"/>
    </g>
    <text x="295" y="-28" font-family="JetBrains Mono" font-size="10" fill="#7dbf8e" text-anchor="middle">feedback (b15 XOR data_in)</text>

    <!-- XOR taps -->
    <g stroke="#e0a85a" fill="none">
      <circle cx="558" cy="50" r="6" fill="#0a0b0e" stroke="#e0a85a"/>
      <line x1="554" y1="50" x2="562" y2="50" stroke="#e0a85a"/>
      <line x1="558" y1="46" x2="558" y2="54" stroke="#e0a85a"/>
      <line x1="558" y1="34" x2="558" y2="44"/>

      <circle cx="378" cy="50" r="6" fill="#0a0b0e" stroke="#e0a85a"/>
      <line x1="374" y1="50" x2="382" y2="50" stroke="#e0a85a"/>
      <line x1="378" y1="46" x2="378" y2="54" stroke="#e0a85a"/>
      <line x1="378" y1="34" x2="378" y2="44"/>

      <circle cx="126" cy="50" r="6" fill="#0a0b0e" stroke="#e0a85a"/>
      <line x1="122" y1="50" x2="130" y2="50" stroke="#e0a85a"/>
      <line x1="126" y1="46" x2="126" y2="54" stroke="#e0a85a"/>
      <line x1="126" y1="34" x2="126" y2="44"/>
    </g>
    <text x="558" y="68" font-family="JetBrains Mono" font-size="9" fill="#e0a85a" text-anchor="middle">⊕ tap @ x⁰</text>
    <text x="378" y="68" font-family="JetBrains Mono" font-size="9" fill="#e0a85a" text-anchor="middle">⊕ tap @ x⁵</text>
    <text x="126" y="68" font-family="JetBrains Mono" font-size="9" fill="#e0a85a" text-anchor="middle">⊕ tap @ x¹²</text>

    <!-- data in arrow -->
    <g stroke="#9a9da6" fill="none">
      <path d="M600,17 L630,17" marker-end="url(#arr2)"/>
    </g>
    <text x="615" y="8" font-family="JetBrains Mono" font-size="10" fill="#9a9da6" text-anchor="middle">data</text>
  </g>

  <!-- bottom row: how it's used -->
  <g transform="translate(20,230)">
    <rect x="0" y="0" width="600" height="68" fill="#0a0b0e" stroke="#2a2e38"/>
    <text x="14" y="22" font-family="JetBrains Mono" font-size="11" fill="#e8e6df">
      write: <tspan fill="#5d6068">[ AM · ID body ]</tspan> → shift register → <tspan fill="#e0a85a">remainder = stored CRC</tspan>
    </text>
    <text x="14" y="42" font-family="JetBrains Mono" font-size="11" fill="#e8e6df">
      read:  <tspan fill="#5d6068">[ AM · ID body · CRC ]</tspan> → shift register → <tspan fill="#7dbf8e">remainder = 0  ✓ valid</tspan>
    </text>
    <text x="14" y="60" font-family="JetBrains Mono" font-size="10" fill="#5d6068">
      anything nonzero = corruption detected (but not corrected — that's ECC)
    </text>
  </g>

  <defs>
    <marker id="arr2" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 z" fill="#7dbf8e"/>
    </marker>
  </defs>
</svg>
  `,

  // ── ECC — sector frame with trailer ───────────────────────────────────
  ecc: `
<svg viewBox="0 0 640 340" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMid meet">
  <text x="20" y="22" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#9a9da6">SECTOR FRAME — WD1006V-SR2 (WITH 56-BIT ECC)</text>

  <!-- frame strip -->
  <g transform="translate(20,55)">
    <!-- sync -->
    <rect x="0" y="0" width="70" height="50" fill="#1c1f26" stroke="#6b8dba"/>
    <text x="35" y="22" font-family="JetBrains Mono" font-size="11" fill="#6b8dba" text-anchor="middle">3×A1</text>
    <text x="35" y="38" font-family="JetBrains Mono" font-size="9" fill="#5d6068" text-anchor="middle">sync</text>

    <!-- AM -->
    <rect x="70" y="0" width="40" height="50" fill="#1c1f26" stroke="#e0a85a"/>
    <text x="90" y="22" font-family="JetBrains Mono" font-size="11" fill="#e0a85a" text-anchor="middle">FB</text>
    <text x="90" y="38" font-family="JetBrains Mono" font-size="9" fill="#5d6068" text-anchor="middle">AM</text>

    <!-- data -->
    <rect x="110" y="0" width="320" height="50" fill="#14161b" stroke="#2a2e38"/>
    <text x="270" y="22" font-family="JetBrains Mono" font-size="11" fill="#e8e6df" text-anchor="middle">512 data bytes</text>
    <text x="270" y="38" font-family="JetBrains Mono" font-size="9" fill="#5d6068" text-anchor="middle">user payload</text>

    <!-- CRC -->
    <rect x="430" y="0" width="60" height="50" fill="#1c1f26" stroke="#e8e6df"/>
    <text x="460" y="22" font-family="JetBrains Mono" font-size="11" fill="#e8e6df" text-anchor="middle">CRC32</text>
    <text x="460" y="38" font-family="JetBrains Mono" font-size="9" fill="#5d6068" text-anchor="middle">4 bytes</text>

    <!-- ECC -->
    <rect x="490" y="0" width="100" height="50" fill="#1c1f26" stroke="#7dbf8e"/>
    <text x="540" y="22" font-family="JetBrains Mono" font-size="11" fill="#7dbf8e" text-anchor="middle">ECC56</text>
    <text x="540" y="38" font-family="JetBrains Mono" font-size="9" fill="#5d6068" text-anchor="middle">5 bytes / 56 bits</text>
  </g>

  <!-- CRC scope bracket -->
  <g transform="translate(20,120)">
    <line x1="0" y1="0" x2="0" y2="-10" stroke="#e8e6df"/>
    <line x1="430" y1="0" x2="430" y2="-10" stroke="#e8e6df"/>
    <line x1="0" y1="0" x2="430" y2="0" stroke="#e8e6df"/>
    <text x="215" y="14" font-family="JetBrains Mono" font-size="10" fill="#e8e6df" text-anchor="middle">CRC scope: [3×A1, FB, 512] · catches errors</text>
  </g>

  <!-- ECC scope bracket -->
  <g transform="translate(20,150)">
    <line x1="0" y1="0" x2="0" y2="-10" stroke="#7dbf8e"/>
    <line x1="490" y1="0" x2="490" y2="-10" stroke="#7dbf8e"/>
    <line x1="0" y1="0" x2="490" y2="0" stroke="#7dbf8e"/>
    <text x="245" y="14" font-family="JetBrains Mono" font-size="10" fill="#7dbf8e" text-anchor="middle">ECC scope: [A1, FB, 512] · catches AND can correct</text>
  </g>

  <!-- syndrome flow -->
  <g transform="translate(20,200)">
    <rect x="0" y="0" width="600" height="120" fill="#0a0b0e" stroke="#2a2e38"/>
    <text x="14" y="20" font-family="JetBrains Mono" font-size="10" letter-spacing="0.14em" fill="#e0a85a">SYNDROME FLOW</text>

    <!-- 3 boxes side by side -->
    <g font-family="JetBrains Mono" font-size="10">
      <rect x="20"  y="38" width="160" height="60" fill="#14161b" stroke="#2a2e38"/>
      <text x="100" y="58" fill="#e8e6df" text-anchor="middle" font-size="11">read sector</text>
      <text x="100" y="76" fill="#5d6068" text-anchor="middle">compute ECC poly</text>
      <text x="100" y="90" fill="#5d6068" text-anchor="middle">over [A1, FB, 512]</text>

      <path d="M180,68 L220,68" stroke="#5d6068" marker-end="url(#arr3)"/>

      <rect x="220" y="38" width="160" height="60" fill="#14161b" stroke="#2a2e38"/>
      <text x="300" y="58" fill="#e8e6df" text-anchor="middle" font-size="11">syndrome S</text>
      <text x="300" y="76" fill="#5d6068" text-anchor="middle">S = 0  →  clean ✓</text>
      <text x="300" y="90" fill="#5d6068" text-anchor="middle">S ≠ 0  →  has errors</text>

      <path d="M380,68 L420,68" stroke="#5d6068" marker-end="url(#arr3)"/>

      <rect x="420" y="38" width="160" height="60" fill="#14161b" stroke="#e0a85a" stroke-dasharray="3,3"/>
      <text x="500" y="58" fill="#e0a85a" text-anchor="middle" font-size="11">correct?</text>
      <text x="500" y="76" fill="#5d6068" text-anchor="middle">mdrll: not yet</text>
      <text x="500" y="90" fill="#5d6068" text-anchor="middle">(deferred HLD)</text>
    </g>
  </g>

  <defs>
    <marker id="arr3" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 z" fill="#5d6068"/>
    </marker>
  </defs>
</svg>
  `
};
