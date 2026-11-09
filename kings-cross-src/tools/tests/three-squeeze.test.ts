// The build's squeeze of three.js's own shader strings (vite.config.ts, `threeGlslSqueeze`): what it strips, what it must leave alone, and that nothing which reads those strings as
// text stops reading them. Two things read them besides the GPU's compiler: three's own patterns (the `#include <name>` line and the `#pragma unroll_loop` block) and this page's
// matches (the `.replace('#include <common>', ...)` of an `onBeforeCompile` hook, lighting.ts's two patches of a chunk). A dev server and the page's other tests run on three's
// strings as three wrote them, so a match that spans a line break or a run of white space would pass them all and match nothing in the build: these tests hold every match to the
// squeezed text. The hooks run on that text, lighting.ts loaded on it, and the GPU compiling it, are tools/tests/three-squeeze-hooks.test.ts and the browser check recorded with it.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { parseAst } from 'vite';
import config, { squeezeGlslParts, squeezeGlslText, squeezeThreeGlsl, threeGlslSqueeze } from '../../vite.config.ts';
import { bare, fresh, includePattern, lines, resolveIncludes, threeSource as source, unrollLoops, unrollLoopPattern } from './three-text.ts';

const GLSL = '#ifdef A\n\tfloat x;   // one\n\n\t\tvec3   y = vec3( x );\t\n#endif\n';
const SQUEEZED = '#ifdef A\nfloat x;\n\nvec3 y = vec3( x );\n#endif\n';
/** A declaration of a string as three's build writes it. */
const decl = (name: string, value: string): string => `var ${name} = ${JSON.stringify(value)};`;

// ---- the function and the plugin, on small modules -------------------------------------------------------------------------------------------------

test('squeezeGlslText: a many-line GLSL string loses its indentation, its trailing blanks, its comments and its runs of spaces, and keeps every newline and every other character', () => {
  assert.equal(squeezeGlslText(GLSL), SQUEEZED);
  assert.equal(squeezeGlslText(GLSL)?.split('\n').length, GLSL.split('\n').length, 'the same lines, a blank one too');
  assert.equal(squeezeGlslText(SQUEEZED), null, 'a second pass finds nothing to do');
});

test('squeezeGlslText: a string with no newline, one that is not GLSL, a continued line, and one already squeezed are left as they were (null)', () => {
  assert.equal(squeezeGlslText('  float   x;  '), null, 'one line: three keeps its one-line shaders as they are, and so does the squeeze');
  assert.equal(squeezeGlslText('See https://threejs.org/docs\n  for   more'), null, 'a message with a URL in it would lose its // as a comment');
  assert.equal(squeezeGlslText('#define A 1 \\\n   2\n'), null, 'a line continued by a backslash, which trimming would join to the next');
  assert.equal(squeezeGlslText('#ifdef A\nfloat x;\n#endif\n'), null);
});

test('squeezeGlslText: a string reads as GLSL by a preprocessor line at the start of any of its lines, a function, a uniform or a declaration, and by nothing else', () => {
  assert.equal(squeezeGlslText('#define A   1\n   y'), '#define A 1\ny', 'a preprocessor line');
  assert.equal(squeezeGlslText('words\n#define A   1\n'), 'words\n#define A 1\n', 'on any line of the string');
  assert.equal(squeezeGlslText('void   f(  )\n  {}'), 'void f( )\n{}', 'a function');
  assert.equal(squeezeGlslText('uniform   x\n  y'), 'uniform x\ny', 'a uniform');
  assert.equal(squeezeGlslText('float   x;\n   y'), 'float x;\ny', 'a declaration');
  assert.equal(squeezeGlslText('see the #define   docs\n  at http://example.com'), null, 'a # that does not start a line, in a message');
});

test('squeezeThreeGlsl: the top-level declarations of many-line GLSL strings are squeezed (var, const or let, either quote), and nothing else in the module is touched', () => {
  const code = [
    decl('one', GLSL),
    `const two = '#ifdef A\\n\\tfloat x;   // one\\n\\n\\t\\tvec3   y = vec3( x );\\t\\n#endif\\n';`,
    `let three = ${JSON.stringify(GLSL)}, four = ${JSON.stringify('#ifdef B\n  float y;\n#endif')};`,
    `function f() { const nested = ${JSON.stringify(GLSL)}; return [${JSON.stringify(GLSL)}, { k: ${JSON.stringify(GLSL)} }]; }`,
    decl('message', 'See https://threejs.org/\n  for details'),
    decl('oneLine', '  float   x;  '),
    'export { one };',
  ];
  const out = squeezeThreeGlsl(code.join('\n'));
  assert.deepEqual(out.split('\n'), [
    decl('one', SQUEEZED),
    decl('two', SQUEEZED).replace('var ', 'const '),
    `let three = ${JSON.stringify(SQUEEZED)}, four = ${JSON.stringify('#ifdef B\nfloat y;\n#endif')};`,
    code[3], code[4], code[5], code[6],
  ]);
  assert.equal(squeezeThreeGlsl(out), out, 'a second pass changes nothing');
  assert.equal(squeezeThreeGlsl('var a = 1;\n'), 'var a = 1;\n', 'a module with nothing in it');
  assert.throws(() => squeezeThreeGlsl('var = ;'), 'a module that does not parse is an error here, which the plugin reports');
});

test('threeGlslSqueeze: the build plugin reads three.module.js only (by a Windows path, or with a query, too), and leaves another module, a module with nothing to squeeze and one that does not parse as it was', () => {
  const plugin = threeGlslSqueeze();
  assert.equal(plugin.apply, 'build', 'the dev server is not touched');
  assert.equal(plugin.enforce, 'pre');
  const warned: string[] = [];
  const run = (code: string, id: string): unknown => (plugin.transform as (this: { warn(m: string): void }, code: string, id: string) => unknown).call({ warn: (m) => warned.push(m) }, code, id);
  const code = `${decl('s', GLSL)}\n`;
  for (const id of ['/p/node_modules/three/build/three.module.js', 'C:\\p\\node_modules\\three\\build\\three.module.js', '/p/node_modules/three/build/three.module.js?v=3']) {
    assert.deepEqual(run(code, id), { code: `${decl('s', SQUEEZED)}\n`, map: null }, id);
  }
  for (const id of ['/p/node_modules/three/build/three.core.js', '/p/node_modules/three/examples/jsm/controls/OrbitControls.js', '/p/web/src/materials.ts', '/p/three.module.js', '/p/node_modules/three/build/three.module.js.map']) {
    assert.equal(run(code, id), null, id);
  }
  assert.equal(run(`${decl('s', SQUEEZED)}\n`, '/p/node_modules/three/build/three.module.js'), null, 'a module already squeezed is no change');
  assert.deepEqual(warned, []);
  assert.equal(run('var = ;', '/p/node_modules/three/build/three.module.js'), null);
  assert.equal(warned.length, 1);
  assert.match(warned[0] ?? '', /three-glsl-squeeze left \/p\/node_modules\/three\/build\/three\.module\.js as it was/);
});

test('vite.config.ts: the production build runs both squeezes', () => {
  const names = (config.plugins as { name: string }[]).map((p) => p.name);
  assert.ok(names.includes('glsl-squeeze') && names.includes('three-glsl-squeeze'), names.join());
  assert.ok(names.indexOf('glsl-squeeze') < names.indexOf('three-glsl-squeeze'), 'the page\'s squeeze first: both are pre and each reads the code the one before left');
});

// ---- three's own module -----------------------------------------------------------------------------------------------------------------------------

const squeezedSource = squeezeThreeGlsl(source);

/** Every top-level `name = "string"` of a module, in order. */
function topLevelStrings(code: string): Map<string, string> {
  const strings = new Map<string, string>();
  type N = { type: string; value?: unknown; id: { name: string }; init: { type: string; value: unknown } | null; declarations: N[] };
  for (const statement of (parseAst(code, { lang: 'js' }) as unknown as { body: N[] }).body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const d of statement.declarations) if (d.init?.type === 'Literal' && typeof d.init.value === 'string') strings.set(d.id.name, d.init.value);
  }
  return strings;
}
const before = topLevelStrings(source);
const after = topLevelStrings(squeezedSource);
const multiLine = [...before].filter(([, v]) => v.includes('\n'));
/** The squeeze written again, for strings with no block comment in them (three's build has taken them out, and a line comment on a last line, which it leaves): the comment gone, the white space beside a newline gone, a run of it one space. */
const squeezedAgain = (s: string): string => s.replace(/\/\/[^\n]*/g, '').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/[ \t]{2,}/g, ' ');
/** What the build ships for a string three registers (a chunk or a program), found by the string itself: the same string under two names squeezes the same. */
const shipped = new Map(multiLine.map(([name, v]) => [v, after.get(name) as string]));
const ship = (s: string): string => shipped.get(s) ?? s;

test('the squeeze of three.module.js: the many-line strings that three holds are those of ShaderChunk and ShaderLib and the two of the variance shadow map (142 of them, with three 0.187)', () => {
  const registered = new Set<string>([...Object.values(THREE.ShaderChunk), ...Object.values(THREE.ShaderLib).flatMap((p) => [p.vertexShader, p.fragmentShader])]);
  const declared = new Set(before.values());
  for (const [name, text] of Object.entries(THREE.ShaderChunk)) assert.ok(declared.has(text), `chunk ${name} is a declaration of a string in three.module.js (or is not three's own text)`);
  assert.deepEqual(multiLine.filter(([, v]) => !registered.has(v)).map(([n]) => n).sort(), ['fragment', 'vertex'], 'the strings that no ShaderChunk or ShaderLib holds: the blur pass of the variance shadow map (WebGLShadowMap). Another name is a string to look at: is it a shader, and is it read as text anywhere?');
  assert.ok(multiLine.length >= 100, `three's many-line strings: ${multiLine.length} (142 with three 0.187)`);
  assert.deepEqual([...after.keys()], [...before.keys()], 'the same declarations, in the same order');
  for (const [name, text] of multiLine) assert.ok(!text.includes('/*'), `${name} has a block comment in it: three's build has taken them out, and the reference squeeze in this test reads only the line kind (a last line's, which three's build leaves)`);
});

test('the squeeze of three.module.js: each string equals the one three wrote once white space and comments are stripped, with its newlines, its lines and its tokens\' edges where they were, and the module is as it was but for them', () => {
  assert.equal(squeezedSource.split('\n').length, source.split('\n').length, 'the module keeps its lines, so a source map stays true');
  const [a, b] = [source.split('\n'), squeezedSource.split('\n')];
  const declaration = /^((?:var|const|let) [\w$]+ = )"(.*)";$/;
  let changed = 0;
  a.forEach((line, i) => {
    if (line === b[i]) return;
    changed++;
    const [x, y] = [declaration.exec(line), declaration.exec(b[i] ?? '')];
    assert.ok(x && y && x[1] === y[1], `the one line of the module that differs at ${i + 1} is a declaration of a string, and its name the same`);
  });
  let saved = 0;
  for (const [name, text] of multiLine) {
    const squeezed = after.get(name) as string;
    assert.equal(bare(squeezed), bare(text), `${name}: the same once white space and comments are stripped`);
    assert.equal(squeezed.split('\n').length, text.split('\n').length, `${name}: every newline kept, a blank line too`);
    assert.deepEqual(lines(squeezed), lines(text), `${name}: each line the same, its tokens neither joined nor split`);
    assert.equal(squeezed, squeezedAgain(text), `${name}: as an independent reading of the rule has it`);
    assert.ok(!squeezed.includes('//'), `${name}: no comment left`);
    assert.equal(squeezeGlslText(squeezed), null, `${name}: a second pass changes nothing`);
    assert.ok(squeezed.length <= text.length);
    saved += text.length - squeezed.length;
  }
  assert.equal(changed, multiLine.filter(([n, v]) => after.get(n) !== v).length);
  assert.ok(changed >= 130, `most of the 142 had indentation to lose (138 did): ${changed}`);
  assert.ok(saved >= 4000, `characters saved ${saved} (4,545 with three 0.187)`);
  assert.ok(gzipSync(source).length - gzipSync(squeezedSource).length >= 800, `a gzipped kilobyte, as the page's budget counts (1,009 B with three 0.187): ${gzipSync(source).length - gzipSync(squeezedSource).length}`);
  for (const [name, text] of before) if (!text.includes('\n')) assert.equal(after.get(name), text, `${name}: a one-line string is left alone`);
});

// ---- three's own patterns ---------------------------------------------------------------------------------------------------------------------------

const programs = Object.entries(THREE.ShaderLib).flatMap(([name, p]) => [{ name: `${name}.vertex`, text: p.vertexShader }, { name: `${name}.fragment`, text: p.fragmentShader }]);
const chunksOriginal = THREE.ShaderChunk as unknown as Record<string, string>;
const chunksSqueezed = Object.fromEntries(Object.entries(chunksOriginal).map(([k, v]) => [k, ship(v)]));

test('three\'s #include pattern reads the squeezed text as it read the original: the same includes, in the same order, in every chunk and every program, and the same text once they are resolved', () => {
  assert.equal(includePattern.flags, 'gm');
  assert.ok(fresh(includePattern).test('\t#include <common>') && !fresh(includePattern).test('float x; #include <common>'), 'the pattern is the line-start one three has used');
  const names = (text: string): string[] => [...text.matchAll(includePattern)].map((m) => m[1] as string);
  let includes = 0;
  for (const [name, text] of [...Object.entries(chunksOriginal), ...programs.map((p) => [p.name, p.text] as const)]) {
    const [was, is] = [names(text), names(ship(text))];
    assert.deepEqual(is, was, `${name}: the same includes`);
    includes += is.length;
    for (const line of ship(text).split('\n')) if (/#\s*include/.test(line)) assert.ok(/^#include <[\w./]+>$/.test(line), `${name}: an include line starts at its column 0 and has one space (${line})`);
  }
  assert.ok(includes > 1000, `the includes in three's chunks and programs (${includes}; 1,494 with three 0.187)`);
  for (const { name, text } of programs) {
    const [was, is] = [resolveIncludes(text, chunksOriginal), resolveIncludes(ship(text), chunksSqueezed)];
    assert.deepEqual(lines(is), lines(was), `${name}: the same program once it is resolved`);
    assert.equal(bare(is), bare(was), name);
    assert.ok(!/#include <[\w./]+>/.test(is), `${name}: nothing left to resolve`);
  }
});

test('three\'s #pragma unroll_loop pattern reads the squeezed text as it read the original: the same loops in every program, unrolled to the same text', () => {
  assert.equal(unrollLoopPattern.flags, 'g');
  let loops = 0;
  const looped: string[] = [];
  for (const { name, text } of programs) {
    const [was, is] = [unrollLoops(resolveIncludes(text, chunksOriginal)), unrollLoops(resolveIncludes(ship(text), chunksSqueezed))];
    assert.equal(is.loops, was.loops, `${name}: the same number of loops unrolled (${was.loops})`);
    assert.deepEqual(lines(is.text), lines(was.text), `${name}: unrolled to the same text`);
    assert.equal(/#pragma unroll_loop_(start|end)/.test(is.text), false, `${name}: no pragma left behind, which would be the pattern not matching`);
    loops += is.loops;
    if (is.loops) looped.push(name);
  }
  assert.ok(loops >= 100 && looped.includes('lambert.fragment') && looped.includes('phong.fragment') && looped.includes('physical.fragment'), `the lit programs have their light loops (${loops} loops, 114 with three 0.187, in ${looped.join(', ')})`);
  // the pattern asks for white space between the loop's closing brace and its end pragma, and between its start pragma and its `for`: a newline is one
  assert.equal(unrollLoops('#pragma unroll_loop_start\nfor ( int i = 0; i < 2; i ++ ) {\nx[ i ];\n}\n#pragma unroll_loop_end\n').text, '\nx[ 0 ];\n\nx[ 1 ];\n\n');
});

// ---- the page's own matches --------------------------------------------------------------------------------------------------------------------------

type Match = { file: string; line: number; inHook: boolean; method: string; kind: 'string' | 'regex' | 'dynamic'; text: string; flags: string; chunk: string | null };
type Node = { type: string; start: number; end: number; [key: string]: unknown };
const MATCHERS = new Set(['replace', 'replaceAll', 'includes', 'indexOf', 'lastIndexOf', 'match', 'matchAll', 'search', 'startsWith', 'endsWith', 'test', 'exec', 'split']);
const DIRECTIVE = /#\s*(?:include|pragma|define|undef|if|ifdef|ifndef|else|elif|endif|extension|version)\b/;

/**
 * Every place a module matches against shader text: a call of a string or pattern method inside a function assigned to an `onBeforeCompile`, one anywhere that matches a
 * preprocessor line (`'#include <common>'`), and each patch of one of three's chunks (`patchChunk('name', from, to)` in lighting.ts).
 */
function shaderMatches(file: string, code: string): Match[] {
  const found: Match[] = [];
  const lineOf = (offset: number): number => code.slice(0, offset).split('\n').length;
  const first = (args: Node[], chunk: string | null, inHook: boolean, method: string): void => {
    const a = args[0];
    if (!a) return;
    let [kind, text, flags]: [Match['kind'], string, string] = ['dynamic', code.slice(a.start, a.end), ''];
    if (a.type === 'Literal' && typeof a.value === 'string') [kind, text] = ['string', a.value];
    else if (a.type === 'Literal' && a.regex) [kind, text, flags] = ['regex', (a.regex as { pattern: string }).pattern, (a.regex as { flags: string }).flags];
    else if (a.type === 'TemplateLiteral' && !(a.expressions as unknown[]).length) [kind, text] = ['string', (a.quasis as { value: { cooked: string } }[])[0]?.value.cooked ?? ''];
    if (inHook || chunk !== null || DIRECTIVE.test(text)) found.push({ file, line: lineOf(a.start), inHook, method, kind, text, flags, chunk });
  };
  const walk = (n: unknown, inHook: boolean): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) walk(x, inHook); return; }
    const node = n as Node;
    const left = node.left as Node | undefined;
    if (node.type === 'AssignmentExpression' && left?.type === 'MemberExpression' && (left.property as Node).name === 'onBeforeCompile') return walk(node.right, true);
    const callee = node.callee as Node | undefined;
    if (node.type === 'CallExpression' && callee?.type === 'MemberExpression' && MATCHERS.has((callee.property as Node).name as string)) first(node.arguments as Node[], null, inHook, (callee.property as Node).name as string);
    if (node.type === 'CallExpression' && callee?.type === 'Identifier' && callee.name === 'patchChunk') {
      const [chunk, from] = node.arguments as Node[];
      first([from as Node], chunk?.value as string, inHook, 'patchChunk');
    }
    for (const key in node) if (key !== 'type') walk(node[key], inHook);
  };
  walk(parseAst(code, { lang: 'ts' }), false);
  return found;
}

const webSrc = new URL('../../web/src/', import.meta.url);
const matches = readdirSync(webSrc).filter((f) => f.endsWith('.ts')).flatMap((f) => shaderMatches(f, readFileSync(new URL(f, webSrc), 'utf8')));
/** Text the page defines itself, which a hook looks for to see whether another has added it (it is written on one line, and the page's own squeeze keeps it so). */
const PAGE_OWN_TEXT = new Set(['float coverGroundAt']);

test('every match the page makes on three\'s shader text, in a hook and in lighting.ts, is a one-line phrase or a pattern that the squeezed text still holds', () => {
  const where = (m: Match): string => `${m.file}:${m.line}`;
  const files = new Set(matches.map((m) => m.file));
  for (const f of ['atmosphere.ts', 'lighting.ts', 'materials.ts', 'ole.ts', 'track.ts', 'train-geom.ts']) assert.ok(files.has(f), `the hooks of ${f} are found by this scan (it reads every file of web/src: ${[...files].join(', ')})`);
  assert.ok(matches.filter((m) => m.inHook).length >= 25 && matches.filter((m) => m.chunk).length === 2, `the page's matches: ${matches.length}`);
  const pool = (text: (s: string) => string): string[] => [...Object.values(chunksOriginal), ...programs.map((p) => p.text)].map(text);
  const [originalText, squeezedText] = [pool((s) => s), pool(ship)];
  for (const m of matches) {
    assert.notEqual(m.kind, 'dynamic', `${where(m)}: a match on shader text must be a literal here (a computed one cannot be held to the squeezed text): ${m.text}`);
    if (m.kind === 'string') {
      assert.ok(!m.text.includes('\n'), `${where(m)}: a match that spans a line break stops matching once the indentation is gone: ${JSON.stringify(m.text)}`);
      const squeezed = squeezeGlslParts([m.text]);
      assert.ok(squeezed === null || squeezed[0] === m.text, `${where(m)}: a phrase with a run of spaces or a tab in it stops matching: ${JSON.stringify(m.text)}`);
    }
    const [was, is] = m.chunk !== null
      ? [chunksOriginal[m.chunk] ?? '', chunksSqueezed[m.chunk] ?? '']
      : [originalText.join('\u0000'), squeezedText.join('\u0000')];
    if (m.kind === 'regex') {
      assert.ok(new RegExp(m.text, m.flags).test(was), `${where(m)}: the pattern matches three's text`);
      assert.ok(new RegExp(m.text, m.flags).test(is), `${where(m)}: and the squeezed text (${m.chunk})`);
    } else if (PAGE_OWN_TEXT.has(m.text)) {
      assert.ok(m.inHook && !was.includes(m.text), `${where(m)}: page text, which three does not hold`);
    } else {
      assert.ok(was.includes(m.text), `${where(m)}: ${JSON.stringify(m.text)} is in three's text${m.chunk ? ` of ${m.chunk}` : ''}`);
      assert.ok(is.includes(m.text), `${where(m)}: ${JSON.stringify(m.text)} is in the squeezed text${m.chunk ? ` of ${m.chunk}` : ''}`);
    }
    if (m.chunk === null && m.kind === 'string' && m.text.startsWith('#include <')) {
      const name = /^#include <([\w./]+)>$/.exec(m.text)?.[1] as string;
      assert.ok(name in chunksOriginal, `${where(m)}: ${name} is one of three's chunks`);
      assert.ok(programs.some((p) => ship(p.text).split('\n').includes(m.text)), `${where(m)}: a squeezed program has the line ${m.text} (as a line of its own, as three's includes are)`);
    }
  }
});

test('the scan finds a match that spans lines, one with a run of spaces, and a computed one, in a hook or a patch: the three ways the squeeze can stop a match', () => {
  const hook = (body: string): Match[] => shaderMatches('x.ts', `declare const m: any; m.onBeforeCompile = (shader: any) => { ${body} };`);
  const [multi] = hook('shader.fragmentShader = shader.fragmentShader.replace("#include <common>\\nvarying float v;", "");');
  assert.ok(multi && multi.kind === 'string' && multi.text.includes('\n') && multi.inHook);
  const [spaced] = hook('shader.fragmentShader = shader.fragmentShader.replace("float  x", "");');
  assert.ok(spaced && /\s{2}/.test(spaced.text));
  const [computed] = hook('const from = "#include <common>"; shader.fragmentShader = shader.fragmentShader.replace(from, "");');
  assert.equal(computed?.kind, 'dynamic');
  const [regex] = hook('shader.fragmentShader.match(/float\\s+x/);');
  assert.ok(regex?.kind === 'regex' && regex.text === 'float\\s+x');
  const [patch] = shaderMatches('x.ts', 'patchChunk("lights_fragment_begin", "a ( b )", "c");');
  assert.ok(patch?.chunk === 'lights_fragment_begin' && patch.text === 'a ( b )');
  assert.deepEqual(shaderMatches('x.ts', 'const s = "a  b".replace("c", "d"); s.includes("e");'), [], 'a text method that is not on shader text is not one');
  assert.equal(shaderMatches('x.ts', 'const s = "a".replace("#include <x>", "d");').length, 1, 'but a preprocessor line is, anywhere');
});
