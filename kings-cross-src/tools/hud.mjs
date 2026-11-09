// The page's own overlays: the station switcher, the status and attribution panels, the title and the shared Almanac pill. They are
// drawn over the canvas, so each covers part of every capture (the switcher alone is rows 48-125 of an 800 row frame), and the
// graphical-fidelity rubrics score the model, not the overlay. A station view is therefore shot with them hidden (`--hud off`, the
// default); `--hud on` shows them as a user sees them. Shared by evidence.mjs; everything is pure except `hudPage`, which runs in the
// page (it is serialised with toString, so it takes everything it needs as arguments).

/**
 * What the page overlays, as selectors: `.station-switcher` (web/src/stations.ts), `.hud` (the status and attribution panels) and the
 * title `h1` (web/index.html), and `#almanac-back-host`, the shared back pill that /almanac-back.js adds to the production build.
 */
export const HUD_SELECTORS = Object.freeze(['.station-switcher', '.hud', 'body > h1', '#almanac-back-host']);
/** The id of the style element that hides them; removing it restores the page. */
export const HUD_STYLE_ID = 'evidence-hud-off';
export const HUD_NOTE = 'Station views are shot with the page\'s overlays hidden (the station switcher, the status and attribution panels, the title and the Almanac pill; --hud off, the default) so a capture shows the model and not the overlay, and the overlays are restored after each shot. overview-hud-on and the axis-01 grid views keep them, so the page as a user sees it is still shown; --hud on shows them in every station view.';

/** The `--hud` value: `off` (the default) or `on`. */
export function hudMode(value) {
  if (value === undefined) return 'off';
  if (value === 'on' || value === 'off') return value;
  throw new Error('--hud must be on or off');
}

/** The style that hides the overlays. `display: none` takes no layout with it: each is fixed, and the canvas fills the page. */
export function hudCss(selectors = HUD_SELECTORS) {
  return `${selectors.join(', ')} { display: none !important; }`;
}

/**
 * Runs in the page. `hide` adds the style, `show` removes it, `probe` only looks. Returns, for each selector, how many elements match
 * it and how many of those are drawn (a box, not display none, not visibility hidden, not transparent), and the other overlays still
 * drawn: a child of the body that is not the canvas holder, a script or a style and matches no selector.
 */
export function hudPage(action, selectors, css, styleId) {
  const existing = document.getElementById(styleId);
  if (action === 'hide' && !existing) {
    const style = document.createElement('style');
    style.id = styleId; style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  } else if (action === 'show' && existing) existing.remove();
  const drawn = element => {
    const style = getComputedStyle(element);
    return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
  };
  const rows = selectors.map(selector => {
    const found = [...document.querySelectorAll(selector)];
    return { selector, found: found.length, visible: found.filter(drawn).length };
  });
  const others = [...document.body.children]
    .filter(element => element.id !== 'app' && element.id !== 'fallback' && !['SCRIPT', 'STYLE'].includes(element.tagName) && !selectors.some(selector => element.matches(selector)) && drawn(element))
    .map(element => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`);
  return { rows, others };
}

/**
 * What a mode requires of a probe: with the overlays off, every element found is hidden; on, every element found is drawn; and in
 * either mode at least one is found, or the check would pass for a build whose overlays it has not seen.
 * @param {'on'|'off'} mode
 * @param {{selector:string, found:number, visible:number}[]} rows
 */
export function hudCheck(mode, rows) {
  const found = rows.filter(row => row.found > 0), problems = [];
  if (!found.length) problems.push(`none of ${rows.map(row => row.selector).join(', ')} was found, so --hud ${mode} cannot be checked`);
  for (const row of found) {
    if (mode === 'off' && row.visible > 0) problems.push(`${row.selector}: ${row.visible} of ${row.found} still drawn`);
    if (mode === 'on' && row.visible < row.found) problems.push(`${row.selector}: ${row.found - row.visible} of ${row.found} not drawn`);
  }
  return {
    ok: problems.length === 0, problems,
    hidden: found.filter(row => row.visible === 0).map(row => row.selector),
    shown: found.filter(row => row.visible === row.found).map(row => row.selector),
    absent: rows.filter(row => row.found === 0).map(row => row.selector),
  };
}

/**
 * The overlays around one capture. `evaluate(source)` runs a page expression and returns its value; `settle()` waits for the page to
 * draw a frame. `apply(mode, name)` goes before the shot: off hides the overlays, on only checks that they are drawn; either way it
 * checks what the page now shows, and a failed check puts the page back and throws, so no shot is taken with the overlays half
 * hidden. `restore(mode)` goes after it (in a `finally`): it takes the hiding off and checks that every overlay is drawn again, so
 * the next shot, the labelled overlay-on overview among them, starts from the page as it was.
 */
export function hudController({ evaluate, settle, selectors = HUD_SELECTORS, styleId = HUD_STYLE_ID }) {
  const run = action => evaluate(`(${hudPage.toString()})(${JSON.stringify(action)},${JSON.stringify(selectors)},${JSON.stringify(hudCss(selectors))},${JSON.stringify(styleId)})`);
  return {
    async apply(mode, name) {
      const { rows, others } = await run(mode === 'off' ? 'hide' : 'probe');
      await settle();
      const check = hudCheck(mode, rows);
      if (!check.ok) { await run('show'); throw new Error(`overlays ${mode} check failed for ${name}: ${check.problems.join('; ')}`); }
      return { mode, ...(mode === 'off' ? { hidden: check.hidden } : { shown: check.shown }), absent: check.absent, otherOverlays: others, restored: null };
    },
    async restore(mode) {
      if (mode !== 'off') return true;
      const { rows } = await run('show');
      await settle();
      const check = hudCheck('on', rows);
      if (!check.ok) throw new Error(`the page's overlays did not come back after the capture: ${check.problems.join('; ')}`);
      return true;
    },
  };
}
