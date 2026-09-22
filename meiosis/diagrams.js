/* Original parametric SVG. Shared by pre-rendered HTML and interactive views. */
(function (root, factory) { const api = factory(typeof module === 'object' && module.exports ? require('./model.js') : root.MeiosisModel); if (typeof module === 'object' && module.exports)
    module.exports = api;
else
    root.MeiosisDiagrams = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
    'use strict';
    const C = { bg: '#0a1b23', panel: '#10303b', ink: '#eff6ed', muted: '#b0c7c9', line: '#4b6871', m: '#ffa58d', p: '#79e0db', gold: '#f0d18c' };
    const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
    const text = (x, y, v, size = 16, color = C.ink, anchor = 'middle', extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" ${extra}>${esc(v)}</text>`;
    const lines = (x, y, vs, size = 16, color = C.muted, anchor = 'start', gap = 24) => vs.map((v, i) => text(x, y + i * gap, v, size, color, anchor)).join('');
    function svg(w, h, id, title, desc, body) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-title ${id}-desc" class="science-svg"><title id="${id}-title">${esc(title)}</title><desc id="${id}-desc">${esc(desc)}</desc><rect width="${w}" height="${h}" fill="${C.bg}"/><g font-family="system-ui, -apple-system, Segoe UI, sans-serif">${body}</g></svg>`; }
    function arrow(x1, y1, x2, y2, color = C.muted, width = 2) { const a = Math.atan2(y2 - y1, x2 - x1), l = 8; return `<path d="M${x1},${y1}L${x2},${y2}M${x2 - l * Math.cos(a - .55)},${y2 - l * Math.sin(a - .55)}L${x2},${y2}L${x2 - l * Math.cos(a + .55)},${y2 - l * Math.sin(a + .55)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`; }
    const curve = (d, color = C.line, width = 2) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
    function cell(x, y, rx, ry) { return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${C.panel}" fill-opacity=".7" stroke="${C.line}" stroke-width="2"/><ellipse cx="${x}" cy="${y}" rx="${rx - 6}" ry="${ry - 6}" fill="none" stroke="${C.line}" stroke-opacity=".2"/>`; }
    function point(x, y, h, side, t, rep) { return [rep ? x + side * (4 + Math.abs(t - .5) * 24) : x + Math.abs(t - .5) * 8 - 2, y + (t - .5) * h]; }
    function segment(x, y, h, side, start, end, rep) { return [start, ...(start < .5 && end > .5 ? [.5] : []), end].map((t, i) => (i ? 'L' : 'M') + point(x, y, h, side, t, rep).join(',')).join(' '); }
    function chromosome(c, x, y, h = 90, label = true, width = 10) { const rep = c.chromatids.length === 2; let b = ''; c.chromatids.forEach((ch, i) => { b += `<g data-chromatid="${esc(ch.id)}">`; ch.segments.forEach(s => { const d = segment(x, y, h, i ? 1 : -1, s.start, s.end, rep); b += `<path d="${d}" stroke="${s.origin === 'M' ? C.m : C.p}" stroke-width="${width}" fill="none" stroke-linecap="round"/>`; if (s.origin === 'P')
        b += `<path d="${d}" stroke="${C.bg}" stroke-width="2.5" stroke-dasharray="1 7" fill="none" stroke-linecap="round"/>`; }); b += '</g>'; }); b += rep ? `<path d="M${x - 6},${y}h12" stroke="${C.gold}" stroke-width="5" stroke-linecap="round"/>` : `<circle cx="${x - 2}" cy="${y}" r="3.5" fill="${C.gold}"/>`; if (label)
        b += text(x, y + h / 2 + 21, c.id, 14, C.muted); return `<g data-chromosome="${esc(c.id)}">${b}</g>`; }
    function spindle(cx, cy, off, ys, pairs = false) { let b = curve(`M${cx},${cy - 128}v256`, C.line, 1); for (const y of ys) {
        b += curve(`M${cx - off},${cy}Q${cx - off / 2},${y - 30} ${cx - (pairs ? 48 : 5)},${y}`);
        b += curve(`M${cx + off},${cy}Q${cx + off / 2},${y - 30} ${cx + (pairs ? 48 : 5)},${y}`);
    } for (const x of [cx - off, cx + off])
        b += `<circle cx="${x}" cy="${cy}" r="5" fill="${C.gold}"/>`; return `<g opacity=".8">${b}</g>`; }
    function stageInner(stage, label = true) {
        const s = M.snapshot(stage);
        let b = '';
        if (stage <= 5) {
            const cs = s.cells[0].chromosomes, find = id => cs.find(c => c.id === id);
            b += cell(400, 182, 253, 145);
            if (stage <= 1)
                b += `<ellipse cx="400" cy="182" rx="176" ry="124" fill="none" stroke="${C.line}" stroke-dasharray="5 9"/>`;
            if (stage === 4 || stage === 5)
                b += spindle(400, 182, 215, [114, 249], true);
            let pos;
            if (stage <= 1)
                pos = [['M1', 303, 137, 90], ['P1', 484, 137, 90], ['M2', 350, 249, 57], ['P2', 450, 249, 57]];
            else if (stage <= 3)
                pos = [['M1', 350, 112, 90], ['P1', 426, 112, 90], ['M2', 350, 249, 57], ['P2', 426, 249, 57]];
            else if (stage === 4)
                pos = [['M1', 350, 114, 90], ['P1', 450, 114, 90], ['P2', 350, 249, 57], ['M2', 450, 249, 57]];
            else
                pos = [['M1', 259, 114, 90], ['P1', 541, 114, 90], ['P2', 259, 249, 57], ['M2', 541, 249, 57]];
            b += '<g data-cell="0">' + pos.map(([id, x, y, h]) => chromosome(find(id), x, y, h, label)).join('') + '</g>';
            if (stage === 2)
                b += `<rect x="321" y="53" width="133" height="123" rx="20" fill="none" stroke="${C.gold}" stroke-dasharray="4 7"/>`;
            if (stage === 3) {
                b += curve('M361,129Q386,151 414,132', C.gold, 3);
                b += arrow(516, 132, 416, 140, C.gold, 1.5);
                b += text(520, 127, 'chiasma', 16, C.gold, 'start');
            }
            if (stage === 5) {
                b += arrow(328, 179, 276, 179, C.gold);
                b += arrow(472, 179, 524, 179, C.gold);
            }
        }
        else if (stage <= 9) {
            s.cells.forEach((c, i) => { const cx = i ? 583 : 217; b += cell(cx, 182, 161, 145); if (stage >= 7)
                b += spindle(cx, 182, 130, [112, 249]); b += `<g data-cell="${i}">`; if (stage <= 7) {
                b += chromosome(c.chromosomes[0], cx - 39, 156, 92, label);
                b += chromosome(c.chromosomes[1], cx + 42, 231, 57, label);
            }
            else if (stage === 8) {
                b += chromosome(c.chromosomes[0], cx, 112, 90, label);
                b += chromosome(c.chromosomes[1], cx, 249, 57, label);
            }
            else {
                c.chromosomes.forEach((ch, k) => { b += chromosome(ch, cx + (k % 2 ? 70 : -70), k < 2 ? 112 : 249, k < 2 ? 88 : 57, label, 9); });
                b += arrow(cx - 20, 181, cx - 56, 181, C.gold);
                b += arrow(cx + 20, 181, cx + 56, 181, C.gold);
            } b += '</g>'; });
        }
        else {
            s.cells.forEach((c, i) => { const x = 103 + i * 198; b += cell(x, 182, 87, 111) + `<g data-cell="${i}">`; b += chromosome(c.chromosomes[0], x - 25, 162, 75, label, 9) + chromosome(c.chromosomes[1], x + 25, 193, 48, label, 9) + '</g>'; b += text(x, 327, 'product ' + (i + 1), 16, C.muted); });
        }
        return b;
    }
    function stageSVG(stage, id = 'stage') { const m = M.STAGES[stage]; return svg(800, 365, id, m.phase, m.text, stageInner(stage)); }
    function hero() { let b = `<circle cx="300" cy="274" r="254" stroke="${C.line}" stroke-opacity=".4" stroke-dasharray="2 10" fill="none"/><circle cx="300" cy="274" r="189" stroke="${C.line}" stroke-opacity=".25" fill="none"/>`; const s = M.snapshot(3); b += cell(300, 185, 155, 111); b += chromosome(s.cells[0].chromosomes[0], 264, 178, 102, false, 14) + chromosome(s.cells[0].chromosomes[2], 336, 178, 102, false, 14); b += text(300, 62, 'COPY ONCE.', 18, C.muted); b += text(300, 355, 'DIVIDE TWICE.', 18, C.muted); const products = M.snapshot(10).cells; products.forEach((p, i) => { const x = 84 + i * 145; b += curve(`M300,303Q${x},322 ${x},391`, C.line, 2); b += cell(x, 443, 56, 61) + chromosome(p.chromosomes[0], x - 13, 436, 53, false, 8) + chromosome(p.chromosomes[1], x + 17, 450, 34, false, 7); }); b += text(300, 553, 'A whole set. A new combination.', 21, C.ink); return svg(610, 590, 'hero-art', 'Copy once. Divide twice.', 'A replicated homologous pair with exchanged segments leads to four haploid products. A second chromosome pair is omitted from the upper cell for clarity.', b); }
    function atlas() { const stops = [0, 1, 3, 4, 5, 6, 8, 9, 10]; let b = `<rect width="1080" height="1815" rx="20" fill="${C.bg}"/>` + text(42, 49, 'MEIOSIS · THE WHOLE JOURNEY', 23, C.ink, 'start'); b += text(42, 81, 'Two homologous pairs · one possible orientation and crossover', 16, C.muted, 'start'); stops.forEach((s, i) => { const y = 110 + i * 210, m = M.STAGES[s], c = M.counts(s); if (i)
        b += arrow(548, y - 20, 548, y + 2, C.gold); b += text(35, y + 42, String(i + 1).padStart(2, '0'), 22, C.gold, 'start'); b += lines(35, y + 77, (s === 3 ? ['Pair and exchange', 'Prophase I'] : s === 8 ? ['Prepare; align singly', 'Prophase II → metaphase II'] : [m.short, m.phase]).map(t => t.replace(' · interphase', '').replace(' · preparation', '')), 15, C.ink, 'start', 26); b += `<g transform="translate(303,${y - 5}) scale(.6)">${stageInner(s, false)}</g>`; b += lines(836, y + 74, [`${c.cells} ${c.cells === 1 ? 'cell' : 'cells'}`, `${c.chromosomes} chromosomes`, `${c.dna} DNA molecules`, s === 5 ? 'n · 2C at each pole' : s === 9 ? 'n · 1C at each pole' : m.state.replace('Each cell: ', '').replace('Each product: ', '')], 15, C.muted, 'start', 25); if (i < stops.length - 1)
        b += `<path d="M35,${y + 201}H1045" stroke="${C.line}" stroke-opacity=".4"/>`; }); b += text(42, 2025, 'Counts are PER CELL unless marked per pole. No replication between the divisions.', 16, C.gold, 'start'); return svg(1080, 2060, 'atlas-art', 'The complete process of meiosis', 'Before S: 2n,2C. After S:2n,4C. Homologues pair and exchange DNA, align and separate. After meiosis I: two n,2C cells. Chromosomes align singly and sisters separate. After meiosis II: four n,1C products. Anaphase counts refer to each undivided cell, with per-pole states separately labelled.', b); }
    function vocabulary() { const a = M.snapshot(1).cells[0].chromosomes; let b = chromosome(a[0], 160, 159, 159, false, 19) + chromosome(a[2], 419, 159, 159, false, 19); b += text(160, 48, 'ONE replicated chromosome', 19) + text(419, 48, 'ITS HOMOLOGUE', 19); b += curve('M126,269v13h329v-13', C.gold) + text(290, 313, 'Together: 2 chromosomes · 4 chromatids', 19, C.gold); b += arrow(657, 104, 442, 90, C.muted) + lines(660, 101, ['One chromatid', 'One double-stranded', 'DNA molecule'], 16, C.muted); b += arrow(654, 209, 429, 159, C.muted) + lines(660, 205, ['Centromere region', 'Kinetochore assembles here'], 16, C.muted); b += text(160, 355, 'M · solid', 17, C.m) + text(419, 355, 'P · dotted', 17, C.p); return svg(950, 390, 'vocabulary-art', 'Sisters are not homologues', 'Two replicated homologues, each containing two sister chromatids. A chromatid is one double-stranded DNA molecule. The centromere region supports kinetochore assembly.', b); }
    function replication() { const a = M.snapshot(0).cells[0].chromosomes[0], b = M.snapshot(1).cells[0].chromosomes[0]; let body = chromosome(a, 200, 132, 131, false, 18) + arrow(287, 132, 490, 132, C.gold, 3) + text(390, 100, 'S PHASE', 19, C.gold) + chromosome(b, 598, 132, 131, false, 18); body += lines(200, 250, ['1 chromosome', '1 DNA molecule'], 20, C.ink, 'middle', 29) + lines(598, 250, ['1 chromosome', '2 DNA molecules'], 20, C.ink, 'middle', 29); return svg(800, 315, 'replication-art', 'DNA replication does not double the chromosome count', 'An unreplicated chromosome contains one DNA molecule; after S phase one replicated chromosome contains two DNA molecules.', body); }
    function crossing(cut = 2, enabled = true, id = 'crossing-art') { const out = M.crossingOutcomes(cut, enabled), xs = [155, 325, 495, 665]; let b = text(30, 36, 'FOUR CHROMATIDS IN ONE BIVALENT', 17, C.muted, 'start'); out.forEach((str, i) => { const y = 103 + i * 83; for (let j = 0; j < 4; j++) {
        const x = xs[j], o = str[j] === str[j].toUpperCase() ? 'M' : 'P', color = o === 'M' ? C.m : C.p;
        b += `<rect x="${x - 76}" y="${y - 14}" width="159" height="28" rx="7" fill="${color}"/>`;
        if (o === 'P')
            b += `<path d="M${x - 70},${y}h147" stroke="${C.bg}" stroke-width="2" stroke-dasharray="2 8"/>`;
        b += text(x, y + 7, str[j], 22, C.bg, 'middle', 'font-weight="750"');
    } b += text(42, y + 6, ['M1a', 'M1b', 'P1a', 'P1b'][i], 16, C.muted); b += text(784, y + 7, enabled && (i === 1 || i === 2) ? 'new' : 'same', 15, enabled && (i === 1 || i === 2) ? C.gold : C.muted); }); const x = (xs[cut - 1] + xs[cut]) / 2; b += `<path d="M${x},66V${103 + 3 * 83 + 24}" stroke="${C.gold}" stroke-width="2" stroke-dasharray="4 5"/>`; b += text(x, 406, enabled ? 'exchange boundary' : 'no exchange', 17, C.gold); return svg(860, 433, id, 'Crossing over between non-sister chromatids', `Products: ${out.join(', ')}. ${enabled ? 'The middle two chromatids exchange segments after locus ' + cut + '. The other two remain unchanged.' : 'No crossover; the sisters retain their original combinations.'}`, b); }
    function assortment(flips = [false, false, false], id = 'assortment-art') { const a = M.assort(flips); let b = text(250, 36, 'POLE 1', 17, C.muted) + text(650, 36, 'POLE 2', 17, C.muted) + curve('M450,53v224', C.line, 1); flips.forEach((f, i) => { const y = 96 + i * 75; for (const [j, x] of [[0, 366], [1, 534]]) {
        const o = j ? a.right[i] : a.left[i], col = o === 'M' ? C.m : C.p;
        b += `<path d="M${x - 11},${y - 21}L${x + 11},${y + 21}M${x + 11},${y - 21}L${x - 11},${y + 21}" stroke="${col}" stroke-width="8" stroke-linecap="round"/>` + text(j ? 585 : 310, y + 6, o + (i + 1), 16, col);
        b += j ? arrow(598, y, 699, y, C.line) : arrow(301, y, 201, y, C.line);
    } b += text(449, y + 5, 'pair ' + (i + 1), 13, C.muted); }); b += text(250, 335, a.left, 26, C.ink) + text(650, 335, a.right, 26, C.ink) + text(450, 384, 'After meiosis II: ' + a.products.join('  ·  '), 18, C.gold); return svg(900, 416, id, 'Independent assortment: choose the orientation of three homologous pairs', `One division produces ${a.products.join(', ')} without crossing over. Across many divisions there are ${a.possible} possible chromosome-origin combinations.`, b); }
    function countsGraph() { let b = ''; const xs = [135, 280, 450, 625, 795]; b += lines(25, 46, ['Track ONE', 'descendant cell'], 16, C.gold); b += text(28, 110, 'SETS (n)', 15, C.muted, 'start') + text(28, 292, 'DNA (C)', 15, C.muted, 'start'); for (const y of [93, 148, 228, 283, 338])
        b += curve(`M126,${y}H845`, C.line, 1); b += curve('M135,93H450V148H795', C.p, 4) + curve('M135,283L280,228H450V283H625V338H795', C.m, 4); b += text(104, 99, '2n', 16, C.p) + text(104, 154, 'n', 16, C.p) + text(104, 234, '4C', 16, C.m) + text(104, 289, '2C', 16, C.m) + text(104, 344, '1C', 16, C.m); ['Before S', 'After S', 'After I', 'After II', 'Final product'].forEach((t, i) => b += text(xs[i], 390, t, 14, C.muted)); b += text(485, 434, 'S copies DNA. Meiosis I halves sets. Meiosis II separates copies.', 17, C.gold); return svg(900, 465, 'counts-art', 'Ploidy and DNA content do not change together', 'Following one daughter at each division: sets go 2n to 2n to n to n. DNA content goes 2C to 4C to 2C to 1C. Horizontal distances are schematic, not time to scale.', b); }
    function comparison() { let b = ''; const chr = M.snapshot(1).cells[0].chromosomes; [['MEIOSIS I', 'Homologues separate', 0], ['MEIOSIS II', 'Sisters separate', 460]].forEach(([h, s, x]) => { b += text(x + 230, 43, h, 20, C.gold) + text(x + 230, 77, s, 18); b += cell(x + 230, 211, 199, 102); if (x === 0) {
        b += chromosome(chr[0], x + 129, 202, 99, false, 14) + chromosome(chr[2], x + 331, 202, 99, false, 14);
    }
    else {
        const c = M.snapshot(9).cells[0].chromosomes;
        b += chromosome(c[0], x + 129, 202, 99, false, 14) + chromosome(c[1], x + 331, 202, 99, false, 14);
    } b += arrow(x + 207, 209, x + 161, 209, C.gold) + arrow(x + 253, 209, x + 299, 209, C.gold); b += text(x + 230, 354, x === 0 ? 'Sisters stay together' : 'Sisters become daughter chromosomes', 17, C.muted); }); return svg(920, 390, 'comparison-art', 'The two divisions separate different things', 'Meiosis I separates replicated homologous chromosomes with sisters still joined. Meiosis II separates sister chromatids into daughter chromosomes.', b); }
    function nondisjunction(mode = 'none') { const out = M.nondisjunction(mode); let b = text(450, 40, mode === 'none' ? 'Normal segregation' : `Non-disjunction in meiosis ${mode}`, 23, C.ink); b += cell(450, 129, 130, 61) + text(450, 135, 'Starting cell · 2n = 4', 18); [250, 650].forEach((x, i) => { b += arrow(450, 194, x, 240, C.line); b += cell(x, 282, 135, 47) + text(x, 288, mode === 'I' ? (i ? 'No long homologue' : 'Both long homologues') : 'One long homologue', 16, C.muted); }); out.forEach((p, i) => { const x = 112 + i * 225; b += arrow(i < 2 ? 250 : 650, 333, x, 366, C.line) + cell(x, 423, 86, 52); for (let k = 0; k < p.copies; k++)
        b += `<path d="M${x - 28 + k * 23},397v42" stroke="${C.m}" stroke-width="8" stroke-linecap="round"/>`; b += `<path d="M${x + 35},412v21" stroke="${C.p}" stroke-width="8" stroke-linecap="round"/>`; b += text(x, 509, p.label, 24, p.copies === 1 ? C.ink : C.gold) + text(x, 539, p.chromosomes + ' chromosomes', 15, C.muted); }); return svg(900, 569, 'nd-art', 'Consequences of non-disjunction', `${mode === 'none' ? 'Normal segregation' : mode === 'I' ? 'Both homologues move to the same pole in meiosis I' : 'Sister chromatids fail to separate in one of the two meiosis-II cells'}. The four products have ${out.map(p => p.chromosomes).join(', ')} chromosomes in the 2n=4 model.`, b); }
    function lifeCycle() { let b = ''; for (const x of [228, 672]) {
        b += cell(x, 82, 129, 49) + text(x, 89, 'Diploid individual · 2n', 17) + arrow(x, 143, x, 216, C.gold) + text(x + 24, 187, 'meiosis', 16, C.gold, 'start') + cell(x, 269, 81, 44) + text(x, 275, 'Gamete · n', 18) + arrow(x, 327, 450, 382, C.muted);
    } b += text(450, 340, 'FERTILISATION', 18, C.gold) + cell(450, 446, 134, 51) + text(450, 452, 'Zygote · 2n', 21) + text(450, 535, 'Mitosis and development → diploid organism', 18, C.muted); return svg(900, 575, 'cycle-art', 'Meiosis and fertilisation balance chromosome number', 'Two different diploid individuals make haploid gametes. Fusion of one gamete from each restores the diploid state in a zygote. Mitosis and development produce the new organism.', b); }
    function cohesion() { let b = ''; [['1 · Paired homologues', 'Arms and centromeres held'], ['2 · Meiosis I', 'Arms release; centromeres protected'], ['3 · Meiosis II', 'Centromeric cohesion released']].forEach(([a, t], i) => { const x = 158 + i * 315; b += text(x, 36, a, 18, C.gold); const cs = i === 2 ? M.snapshot(9).cells[0].chromosomes : M.snapshot(1).cells[0].chromosomes; const first = cs[0], second = i === 2 ? cs[1] : cs[2]; b += chromosome(first, x - 43, 156, 115, false, 12) + chromosome(second, x + 43, 156, 115, false, 12); if (i === 0) {
        b += curve(`M${x - 33},172Q${x},195 ${x + 33},172`, C.gold, 3);
        for (const y of [124, 187])
            b += `<circle cx="${x - 43}" cy="${y}" r="4" fill="${C.gold}"/>`;
    } b += lines(x, 259, t.includes(';') ? t.split('; ').map((v, k) => k ? v : v + ';') : [t], 14, C.muted, 'middle', 21); }); return svg(945, 322, 'cohesion-art', 'Cohesion is released in two steps', 'A schematic of the attachment logic: crossing-over connections plus arm cohesion link homologues; arm cohesion is released in meiosis I while centromeric cohesion is protected; centromeric cohesion is released in meiosis II.', b); }
    return { C, esc, svg, text, lines, arrow, cell, chromosome, stageSVG, stageInner, hero, atlas, vocabulary, replication, crossing, assortment, countsGraph, comparison, nondisjunction, lifeCycle, cohesion };
});
