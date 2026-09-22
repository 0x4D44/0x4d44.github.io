/* Progressive enhancement only. The complete explanation and vector diagrams are
 * already in index.html. No network requests, analytics or persistent storage. */
(function () {
    'use strict';
    const M = window.MeiosisModel, D = window.MeiosisDiagrams, L = window.MeiosisLearning;
    if (!M || !D || !L)
        return;
    const $ = id => document.getElementById(id), set = (id, text) => { $(id).textContent = text; };
    let stage = 0, timer = null, quizIndex = 0, quizScore = 0, quizAnswered = 0, submitted = false;
    let flips = [false, false, false];
    const fmt = n => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 }).format(n);
    function stop() { if (timer !== null) {
        clearInterval(timer);
        timer = null;
    } $('stage-play').textContent = 'Play slowly'; $('stage-play').setAttribute('aria-pressed', 'false'); }
    function trace() {
        const choice = $('trace-chromosome').value;
        $('stage-picture').querySelectorAll('[data-chromosome]').forEach(g => { g.style.opacity = choice === 'all' || g.dataset.chromosome.startsWith(choice) ? '1' : '.18'; });
    }
    function showStage(value, announce = true) {
        stage = Math.max(0, Math.min(10, Number(value)));
        const s = M.STAGES[stage], n = Number($('counter-organism').value), c = M.counts(stage, n);
        $('stage-picture').innerHTML = D.stageSVG(stage, 'player-art');
        set('stage-phase', s.phase);
        set('stage-title', s.title);
        set('stage-description', s.text);
        set('stage-watch', s.watch);
        $('stage-select').value = String(stage);
        $('stage-prev').disabled = stage === 0;
        $('stage-next').disabled = stage === 10;
        document.querySelectorAll('[data-stage]').forEach(b => { const on = Number(b.dataset.stage) === stage; b.setAttribute('aria-pressed', String(on)); if (on)
            b.setAttribute('aria-current', 'step');
        else
            b.removeAttribute('aria-current'); });
        set('count-cells', String(c.cells));
        set('count-chromosomes', String(c.chromosomes));
        set('count-dna', String(c.dna));
        set('count-state', stage === 5 ? 'n · 2C' : stage === 9 ? 'n · 1C' : stage === 0 ? '2n · 2C' : stage <= 4 ? '2n · 4C' : stage === 10 ? 'n · 1C' : 'n · 2C');
        set('state-scope', c.pole ? 'state at each pole' : 'state of each nucleus');
        let scope = c.pole ? `Before cytokinesis: each whole cell has ${c.chromosomes} chromosomes and ${c.dna} DNA molecules. Each pole: ${c.pole.chromosomes} chromosomes, ${c.pole.dna} DNA molecules (${c.pole.c}C).` : `Counters refer to each of the ${c.cells === 1 ? 'one whole cell' : c.cells + ' cells'}, not their combined total.`;
        if (n === 23)
            scope += ' Human counters; the diagram still shows only two pairs.';
        set('count-scope', scope);
        trace();
        if (announce)
            set('stage-announcement', `Step ${stage + 1} of 11. ${s.short}. ${s.watch}`);
        if (stage === 10)
            stop();
    }
    function stageChoice(v) { stop(); showStage(v); }
    document.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => stageChoice(b.dataset.stage)));
    $('stage-prev').addEventListener('click', () => stageChoice(stage - 1));
    $('stage-next').addEventListener('click', () => stageChoice(stage + 1));
    $('stage-select').addEventListener('change', e => stageChoice(e.target.value));
    $('counter-organism').addEventListener('change', () => showStage(stage));
    $('stage-play').addEventListener('click', () => {
        if (timer !== null) {
            stop();
            return;
        }
        if (stage === 10)
            showStage(0);
        $('stage-play').textContent = 'Pause';
        $('stage-play').setAttribute('aria-pressed', 'true');
        timer = setInterval(() => showStage(stage + 1), 9000);
    });
    $('trace-chromosome').addEventListener('change', trace);
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        stop(); });
    window.addEventListener('pagehide', stop);
    // Scoped keyboard navigation does not capture keys elsewhere or interfere with selects.
    $('stage-picture').addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        stageChoice(stage + (e.key === 'ArrowRight' ? 1 : -1));
    } });
    function cross() {
        const cut = Number($('cross-cut').value), enabled = $('cross-enabled').checked, values = M.crossingOutcomes(cut, enabled);
        $('cross-diagram').innerHTML = D.crossing(cut, enabled);
        $('cross-results').replaceChildren(...values.map((value, i) => { const d = document.createElement('div'); d.className = 'result-card'; const b = document.createElement('b'); b.textContent = value; const s = document.createElement('span'); s.textContent = ['M1a', 'M1b', 'P1a', 'P1b'][i]; d.append(b, s); return d; }));
        set('cross-status', enabled ? `Exchange between ${'ABCD'[cut - 1]} and ${'ABCD'[cut]}: ${values.join(', ')}. Two recombinant chromatids; two unchanged.` : `No exchange: ${values.join(', ')}. All four retain parental allele combinations.`);
    }
    $('cross-cut').addEventListener('change', cross);
    $('cross-enabled').addEventListener('change', cross);
    function assortment() {
        const a = M.assort(flips);
        $('assort-diagram').innerHTML = D.assortment(flips);
        document.querySelectorAll('[data-flip]').forEach(b => b.setAttribute('aria-pressed', String(flips[Number(b.dataset.flip)])));
        document.querySelectorAll('[data-combination]').forEach(t => { const active = a.products.includes(t.dataset.combination); t.classList.toggle('active', active); t.setAttribute('aria-label', `${t.dataset.combination}${active ? ', present in this meiosis' : ', not present in this meiosis'}`); });
        set('assort-status', `This meiosis: ${a.products.join(', ')}. Two distinct combinations, each appearing twice. Across many orientations: eight possible combinations.`);
    }
    document.querySelectorAll('[data-flip]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.flip); flips[i] = !flips[i]; assortment(); }));
    $('assort-reset').addEventListener('click', () => { flips = [false, false, false]; assortment(); });
    $('pair-count').addEventListener('input', () => { const n = Number($('pair-count').value); set('pair-count-label', String(n)); set('combination-count', fmt(M.combinationCount(n))); set('combination-caption', `2 to the power ${n}: possible chromosome-origin combinations across many meioses, ignoring crossing over.`); });
    const mapIds = ['map-ab-upper', 'map-ab-lower', 'map-Ab', 'map-aB'];
    function mapping() {
        try {
            if (mapIds.some(id => $(id).value.trim() === ''))
                throw new Error('Complete all four counts.');
            const r = M.recombination(...mapIds.map(id => Number($(id).value)));
            let interpretation = r.percent < 25 ? `About ${fmt(r.percent)} cM as a simple short-interval estimate; not an exact physical distance.` : r.percent < 50 ? 'A longer-interval percentage is not a reliable exact map distance; multiple crossovers may be missed.' : r.percent === 50 ? 'Compatible with independent inheritance. This does not prove the loci are on different chromosomes.' : 'Above 50% observed: sampling variation or model assumptions need scrutiny. Do not convert this directly to a map distance.';
            set('mapping-status', `${fmt(r.percent)}% recombination: ${fmt(r.recombinants)} recombinant offspring / ${fmt(r.total)} total × 100. ${interpretation}`);
            $('mapping-status').classList.remove('error');
        }
        catch (e) {
            set('mapping-status', e.message);
            $('mapping-status').classList.add('error');
        }
    }
    $('mapping-form').addEventListener('submit', e => { e.preventDefault(); mapping(); });
    $('mapping-reset').addEventListener('click', () => { [420, 420, 80, 80].forEach((v, i) => $(mapIds[i]).value = v); mapping(); });
    function nd() {
        const mode = $('nd-mode').value, n = Number($('nd-organism').value), out = M.nondisjunction(mode, n);
        $('nd-diagram').innerHTML = D.nondisjunction(mode);
        $('nd-results').replaceChildren(...out.map((p, i) => { const d = document.createElement('div'); d.className = 'result-card'; const b = document.createElement('b'); b.textContent = `${p.chromosomes} · ${p.label}`; const s = document.createElement('span'); s.textContent = `Product ${i + 1} → zygote: ${p.zygote}`; d.append(b, s); return d; }));
        const reason = mode === 'I' ? 'Both meiosis-I lineages are affected. All four products have an extra or missing chromosome.' : mode === 'II' ? 'Only one meiosis-II lineage is affected. Two products are n; one is n + 1 and one is n − 1.' : 'Normal segregation: all four products have one of every chromosome type.';
        set('nd-status', `${reason} Counts after fertilisation assume a normal ${n}-chromosome gamete: ${out.map(p => p.zygote).join(', ')}. ${n === 23 ? 'The picture remains a 2n = 4 model.' : ''}`);
    }
    $('nd-mode').addEventListener('change', nd);
    $('nd-organism').addEventListener('change', nd);
    function quiz() {
        const q = L.quiz[quizIndex];
        submitted = false;
        set('quiz-position', `Question ${quizIndex + 1} of ${L.quiz.length}`);
        set('quiz-score', `${quizScore} correct from ${quizAnswered} answered`);
        set('quiz-question', q.q);
        $('quiz-options').replaceChildren(...q.options.map((option, i) => { const label = document.createElement('label'), input = document.createElement('input'), span = document.createElement('span'); input.type = 'radio'; input.name = 'answer'; input.value = String(i); input.required = true; span.textContent = option; label.append(input, span); return label; }));
        $('quiz-check').hidden = false;
        $('quiz-next').hidden = true;
        $('quiz-next').textContent = 'Next question →';
        $('quiz-feedback').replaceChildren();
        $('quiz-feedback').className = 'quiz-feedback';
        $('quiz-form').hidden = false;
    }
    $('quiz-form').addEventListener('submit', e => {
        e.preventDefault();
        if (submitted)
            return;
        const selected = $('quiz-form').querySelector('input[name=answer]:checked');
        if (!selected)
            return;
        const q = L.quiz[quizIndex], i = Number(selected.value), correct = i === q.answer;
        submitted = true;
        quizAnswered++;
        if (correct)
            quizScore++;
        $('quiz-form').querySelectorAll('input').forEach(input => input.disabled = true);
        const p = document.createElement('p');
        p.textContent = (correct ? 'Correct. ' : 'Not quite. ') + q.feedback[i] + (correct ? '' : ' Correct answer: ' + q.options[q.answer] + '.');
        const a = document.createElement('a');
        a.href = '#' + q.link;
        a.textContent = 'Revisit the explanation ↗';
        $('quiz-feedback').replaceChildren(p, a);
        $('quiz-feedback').classList.toggle('correct', correct);
        set('quiz-score', `${quizScore} correct from ${quizAnswered} answered`);
        $('quiz-check').hidden = true;
        $('quiz-next').hidden = false;
        if (quizIndex === L.quiz.length - 1)
            $('quiz-next').textContent = 'See your result';
    });
    $('quiz-next').addEventListener('click', () => {
        if (!submitted)
            return;
        if (quizIndex < L.quiz.length - 1) {
            quizIndex++;
            quiz();
            $('quiz-options').querySelector('input').focus();
        }
        else {
            $('quiz-form').hidden = true;
            set('quiz-position', 'Complete');
            $('quiz-feedback').textContent = `${quizScore} / ${L.quiz.length} correct on first submission. ${quizScore === L.quiz.length ? 'You kept the key distinctions straight. Try explaining the full process without looking.' : 'Use the explanations and worked tasks to revisit the distinctions that were less secure, then try again.'}`;
            $('quiz-reset').focus();
        }
    });
    $('quiz-reset').addEventListener('click', () => { quizIndex = 0; quizScore = 0; quizAnswered = 0; quiz(); $('quiz-options').querySelector('input').focus(); });
    $('glossary-search').addEventListener('input', () => {
        const q = $('glossary-search').value.trim().toLocaleLowerCase('en-GB');
        let visible = 0;
        document.querySelectorAll('#glossary-list > div').forEach(d => { const show = d.textContent.toLocaleLowerCase('en-GB').includes(q); d.hidden = !show; if (show)
            visible++; });
        set('glossary-status', `${visible} ${visible === 1 ? 'term' : 'terms'}${q ? ' matching your search' : ''}.`);
    });
    const dialog = $('atlas-dialog');
    $('open-atlas').addEventListener('click', () => {
        stop();
        // A second SVG requires a separate ID namespace, so every aria reference remains unique.
        $('atlas-dialog-art').innerHTML = D.atlas().replaceAll('atlas-art', 'atlas-modal-art');
        dialog.showModal();
    });
    $('close-atlas').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { $('open-atlas').focus(); });
    $('text-size').addEventListener('click', () => { const on = document.body.classList.toggle('big-type'); $('text-size').setAttribute('aria-pressed', String(on)); });
    $('print-page').addEventListener('click', () => window.print());
    let openedForPrint = [];
    window.addEventListener('beforeprint', () => { stop(); openedForPrint = [...document.querySelectorAll('details:not([open])')]; openedForPrint.forEach(d => d.open = true); });
    window.addEventListener('afterprint', () => { openedForPrint.forEach(d => d.open = false); openedForPrint = []; });
    let scrollPending = false;
    function reading() {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        $('reading-progress').style.width = `${max > 0 ? Math.min(100, window.scrollY / max * 100) : 0}%`;
        const chapters = [...document.querySelectorAll('.chapter[id]')];
        let current = chapters[0].id;
        for (const chapter of chapters)
            if (chapter.getBoundingClientRect().top < window.innerHeight * .35)
                current = chapter.id;
        document.querySelectorAll('.sidebar a[data-nav]').forEach(a => { const on = a.getAttribute('href') === '#' + current; a.classList.toggle('active', on); if (on)
            a.setAttribute('aria-current', 'location');
        else
            a.removeAttribute('aria-current'); });
        scrollPending = false;
    }
    window.addEventListener('scroll', () => { if (!scrollPending) {
        scrollPending = true;
        requestAnimationFrame(reading);
    } }, { passive: true });
    $('mobile-index').querySelectorAll('a').forEach(a => a.addEventListener('click', () => { $('mobile-index').open = false; }));
    $('mapping-inputs').disabled = false;
    showStage(0, false);
    quiz();
    reading();
    document.body.classList.add('enhanced');
})();
