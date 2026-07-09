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
assert.ok(nonRitual.length >= 18, `enough decision cards: ${nonRitual.length}`);
assert.ok(HOMILIES.length >= 12, `enough laminated wisdom: ${HOMILIES.length}`);
assert.ok(ENDINGS.length >= 10, `enough exits: ${ENDINGS.length}`);
const early = nonRitual.filter((c) => !c.minQuarter || c.minQuarter <= 1).length;
assert.ok(early >= 12, `enough early-game cards: ${early}`);

console.log(`span-of-control content valid: ${nonRitual.length} cards, ${HOMILIES.length} homilies, ${ENDINGS.length} endings`);
