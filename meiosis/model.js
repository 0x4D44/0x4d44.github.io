/* Pure, deterministic lineage model for a two-autosomal-pair teaching organism.
   One chromatid = one double-stranded DNA molecule. Not a molecular simulation. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports)
    module.exports = api;
else
    root.MeiosisModel = api; })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const STAGES = [
        ['Starting cell', 'Before S phase · interphase', 'A complete pair of sets', 'Four chromosomes, two homologous pairs. One long and one short chromosome make a set. M and P track the homologues inherited from this individual’s mother and father. The compact shapes are a drawing convention: interphase chromosomes are normally much less condensed.', 'Four chromosomes does not mean four sets.', '2n · 2C'],
        ['Copy DNA', 'S phase · preparation', 'Copy the DNA, not the number of sets', 'DNA replication produces two sister chromatids per chromosome. Cohesin holds the sisters together. Each joined pair is still counted as one replicated chromosome. Our cell now has four chromosomes but eight DNA molecules.', 'An X is one replicated chromosome, not two homologous chromosomes.', '2n · 4C'],
        ['Pair homologues', 'Early prophase I', 'Find the matching chromosome', 'Homologous chromosomes pair in synapsis. Their corresponding loci align. Each homologue has two sister chromatids, so a bivalent contains two chromosomes and four chromatids. Homologues carry the same kinds of genes, but may carry different alleles.', 'A bivalent has two chromosomes and four chromatids.', '2n · 4C'],
        ['Exchange DNA', 'Prophase I', 'Make new combinations of alleles', 'Here, two non-sister chromatids of the long homologous pair exchange corresponding distal DNA segments. The other two chromatids are unchanged. The mixed segments remain attached to the same chromosome lineage in every later diagram.', 'Crossing over exchanges existing alleles. It does not have to create a new allele.', '2n · 4C'],
        ['Align pairs', 'Metaphase I', 'Each pair can face either way', 'Bivalents line up at the equator. The homologues attach to opposite spindle poles through kinetochores; the sister chromatids of each homologue are co-oriented. Each pair’s orientation is independent of the other pairs. Here, M1 shares a side with P2.', 'Homologous PAIRS align here. In metaphase II, individual chromosomes align.', '2n · 4C'],
        ['Separate homologues', 'Anaphase I', 'Keep the sisters together', 'The connections holding homologues together are released. One long and one short chromosome move towards each pole. Each chromosome still has two chromatids. Each future nucleus receives one member of every homologous pair.', 'The WHOLE undivided cell still has four chromosomes. Each pole receives two.', 'Per pole: n · 2C'],
        ['Divide once', 'Telophase I and cytokinesis', 'Haploid, but still replicated', 'Two cells form. Each has one chromosome of each type and is therefore haploid. Each chromosome still has two chromatids, so each cell has 2C DNA. Nuclear envelopes may reform; the details vary among organisms.', 'No S phase takes place between meiosis I and meiosis II.', 'Each cell: n · 2C'],
        ['Prepare again', 'Prophase II', 'Use the copies already made', 'Each haploid cell forms a spindle. Where nuclear envelopes reformed, they break down again. No DNA has been replicated between the two divisions. The second division will distribute the sister chromatids made in the original S phase.', 'Meiosis II does not halve the number of homologous sets again.', 'Each cell: n · 2C'],
        ['Align singly', 'Metaphase II', 'Now the sisters face opposite poles', 'In each cell, individual replicated chromosomes line up at the equator. Sister kinetochores attach towards opposite poles. No homologous pairing occurs here: the other homologue went to the other cell in meiosis I.', 'Single chromosomes here; homologous pairs in metaphase I.', 'Each cell: n · 2C'],
        ['Separate sisters', 'Anaphase II', 'Each separated chromatid is now a chromosome', 'Centromeric cohesion is released. Sister chromatids separate and become daughter chromosomes. Each still-undivided cell temporarily contains four chromosomes, but each pole receives two. The change in chromosome count does not involve DNA replication.', 'State your counting boundary: per undivided cell or per future nucleus.', 'Per pole: n · 1C'],
        ['Four products', 'Telophase II and cytokinesis', 'One of each type, with a new combination', 'Four haploid nuclei form, packaged into four products in this symmetric model. Each has one long and one short chromosome, each containing one DNA molecule. This illustrated crossover gives four distinct combinations; that is not guaranteed in every meiosis.', 'Meiotic products are not necessarily four mature gametes. Egg formation is asymmetric.', 'Each product: n · 1C']
    ].map((s, i) => Object.freeze({ id: i, short: s[0], phase: s[1], title: s[2], text: s[3], watch: s[4], state: s[5] }));
    const clone = o => JSON.parse(JSON.stringify(o));
    function int(v, min, max, name) { if (!Number.isInteger(v) || v < min || v > max)
        throw new RangeError(name + ' out of range'); return v; }
    function chrom(origin, pair, rep) { return { id: origin + pair, pair, origin, chromatids: Array.from({ length: rep ? 2 : 1 }, (_, i) => ({ id: origin + pair + (i ? 'b' : 'a'), segments: [{ start: 0, end: 1, origin }] })) }; }
    function initial(rep, cross) { const a = ['M', 'P'].flatMap(o => [1, 2].map(p => chrom(o, p, rep))); if (cross && rep) {
        a[0].chromatids[1].segments = [{ start: 0, end: .72, origin: 'M' }, { start: .72, end: 1, origin: 'P' }];
        a[2].chromatids[0].segments = [{ start: 0, end: .72, origin: 'P' }, { start: .72, end: 1, origin: 'M' }];
    } return a; }
    function single(c, i) { return { ...clone(c), id: c.id + (i ? 'b' : 'a'), chromatids: [clone(c.chromatids[i])] }; }
    function snapshot(stage, cross = true) {
        int(stage, 0, 10, 'stage');
        const a = initial(stage !== 0, cross && stage >= 3);
        const halves = [[a[0], a[3]], [a[2], a[1]]];
        let cells;
        if (stage <= 5)
            cells = [a];
        else if (stage <= 8)
            cells = halves;
        else if (stage === 9)
            cells = halves.map(h => h.flatMap(c => [single(c, 0), single(c, 1)]));
        else
            cells = halves.flatMap(h => [0, 1].map(i => h.map(c => single(c, i))));
        return { stage, meta: STAGES[stage], cells: cells.map(chromosomes => ({ chromosomes, chromosomeCount: chromosomes.length, dna: chromosomes.reduce((s, c) => s + c.chromatids.length, 0) })) };
    }
    function counts(stage, n = 2) { int(n, 1, 100, 'haploid number'); const s = snapshot(stage), c = s.cells[0]; return { cells: s.cells.length, chromosomes: c.chromosomeCount * n / 2, dna: c.dna * n / 2, c: c.dna / 2, pole: stage === 5 ? { chromosomes: n, dna: 2 * n, c: 2 } : stage === 9 ? { chromosomes: n, dna: n, c: 1 } : null }; }
    function crossingOutcomes(cut = 2, enabled = true) { int(cut, 1, 3, 'crossover interval'); return enabled ? ['ABCD', 'ABCD'.slice(0, cut) + 'abcd'.slice(cut), 'abcd'.slice(0, cut) + 'ABCD'.slice(cut), 'abcd'] : ['ABCD', 'ABCD', 'abcd', 'abcd']; }
    function assort(flips) { if (!Array.isArray(flips) || flips.length < 1 || flips.length > 23 || flips.some(x => typeof x !== 'boolean'))
        throw new TypeError('Expected 1–23 booleans'); const left = flips.map(x => x ? 'P' : 'M').join(''), right = flips.map(x => x ? 'M' : 'P').join(''); return { left, right, products: [left, left, right, right], possible: 2 ** flips.length }; }
    function combinations(n) { int(n, 1, 8, 'display pairs'); return Array.from({ length: 2 ** n }, (_, v) => Array.from({ length: n }, (_, i) => (v >> (n - i - 1)) & 1 ? 'P' : 'M').join('')); }
    function combinationCount(n) { int(n, 1, 23, 'pairs'); return 2 ** n; }
    function nondisjunction(mode = 'none', n = 2) { int(n, 1, 100, 'haploid number'); if (!['none', 'I', 'II'].includes(mode))
        throw new RangeError('Unknown division'); return (mode === 'I' ? [2, 2, 0, 0] : mode === 'II' ? [2, 0, 1, 1] : [1, 1, 1, 1]).map(copies => ({ copies, chromosomes: n - 1 + copies, zygote: 2 * n - 1 + copies, label: copies === 1 ? 'n' : copies === 2 ? 'n + 1' : 'n − 1' })); }
    function recombination(a, b, c, d) { const values = [a, b, c, d]; if (values.some(x => !Number.isSafeInteger(x) || x < 0 || x > 1e9))
        throw new RangeError('Counts must be non-negative integers, up to 1 billion'); const total = values.reduce((x, y) => x + y, 0); if (!total)
        throw new RangeError('Enter at least one offspring'); return { total, recombinants: c + d, percent: (c + d) / total * 100 }; }
    return { STAGES: Object.freeze(STAGES), snapshot, counts, crossingOutcomes, assort, combinations, combinationCount, nondisjunction, recombination };
});
