import assert from "node:assert/strict";
import { CARDS, HOMILIES, ENDINGS, CAST } from "../content.js";
import { RITUAL_CYCLE } from "../engine.js";

const KINDS = new Set(["email", "invite", "chat", "memo", "postit", "slide", "report", "ritual"]);
const EFFECT_KEYS = new Set(["leadership", "team", "you", "headcount"]);
const ENGINE_ENDINGS = [
  "managed-out", "promoted", "mass-resignation", "cult", "burnout",
  "balance", "role-eliminated", "apex", "long-service",
];

const cardIds = new Set();
const homilyIds = new Set(HOMILIES.map((h) => h.id));
const endingIds = new Set(ENDINGS.map((e) => e.id));
const flagsSet = new Set(["reorg_looms"]); // armed by the engine's quarterly roulette
const flagsRequired = new Set();
const homiliesReferenced = new Set();
const endingsReferenced = new Set(ENGINE_ENDINGS);

function checkChoice(card, side) {
  const choice = card[side];
  assert.ok(choice, `${card.id}.${side} exists`);
  assert.ok(typeof choice.label === "string" && choice.label.length >= 2, `${card.id}.${side} has a label`);
  assert.ok(choice.label.length <= 70, `${card.id}.${side} label short enough for a button: ${choice.label.length}`);
  if (choice.effects) {
    for (const [key, value] of Object.entries(choice.effects)) {
      assert.ok(EFFECT_KEYS.has(key), `${card.id}.${side} effect key valid: ${key}`);
      assert.ok(Number.isInteger(value), `${card.id}.${side}.${key} integer`);
      assert.ok(Math.abs(value) <= 20, `${card.id}.${side}.${key} within ±20: ${value}`);
    }
  }
  if (choice.quip) assert.ok(choice.quip.length <= 160, `${card.id}.${side} quip fits: ${choice.quip.length}`);
  if (choice.homily) {
    assert.ok(homilyIds.has(choice.homily), `${card.id}.${side} homily exists: ${choice.homily}`);
    homiliesReferenced.add(choice.homily);
  }
  if (choice.ending) {
    assert.ok(endingIds.has(choice.ending), `${card.id}.${side} ending exists: ${choice.ending}`);
    endingsReferenced.add(choice.ending);
  }
  if (choice.followup) {
    assert.ok(CARDS.some((c) => c.id === choice.followup.card), `${card.id}.${side} followup exists: ${choice.followup.card}`);
  }
  for (const f of choice.setFlags || []) flagsSet.add(f);
  for (const f of choice.clearFlags || []) assert.ok(typeof f === "string");
}

for (const card of CARDS) {
  assert.ok(card.id && !cardIds.has(card.id), `unique card id: ${card.id}`);
  cardIds.add(card.id);
  assert.ok(CAST[card.cast], `${card.id} cast exists: ${card.cast}`);
  assert.ok(KINDS.has(card.kind), `${card.id} kind valid: ${card.kind}`);
  assert.ok(typeof card.text === "string" && card.text.length >= 20, `${card.id} has body text`);
  assert.ok(card.text.length <= 420, `${card.id} text fits on a card: ${card.text.length}`);
  if (card.kind === "ritual") {
    assert.ok(RITUAL_CYCLE.includes(card.ritual), `${card.id} ritual slot valid`);
  } else {
    assert.equal(card.ritual, undefined, `${card.id} only rituals carry a ritual slot`);
  }
  if (card.minQuarter) assert.ok(card.minQuarter >= 1 && card.minQuarter <= 12, `${card.id} minQuarter sane`);
  for (const f of card.requiresFlags || []) flagsRequired.add(f);
  checkChoice(card, "left");
  checkChoice(card, "right");
}

/* every flag a card demands is set by something */
for (const flag of flagsRequired) {
  assert.ok(flagsSet.has(flag), `required flag is settable: ${flag}`);
}

/* mechanics: no strictly dominant choice (both sides pure effects only) */
{
  const KEYS = ["leadership", "team", "you", "headcount"];
  const extras = (s) => !!(s.setFlags || s.clearFlags || s.followup || s.ending || s.homily);
  const geq = (a, b) => KEYS.every((k) => (a[k] || 0) >= (b[k] || 0));
  for (const card of CARDS) {
    if (extras(card.left) || extras(card.right)) continue;
    const le = card.left.effects || {};
    const re = card.right.effects || {};
    if (JSON.stringify(le) === JSON.stringify(re)) continue;
    assert.ok(!geq(le, re), `${card.id}: left choice strictly dominates`);
    assert.ok(!geq(re, le), `${card.id}: right choice strictly dominates`);
  }
}

/* mechanics: reorg cards must always release the flag (else reorg deck jams on) */
for (const card of CARDS) {
  if (!(card.requiresFlags || []).includes("reorg_looms")) continue;
  for (const side of ["left", "right"]) {
    const s = card[side];
    const releases = (s.clearFlags || []).includes("reorg_looms") || s.followup || s.ending;
    assert.ok(releases, `${card.id}.${side} must clear reorg_looms, chain onward, or end the run`);
  }
}

/* mechanics: a staged arc must be strictly ordered. engine.draw() plays a queued
   follow-up only if it is still isEligible(), and isEligible() knows nothing about
   arc order — so a `once` follow-up target must be unlocked by the very choice
   that queues it. Otherwise the open deck can draw the finale before its own
   set-up (up-vision-final's 82 slides landing before v7's 31), and because it is
   `once` the queued copy is then silently discarded.
   Repeatable pool cards are exempt: the reorg pair share the engine's reorg_looms
   flag and are deliberately unordered. */
{
  const byId = new Map(CARDS.map((c) => [c.id, c]));
  for (const card of CARDS) {
    for (const side of ["left", "right"]) {
      const followup = card[side].followup;
      if (!followup) continue;
      const target = byId.get(followup.card);
      if (!target || !target.once) continue;
      const required = target.requiresFlags || [];
      const granted = card[side].setFlags || [];
      assert.ok(required.length,
        `${card.id}.${side} -> ${target.id}: a once follow-up must be flag-gated, else the deck draws it unbidden`);
      assert.ok(required.some((f) => granted.includes(f)),
        `${card.id}.${side} -> ${target.id}: must set one of its gate flags [${required}], sets [${granted}]`);
    }
  }
}

/* mechanics: no cheap bespoke endings (must sit behind once or a flag gate) */
for (const card of CARDS) {
  for (const side of ["left", "right"]) {
    if (!card[side].ending) continue;
    assert.ok(card.once || (card.requiresFlags || []).length,
      `${card.id}.${side}: bespoke ending must be once-gated or flag-gated`);
  }
}

/* mechanics: sane weights and quarter windows */
for (const card of CARDS) {
  assert.ok((card.weight || 1) <= 3, `${card.id} weight within cap`);
  assert.ok((card.minQuarter || 1) <= 12, `${card.id} reachable before the final quarter`);
  if (card.maxQuarter) assert.ok(card.maxQuarter >= (card.minQuarter || 1), `${card.id} quarter window sane`);
}

/* every ritual slot in the engine cycle has at least one card */
for (const ritual of RITUAL_CYCLE) {
  assert.ok(CARDS.some((c) => c.kind === "ritual" && c.ritual === ritual), `ritual card exists: ${ritual}`);
}

/* homilies: unique ids, all reachable, all attributed */
{
  const seen = new Set();
  for (const homily of HOMILIES) {
    assert.ok(!seen.has(homily.id), `unique homily id: ${homily.id}`);
    seen.add(homily.id);
    assert.ok(homily.text && homily.text.length <= 200, `${homily.id} laminate-sized`);
    assert.ok(homily.attribution, `${homily.id} attributed`);
  }
  for (const homily of HOMILIES) {
    assert.ok(homiliesReferenced.has(homily.id), `homily is earnable from some card: ${homily.id}`);
  }
}

/* endings: engine set complete, bespoke ones reachable, docs valid */
{
  const DOCS = new Set(["hr-letter", "press-release", "memo", "leaving-card", "autoreply", "calendar", "org-chart", "plaque", "email"]);
  const seen = new Set();
  for (const ending of ENDINGS) {
    assert.ok(!seen.has(ending.id), `unique ending id: ${ending.id}`);
    seen.add(ending.id);
    assert.ok(DOCS.has(ending.doc), `${ending.id} doc flavour valid: ${ending.doc}`);
    assert.ok(ending.title && ending.body && ending.epitaph, `${ending.id} complete`);
    assert.ok(endingsReferenced.has(ending.id), `ending is reachable: ${ending.id}`);
  }
  for (const id of ENGINE_ENDINGS) {
    assert.ok(endingIds.has(id), `engine ending has content: ${id}`);
  }
}

/* volume: the game needs a career's worth of material */
const nonRitual = CARDS.filter((c) => c.kind !== "ritual");
assert.ok(nonRitual.length >= 100, `enough decision cards: ${nonRitual.length}`);
assert.ok(HOMILIES.length >= 40, `enough laminated wisdom: ${HOMILIES.length}`);
assert.ok(ENDINGS.length >= 15, `enough exits: ${ENDINGS.length}`);
const early = nonRitual.filter((c) => !c.minQuarter || c.minQuarter <= 1).length;
assert.ok(early >= 12, `enough early-game cards: ${early}`);

console.log(`span-of-control content valid: ${nonRitual.length} cards, ${HOMILIES.length} homilies, ${ENDINGS.length} endings`);
