// The readable papers of La Ladera (diaries, letters, notes, lists): the merged list and the lookup helpers.
// DATA is written by the lead in papers_*.js; builders read it and never edit it (ask in dev/REQUESTS.md). Contract and filters: content.js and dev/FEATURE-DRAWERS.md.
import { PAPERS_A } from './papers_a.js';
import { PAPERS_B } from './papers_b.js';
import { PAPERS_C } from './papers_c.js';
import { eligible } from './content.js';

export { CONTAINER_KINDS, THEMES, PAPER_KINDS, COVERS, HOME_LOTS, SPECIAL_LOTS, authorOf, eligible, homeMatches, fill, resolvePaper, wordCount } from './content.js';

export const PAPERS = [...PAPERS_A, ...PAPERS_B, ...PAPERS_C];
export const paperById = new Map(PAPERS.map((p) => [p.id, p]));

/** The papers that may sit in a `container` kind of this building (lot) lived in by `hh`. Pure; the placement code draws from this with its own seeded rng. */
export const papersFor = (hh, lot, container) => PAPERS.filter((p) => eligible(p, hh, lot, container));
