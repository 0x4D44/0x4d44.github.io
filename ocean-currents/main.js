// ============================================================
// Rivers in the Sea — page wiring
// Boots the hero and drift globes, hooks up the hero controls and
// info card, drift presets, scroll chrome, and starts/stops every
// animation as it scrolls in and out of view.
// ============================================================
(function () {
  "use strict";

  // ---------- hero globe ----------
  const heroEl = document.getElementById("globe");
  const card = document.getElementById("current-card");

  function fillCard(cur) {
    if (!cur) { card.classList.remove("show"); return; }
    const typeName = { warm: "warm current", cold: "cold current", mixed: "mixed / seasonal", deep: "deep current", "deep-return": "warm return flow" }[cur.type] || "current";
    card.innerHTML = `
      <h3>${cur.name}</h3>
      <div class="meta ${cur.type}">${typeName}</div>
      <p>${cur.blurb}</p>
      <div class="sv">${cur.sv} <small>· peak ~${cur.speed.toFixed(1)} m/s</small></div>`;
    card.classList.add("show");
  }

  const hero = new window.OCGlobe(heroEl, {
    mode: "hero",
    particles: Math.min(4600, (navigator.hardwareConcurrency || 4) >= 6 ? 4600 : 2800),
    initial: { lon: -30, lat: 30 },
    onHover(cur) { if (!hero.pinned) fillCard(cur); },
    onSelect(cur) { fillCard(cur || hero.hover); },
  });
  hero.start();

  // keep labels out of the title block until the reader engages, then fade titles
  hero.labelAvoidY = 280;
  const titles = document.getElementById("hero-titles");
  const hint = document.getElementById("hero-hint");
  let engaged = false;
  function engage() {
    if (engaged) return;
    engaged = true;
    hero.labelAvoidY = 0;
    titles.style.transition = hint.style.transition = "opacity .8s";
    titles.style.opacity = "0";
    hint.style.opacity = "0";
  }
  heroEl.addEventListener("pointerdown", engage, { once: true });
  addEventListener("scroll", () => { if (scrollY > 80) engage(); }, { passive: true });

  // hero controls
  const btnSurface = document.getElementById("btn-surface");
  const btnDeep = document.getElementById("btn-deep");
  const btnLabels = document.getElementById("btn-labels");
  const btnPause = document.getElementById("btn-pause");
  const btnScotland = document.getElementById("btn-scotland");
  const legendDeep = document.getElementById("legend-deep");

  function setDeep(on) {
    hero.setDeepMode(on);
    btnSurface.classList.toggle("on", !on);
    btnDeep.classList.toggle("warm-on", on);
    legendDeep.style.display = on ? "" : "none";
    fillCard(null);
  }
  btnSurface.addEventListener("click", () => setDeep(false));
  btnDeep.addEventListener("click", () => setDeep(true));
  btnLabels.addEventListener("click", () => {
    hero.showLabels = !hero.showLabels;
    btnLabels.classList.toggle("on", hero.showLabels);
  });
  btnPause.addEventListener("click", () => {
    hero.paused = !hero.paused;
    btnPause.textContent = hero.paused ? "Resume" : "Pause";
    btnPause.classList.toggle("on", hero.paused);
  });
  btnScotland.addEventListener("click", () => {
    hero.flyTo(-5, 57, 2.4);
    hero.lastInteract = performance.now();
  });

  // "see the conveyor on the globe" from the deep chapter
  const seeBtn = document.getElementById("btn-see-conveyor");
  if (seeBtn) seeBtn.addEventListener("click", () => {
    setDeep(true);
    hero.flyTo(-30, 25, 1.0);
    document.getElementById("hero").scrollIntoView({ behavior: "smooth" });
  });

  // pause hero when offscreen
  new IntersectionObserver((ents) => {
    for (const e of ents) { if (e.isIntersecting) hero.start(); else hero.stop(); }
  }, { threshold: 0.02 }).observe(heroEl);

  // ---------- drift globe ----------
  const driftEl = document.getElementById("drift-globe");
  const driftReadout = document.getElementById("drift-readout");
  let drift = null;

  function fmtDrift(d) {
    if (!d) {
      driftReadout.innerHTML = '<span style="color:var(--ink-3)">No drifters yet — click the ocean, or launch a preset below.</span>';
      return;
    }
    const yrs = d.days / 365.25;
    const time = yrs >= 1 ? yrs.toFixed(1) + " years" : Math.round(d.days / 30.44) + " months";
    driftReadout.innerHTML = `
      <div style="font-weight:700;color:${d.color}">● ${d.name}</div>
      <div class="big">${time} adrift</div>
      <div>${Math.round(d.dist).toLocaleString()} km travelled</div>
      <div style="color:var(--ink-3)">${d.stuck > 200 ? "Beached." : "position " + Math.abs(d.lat).toFixed(1) + "°" + (d.lat >= 0 ? "N" : "S") + " " + Math.abs(d.lon).toFixed(1) + "°" + (d.lon >= 0 ? "E" : "W")}</div>`;
  }

  if (driftEl) {
    drift = new window.OCGlobe(driftEl, {
      mode: "drift",
      particles: 2200,
      autoRotate: false,
      labels: false,
      initial: { lon: -40, lat: 35 },
      zoom: 1.0,
      onDrift: fmtDrift,
      onDrifterAdded(p) { },
    });
    const presetsEl = document.getElementById("drift-presets");
    for (const p of window.OC_DRIFT_PRESETS) {
      const b = document.createElement("button");
      b.className = "preset";
      b.innerHTML = `${p.name}<small>${p.note}</small>`;
      b.addEventListener("click", () => {
        const d = drift.addDrifter(p.lon, p.lat, p.name);
        drift.flyTo(p.lon, p.lat, drift.zoom);
        fmtDrift(d);
      });
      presetsEl.appendChild(b);
    }
    document.getElementById("drift-clear").addEventListener("click", () => {
      drift.clearDrifters();
      fmtDrift(null);
    });
    new IntersectionObserver((ents) => {
      for (const e of ents) { if (e.isIntersecting) drift.start(); else drift.stop(); }
    }, { threshold: 0.02 }).observe(driftEl);
  }

  // ---------- explainer animations: run only when visible ----------
  for (const [id, anim] of window.OC_ANIMS) {
    new IntersectionObserver((ents) => {
      for (const e of ents) { if (e.isIntersecting) anim.start(); else anim.stop(); }
    }, { threshold: 0.05 }).observe(anim.el);
  }

  // ---------- scroll chrome ----------
  const progress = document.getElementById("progress");
  addEventListener("scroll", () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
  }, { passive: true });

  // dot-nav active section
  const dots = new Map();
  document.querySelectorAll("#dotnav a").forEach(a => dots.set(a.dataset.sec, a));
  const secObs = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (e.isIntersecting) {
        dots.forEach(a => a.classList.remove("active"));
        const a = dots.get(e.target.id);
        if (a) a.classList.add("active");
      }
    }
  }, { rootMargin: "-35% 0px -55% 0px" });
  document.querySelectorAll("section.chapter, #hero").forEach(s => secObs.observe(s));

  // reveal-on-scroll
  const revObs = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (e.isIntersecting) { e.target.classList.add("in"); revObs.unobserve(e.target); }
    }
  }, { threshold: 0.08 });
  document.querySelectorAll(".reveal").forEach(el => revObs.observe(el));
})();
