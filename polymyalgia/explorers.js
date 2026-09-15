'use strict';
/* Progressive enhancement only. No patient inputs, persistence, requests or timers. */
(() => {
  const $ = (id) => document.getElementById(id);
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function choose(attribute, callback) {
    const buttons = all(`button[${attribute}]`);
    for (const button of buttons) {
      button.addEventListener('click', () => {
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
        callback(button.getAttribute(attribute));
      });
    }
  }
  const anatomyNotes = {
    bursa: 'Bursa: this fluid-lined cushion allows movement with little friction. Inflammation here can make shoulder movement painful even when the muscle itself remains capable of producing force.',
    tendon: 'Tendon and sheath: tendons transmit muscular force. Inflammation around tendons or in their sheaths can interfere with comfortable gliding. The diagram combines nearby structures to make the distinction visible; it is not a literal scan.',
    joint: 'Joint lining: synovial inflammation may accompany the periarticular pattern. A swollen or painful joint is not specific to PMR; rheumatoid arthritis and other conditions remain possible explanations.',
    muscle: 'Muscle: difficulty moving because it hurts is different from objective loss of muscle power. PMR is not primarily widespread muscle-fibre destruction. New true weakness needs assessment, including for other disease, deconditioning or steroid effects.'
  };
  function setAnatomy(part) {
    if (!(part in anatomyNotes)) return;
    for (const key of Object.keys(anatomyNotes)) {
      const shape = $(`anatomy-${key}`);
      shape.style.opacity = key === part ? '1' : '.35';
      shape.style.filter = key === part ? 'drop-shadow(0 0 6px #ffc18d66)' : 'none';
    }
    $('anatomy-note').textContent = anatomyNotes[part];
  }
  choose('data-anatomy', setAnatomy);
  setAnatomy('bursa');

  const signalNotes = {
    active: 'Active signalling: IL-6 is one route through a much larger immune network. Symptoms, local inflammation and liver blood-test responses are connected, but they are not the same measurement.',
    steroid: 'Glucocorticoid: broad receptor-mediated changes suppress several inflammatory programmes, not only IL-6. This drawing highlights a broad intervention; it does not quantify benefit, duration, adrenal suppression or side effects.',
    blockade: 'IL-6 receptor blockade: interrupting this receptor suppresses its downstream acute-phase signal. CRP can become low because the pathway is blocked. Low CRP alone therefore cannot exclude active disease or infection. Parallel pathways remain.'
  };
  choose('data-signal', (mode) => {
    if (!(mode in signalNotes)) return;
    for (const node of all('#signal-lab .node')) node.classList.remove('dim', 'blocked');
    if (mode === 'steroid') {
      $('signal-source').classList.add('blocked');
      $('signal-cell').classList.add('blocked');
    }
    if (mode === 'blockade') {
      $('signal-receptor').classList.add('blocked');
      $('signal-output').classList.add('dim');
    }
    $('signal-note').textContent = signalNotes[mode];
  });

  function updateDay() {
    const hour = clamp(Number($('day-time').value) || 0, 0, 24);
    $('day-output').textContent = `${String(hour).padStart(2, '0')}:00`;
    $('day-cursor').setAttribute('d', `M${55 + hour / 24 * 580} 36V243`);
    let text = 'Night: the illustrative curves rise towards morning. The diagram is not a recording of your symptoms or hormone levels.';
    if (hour >= 4 && hour <= 8) text = 'Early morning: the illustrative symptom curve is near its peak. The actual study found group-level variation; an individual’s pattern can differ.';
    else if (hour > 8 && hour < 14) text = 'Later morning: the illustrative symptom burden is falling. Symptoms and cortisol are different quantities; the curve heights cannot be compared numerically.';
    else if (hour >= 14 && hour < 20) text = 'Afternoon: the symptom curve is near its low point, reflecting the qualitative pattern in the small study—not a promise of an easy afternoon.';
    $('day-note').textContent = text;
  }
  $('day-time').addEventListener('input', updateDay);
  updateDay();

  const lenses = {
    pattern: 'Pattern: age, distribution, morning stiffness, the speed of onset and the examination help establish whether PMR is plausible. They also identify urgent GCA features and competing diagnoses.',
    blood: 'Blood tests: CRP and ESR help assess inflammation but do not identify its cause. Other tests address possible alternatives and treatment safety. Normal values are not a licence to ignore an urgent clinical picture.',
    imaging: 'Imaging: ultrasound may support a periarticular inflammatory pattern. MRI or PET may help selected difficult cases. No single scan should be read in isolation, and suspected GCA treatment must not wait for a perfect test.',
    review: 'Reassessment: the response and subsequent course are additional evidence. Rapid steroid response supports—but does not prove—PMR. Persistent or new symptoms deserve review rather than automatic dose escalation.'
  };
  function setLens(lens) {
    if (!(lens in lenses)) return;
    for (const key of Object.keys(lenses)) {
      $(`lens-${key}`).setAttribute('fill', key === lens ? '#285344' : '#172a3d');
      $(`lens-${key}`).setAttribute('stroke-width', key === lens ? '4' : '2');
    }
    $('lens-note').textContent = lenses[lens];
  }
  choose('data-lens', setLens);
  setLens('pattern');

  $('artery-wall').addEventListener('input', () => {
    const amount = clamp(Number($('artery-wall').value) || 0, 0, 100);
    $('artery-lumen').setAttribute('r', String(74 - amount * .48));
  });

  choose('data-fraction', (value) => {
    const base = Number(value);
    if (![5, 10, 20].includes(base)) return;
    const percentage = 100 / base;
    $('fraction-result').textContent = `${percentage}%`;
    $('fraction-text').textContent = `A reduction of 1 from ${base} is ${percentage}% of the starting amount. This is arithmetic, not a dose recommendation.`;
    $('fraction-cut').setAttribute('x', String(315 - 300 / base));
    $('fraction-cut').setAttribute('width', String(300 / base));
  });

  function setTrial(name) {
    if (!['saphyr', 'mtx', 'spare', 'replenish'].includes(name)) return;
    for (const panel of all('.trial-panel')) panel.hidden = panel.id !== `trial-${name}`;
  }
  choose('data-trial', setTrial);
  setTrial('saphyr');

  const cohortRates = Object.freeze({1: 77, 2: 51, 5: 25});
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 100; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    fragment.appendChild(dot);
  }
  $('cohort-dots').appendChild(fragment);
  function setCohort(year) {
    if (!Object.hasOwn(cohortRates, year)) return;
    const value = cohortRates[year];
    $('cohort-number').textContent = `${value}%`;
    $('cohort-text').textContent = `Pooled estimate still receiving glucocorticoids at ${year} ${Number(year) === 1 ? 'year' : 'years'}. This is not an individual forecast or a single cohort followed through time.`;
    Array.from($('cohort-dots').children).forEach((dot, i) => dot.classList.toggle('on', i < value));
  }
  choose('data-cohort', setCohort);
  setCohort('1');

  // Print native details in full, then restore the reader's expansion state.
  let printState = null;
  function beforePrint() {
    if (printState) return;
    printState = all('details').map((element) => [element, element.open]);
    if (document.body.dataset.print !== 'questions') {
      for (const [element] of printState) element.open = true;
    }
  }
  function afterPrint() {
    if (printState) for (const [element, wasOpen] of printState) element.open = wasOpen;
    printState = null;
    delete document.body.dataset.print;
  }
  window.addEventListener('beforeprint', beforePrint);
  window.addEventListener('afterprint', afterPrint);
  $('print-guide').addEventListener('click', () => {
    delete document.body.dataset.print;
    beforePrint();
    window.print();
  });
  $('print-questions').addEventListener('click', () => {
    document.body.dataset.print = 'questions';
    beforePrint();
    window.print();
  });

  const chapters = all('.chapter');
  const links = all('.toc a');
  const progress = document.querySelector('.progress');
  let queued = false;
  function updatePosition() {
    queued = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = `${max > 0 ? clamp(window.scrollY / max * 100, 0, 100) : 0}%`;
    let current = '';
    for (const chapter of chapters) if (chapter.getBoundingClientRect().top <= 145) current = chapter.id;
    for (const link of links) {
      if (link.hash === `#${current}`) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }
  function queuePosition() {
    if (!queued) { queued = true; window.requestAnimationFrame(updatePosition); }
  }
  window.addEventListener('scroll', queuePosition, {passive: true});
  window.addEventListener('resize', queuePosition, {passive: true});
  window.addEventListener('load', queuePosition);
  document.documentElement.classList.add('js-ready');
  updatePosition();
})();
