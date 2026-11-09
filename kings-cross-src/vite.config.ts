import { defineConfig, parseAst } from 'vite';
import type { Plugin } from 'vite';

// The shared "← Almanac" back button (see /almanac-back.js at the repo root) is a classic
// script. Vite would warn that it cannot bundle it, so it is injected after bundling, in
// the production build only (the dev server does not serve the repo root).
const almanacBack = (): Plugin => ({
  name: 'almanac-back',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: () => [{ tag: 'script', attrs: { defer: true, src: '/almanac-back.js' }, injectTo: 'body' }],
  },
});

// ---- the GLSL squeeze ------------------------------------------------------------------------------------------------------------------------------
// A shader is a template string, and the minifier ships a string as written: its comments, its indentation, its trailing blanks. three.js's own shaders (its build
// marks them `/* glsl */`, a few with their comments) and this page's (materials.ts, lighting.ts, weather.ts and the rest, marked the same way) come to about 800 B
// of the gzipped bundle. The production build strips from each marked template what a GLSL compiler ignores, and nothing else: a template with no marker is not
// touched, nor is anything outside a template, nor a `${...}` hole (it is code, read as such, never as text).
//
// Every newline stays, a blank line included: a line keeps its number, so the source maps (which this plugin does not rewrite) stay true to the line, and a `#define`,
// `#if` or `#include` keeps its own line. Dropping the blank lines would save another 50 B and put every line after a squeezed template out of true.

/** Stands for a `${...}` while a template's text is squeezed (a private-use character that no shader holds). */
const HOLE = '';

/**
 * The text of a template literal's parts as written, escapes unread, squeezed: the comments gone (a block comment leaves one space, or its newlines), the white space beside
 * every newline gone, a run of spaces and tabs one space. A `//` comment ends at a newline or at a `\n` escape (which GLSL reads as a newline); a hole lying in a comment goes
 * with it, and the text is then left as it was (null) like the others the squeeze cannot make certain of: a backslash before white space (a line continued, or an escape that
 * trimming would turn into one) and a block comment of several lines that sits in a `#` line (it would end that line where the comment did).
 */
export function squeezeGlslParts(parts: readonly string[]): string[] | null {
  if (parts.some((p) => p.includes(HOLE) || /\\[ \t\r\n]/.test(p))) return null;
  const text = parts.reduce((s, p, i) => `${s}${HOLE}${i}${HOLE}${p}`);
  let unsure = false;
  const squeezed = text
    .replace(/\/\*[\s\S]*?\*\/|\/\/(?:[^\n\\]|\\[^n])*/g, (c, at: number) => {
      if (c[1] !== '*') return '';
      const newlines = c.split('\n').length - 1;
      if (newlines && /^[ \t]*#/.test(text.slice(text.lastIndexOf('\n', at - 1) + 1, at))) unsure = true;
      return newlines ? '\n'.repeat(newlines) : ' ';
    })
    .replace(/[ \t\r]*\n[ \t]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
  if (unsure) return null;
  const out: string[] = [];
  let from = 0;
  for (const m of squeezed.matchAll(new RegExp(`${HOLE}(\\d+)${HOLE}`, 'g'))) {
    out.push(squeezed.slice(from, m.index));
    from = m.index + m[0].length;
  }
  out.push(squeezed.slice(from));
  return out.length === parts.length ? out : null; // (fewer: a hole went with its comment)
}

interface AstNode {
  type: string;
  start: number;
  end: number;
  quasis?: { start: number; end: number; value: { raw: string } }[];
  [key: string]: unknown;
}

/**
 * The edits (from, to, text) that squeeze one template literal's parts. The parser reads a part's range as its text alone (JavaScript) or from the backtick or `}`
 * to the `${` or backtick (TypeScript), so each part is found by the range that holds exactly its raw text; if one does not (CRLF line ends: the raw text is not
 * the source's), the template is left as it was.
 */
function templateEdits(code: string, node: AstNode): [number, number, string][] {
  const quasis = node.quasis ?? [];
  const spans = quasis.map((q, i) => [[q.start, q.end], [q.start + 1, q.end - (i === quasis.length - 1 ? 1 : 2)]].find(([from, to]) => code.slice(from, to) === q.value.raw));
  const out = squeezeGlslParts(quasis.map((q) => q.value.raw));
  if (!out || spans.some((s) => !s)) return [];
  return spans.flatMap((s, i) => (s && out[i] !== code.slice(s[0], s[1]) ? [[s[0], s[1], out[i] ?? ''] as [number, number, string]] : []));
}

/** `code` with every template literal that follows a `/* glsl *\/` marker squeezed, and the same string if there is none. `lang` is how the parser reads it. */
export function squeezeGlsl(code: string, lang: 'js' | 'ts' = 'js'): string {
  const opens = new Set<number>(); // where each marked template's backtick is, which a template literal in the syntax tree must start at (not a marker in a string or a comment)
  for (const m of code.matchAll(/\/\* glsl \*\/\s*`/g)) opens.add(m.index + m[0].length - 1);
  if (!opens.size) return code;
  const [first, last] = [Math.min(...opens), Math.max(...opens)];
  const edits: [number, number, string][] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    const node = n as AstNode;
    if (typeof node.end === 'number' && (node.end <= first || node.start > last)) return; // (no marked template in it)
    if (node.type === 'TemplateLiteral' && opens.has(node.start)) edits.push(...templateEdits(code, node));
    for (const key in node) visit(node[key]);
  };
  visit(parseAst(code, { lang }));
  let out = code;
  for (const [from, to, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, from) + text + out.slice(to);
  return out;
}

export const glslSqueeze = (): Plugin => ({
  name: 'glsl-squeeze',
  apply: 'build',
  enforce: 'pre', // (the marker is a comment, which the TypeScript transform drops)
  transform(code, id) {
    const file = id.split('?', 1)[0] ?? id;
    if (!/\.[cm]?[jt]s$/.test(file) || !code.includes('/* glsl */')) return null;
    try {
      const out = squeezeGlsl(code, /ts$/.test(file) ? 'ts' : 'js');
      return out === code ? null : { code: out, map: null }; // (every line keeps its number, so the map stays true)
    } catch (e) {
      this.warn(`glsl-squeeze left ${file} as it was: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  },
});

// ---- the dev server's JSON imports ----------------------------------------------------------------------------------------------------------------
// Node will not import a .json file without `with { type: 'json' }`, so the sources carry it (the node tests load them). Vite drops that attribute from a static import
// before the browser sees it, but leaves it on a dynamic `import('./x.json', { with: { type: 'json' } })`; its dev server serves every JSON module as JavaScript, and a
// browser holds a module with that attribute to a JSON MIME type, so the import fails ("Failed to fetch dynamically imported module": Edinburgh Waverley's
// waverley-scene.ts, whose station then reads "model unavailable"). The build is not affected: rollup reads the attribute and bundles the JSON. So the attribute is
// dropped from the dev server's dynamic JSON imports, as Vite itself drops it from a static one, and nothing else changes (the source, Node and the build keep it).

const JSON_ATTRIBUTES = /^\{\s*with\s*:\s*\{\s*type\s*:\s*(['"])json\1\s*,?\s*\}\s*,?\s*\}$/;

/** `code` (JavaScript) with the `{ with: { type: 'json' } }` taken off every `import('<string>', ...)` in it, and the same string if there is none. */
export function dropJsonImportAttributes(code: string): string {
  if (!/\bimport\s*\(/.test(code) || !/\btype\s*:\s*['"]json['"]/.test(code)) return code;
  const edits: [number, number][] = []; // (the end of the specifier, the end of the call)
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    const node = n as AstNode & { source?: AstNode; options?: AstNode | null };
    if (node.type === 'ImportExpression' && node.source?.type === 'Literal' && node.options && JSON_ATTRIBUTES.test(code.slice(node.options.start, node.options.end))) {
      edits.push([node.source.end, node.end]);
    }
    for (const key in node) visit(node[key]);
  };
  visit(parseAst(code, { lang: 'js' }));
  let out = code;
  for (const [from, to] of edits.sort((a, b) => b[0] - a[0])) out = `${out.slice(0, from)})${out.slice(to)}`;
  return out;
}

export const devJsonImports = (): Plugin => ({
  name: 'dev-json-imports',
  apply: 'serve',
  enforce: 'post', // (TypeScript is JavaScript by now, and Vite reads the imports after this)
  transform(code, id) {
    const file = id.split('?', 1)[0] ?? id;
    if (!/\.[cm]?[jt]sx?$/.test(file)) return null;
    try {
      const out = dropJsonImportAttributes(code);
      return out === code ? null : { code: out, map: null }; // (the map is not rewritten: a few columns on one line move)
    } catch (e) {
      this.warn(`dev-json-imports left ${file} as it was: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  },
});

// ---- the squeeze of three.js's own shader strings -------------------------------------------------------------------------------------------------------
// three's build writes each of its shaders as a plain string, `var lights_fragment_begin = "\n\tvec3 geometryPosition = ...\n\t...";`, with the comments and the blank lines
// taken out already and the indentation left in, a tab to a nesting level and a space to an argument. That is 142 strings (the 140 chunks and programs that
// ShaderChunk and ShaderLib hold, and the two the variance shadow map draws with), and the indentation and the runs of spaces are about 610 B of the gzipped bundle.
// The production build strips from each what the GLSL squeeze above strips from a marked template (white space beside a newline, a run of spaces to one, a comment if
// one is left), reading the string as the JavaScript that it is. Every newline stays, so a line keeps its number: the lines a compile error prints are the lines of
// three's source, and three's own `#include` and `#pragma unroll_loop` patterns, which read a line start and `\s`, match as they did.
//
// What reads these strings as text, besides the GPU's compiler: three's own patterns (the `#include <name>` line, the unrolled loop), and the page's own matches in an
// `onBeforeCompile` hook and in lighting.ts (every one a one-line `#include <name>` or a one-line phrase that has no run of spaces in it; the page's tests,
// tools/tests/three-squeeze*.test.ts, hold each of them to the squeezed text and run the hooks on it). A match that spans a line break or a run of white space would
// stop matching in the build and in no test of a dev server, which is the case those tests are there to catch.

/**
 * Whether `text` reads as GLSL, which is what a three.js string with a newline in it is, today: a preprocessor line or a declaration. Only such a string is squeezed;
 * a message or a path would lose its `//`.
 */
const readsAsGlsl = (text: string): boolean => /^[ \t]*#[ \t]*(?:if|ifdef|ifndef|else|elif|endif|define|undef|include|extension|version|pragma)\b|\bvoid[ \t]+\w+[ \t]*\(|\b(?:uniform|varying|attribute|precision)[ \t]+\w|\b(?:float|int|bool|vec[234]|mat[234])[ \t]+\w+[ \t]*[=;(\[,]/m.test(text);

/** The string `text` squeezed as the GLSL squeeze squeezes a template (the same function, on the string's own characters), or null: nothing to squeeze, or no certainty, or not GLSL. */
export function squeezeGlslText(text: string): string | null {
  if (!text.includes('\n') || !readsAsGlsl(text)) return null;
  const squeezed = squeezeGlslParts([text])?.[0];
  return squeezed === undefined || squeezed === text ? null : squeezed;
}

/** three.js's `three.module.js` with each of its top-level string declarations (`var name = "...";`) that reads as many-line GLSL squeezed, and the same string if there is none. */
export function squeezeThreeGlsl(code: string): string {
  const edits: [number, number, string][] = [];
  for (const statement of (parseAst(code, { lang: 'js' }) as unknown as { body: AstNode[] }).body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declarator of statement.declarations as AstNode[]) {
      const init = declarator.init as AstNode | null;
      const squeezed = init?.type === 'Literal' && typeof init.value === 'string' ? squeezeGlslText(init.value) : null;
      if (init && squeezed !== null) edits.push([init.start, init.end, JSON.stringify(squeezed)]);
    }
  }
  let out = code;
  for (const [from, to, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, from) + text + out.slice(to);
  return out;
}

export const threeGlslSqueeze = (): Plugin => ({
  name: 'three-glsl-squeeze',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    const file = (id.split('?', 1)[0] ?? id).replace(/\\/g, '/');
    if (!file.endsWith('/three/build/three.module.js')) return null;
    try {
      const out = squeezeThreeGlsl(code);
      return out === code ? null : { code: out, map: null }; // (a string stays on its own line, and nothing follows it there but its `;`, so the map stays true)
    } catch (e) {
      this.warn(`three-glsl-squeeze left ${file} as it was: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  },
});

// The Vite project root is web/, so the repo's responsive test (which treats every
// top-level <dir>/index.html as a published document) never sees this source index.html.
// The build goes straight into the served directory, ../kings-cross/, with relative URLs
// so it works under the GitHub Pages subpath.
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [almanacBack(), glslSqueeze(), threeGlslSqueeze(), devJsonImports()],
  build: {
    outDir: '../../kings-cross',
    emptyOutDir: true,
    target: 'es2022',
    // three.js alone is about 700 kB minified, so the default 500 kB advisory always fires.
    // The size budget that matters is the gzipped total (2 MB, see the scoring rubric).
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/relay': {
        target: process.env.KX_RELAY_TARGET ?? 'http://127.0.0.1:8787',
        changeOrigin: true, // The relay checks Host; preserve its loopback-only guard.
        rewrite: (path) => path.replace(/^\/relay(?=\/|$)/, ''),
      },
    },
  },
});
