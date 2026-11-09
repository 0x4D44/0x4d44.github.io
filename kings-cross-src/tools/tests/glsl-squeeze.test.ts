// The build's GLSL squeeze (vite.config.ts): what it strips from a `/* glsl */` template, and what it must leave alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glslSqueeze, squeezeGlsl, squeezeGlslParts } from '../../vite.config.ts';

/** A module with one marked template holding `body` (written as it would be in the source, so a `\n` here is a real newline and `\\n` an escape). */
const shader = (body: string): string => `const s = /* glsl */\`${body}\`;`;

test('squeezeGlsl: the comments, the indentation and the trailing blanks go; every newline stays, so lines and source maps keep their numbers', () => {
  const body = '\n  // a line comment\n  uniform float x;  // trailing\n\n  /* a block\n     comment */\n  void   main() {\n    gl_FragColor = vec4( 1.0 );   \n  }\n';
  const out = squeezeGlsl(shader(body));
  assert.equal(out, shader('\n\nuniform float x;\n\n\n\nvoid main() {\ngl_FragColor = vec4( 1.0 );\n}\n'));
  assert.equal(out.split('\n').length, shader(body).split('\n').length, 'the same number of lines');
  assert.equal(squeezeGlsl(out), out, 'a second pass changes nothing');
});

test('squeezeGlsl: a block comment inside a line leaves one space, in a # line too', () => {
  assert.equal(squeezeGlsl(shader('float a/* x */b;\n#define K 1 /* y */ 2\n')), shader('float a b;\n#define K 1 2\n'));
});

test('squeezeGlsl: the ${...} holes are code, kept as written (a nested template, a `//` in a string, a `}` in a string), and so are the # lines (#define, #include, #if, #else, #endif)', () => {
  const body = '\n  #define N ${n}u // the samples\n  #include <common>\n  #if ${ a ? \'1\' : "2" } > 1 \n    float k = ${ f(`in ${g}`) }; /* x */\n    vec3 u = ${ \'http://example.com/a\' + "}" };\n  #else\n    float k = 0.0;\n  #endif\n';
  for (const lang of ['js', 'ts'] as const) {
    // (the two parsers give a template's parts different ranges)
    assert.equal(
      squeezeGlsl(shader(body), lang),
      shader('\n#define N ${n}u\n#include <common>\n#if ${ a ? \'1\' : "2" } > 1\nfloat k = ${ f(`in ${g}`) };\nvec3 u = ${ \'http://example.com/a\' + "}" };\n#else\nfloat k = 0.0;\n#endif\n'),
      lang,
    );
  }
});

test('squeezeGlsl: a // that is not a comment is untouched: in a hole, in a JS string or comment, in code around the template', () => {
  const code = "const u = 'http://a.example/b'; // keep this comment, and the  double  space\nconst s = /* glsl */`\n  x // gone\n  ${ 'https://c.example/d' }\n`;\nconst v = \"//  not a comment\";\n";
  const out = squeezeGlsl(code);
  assert.equal(out, "const u = 'http://a.example/b'; // keep this comment, and the  double  space\nconst s = /* glsl */`\nx\n${ 'https://c.example/d' }\n`;\nconst v = \"//  not a comment\";\n");
});

test('squeezeGlsl: a template with no /* glsl */ marker is byte-identical (a plain one, one after another comment, a tagged one, a marker in a string or a comment)', () => {
  const code = [
    'const a = `// not a shader\n    float x;   /* nor this */\n\n`;',
    'const b = /* css */`\n  a { }  // c\n\n`;',
    'const c = tag`\n  // tagged\n  x\n`;',
    "const d = '/* glsl */`'; const e = `\n  // after a string with the marker\n  y\n`;",
    '// /* glsl */`\nconst f = `\n  // after a comment with the marker\n  z\n`;',
    'const g = /* glsl */ foo(`\n  // the marker is not on this template\n  w\n`);',
  ].join('\n');
  assert.equal(squeezeGlsl(code), code);
  assert.equal(squeezeGlsl('const a = 1;'), 'const a = 1;');
  // with no marker the module is not even parsed, so one that does not parse is no error here and comes back as it was
  let unparsable: string | undefined;
  assert.doesNotThrow(() => { unparsable = squeezeGlsl('const = ;'); }, 'a module with no marker is not parsed');
  assert.equal(unparsable, 'const = ;');
});

test('squeezeGlsl: a template with a CRLF in any one of its parts is left whole, though the parts before it could be squeezed', () => {
  const code = 'const s = /* glsl */`a   b ${x}\r\n  c   d`;\n';
  assert.equal(squeezeGlsl(code), code);
  assert.equal(squeezeGlsl(code, 'ts'), code);
});

test('squeezeGlsl: only the marked template of a module with several is squeezed, and TypeScript source is read as TypeScript', () => {
  const code = 'const n: number = 1;\nconst a = `\n  keep   this  \n`;\nconst b = /* glsl */ `\n   squeeze   this  \n`;\nfunction f(x: string): string { return x as string; }\n';
  assert.equal(squeezeGlsl(code, 'ts'), 'const n: number = 1;\nconst a = `\n  keep   this  \n`;\nconst b = /* glsl */ `\nsqueeze this\n`;\nfunction f(x: string): string { return x as string; }\n');
  // an unmarked template that lies between two marked ones is not squeezed, though the walk passes over it
  const between = 'const a = /* glsl */`\n  one   x  \n`;\nconst b = `\n  keep   this  \n`;\nconst c = /* glsl */`\n  two   y  \n`;\n';
  assert.equal(squeezeGlsl(between), 'const a = /* glsl */`\none x\n`;\nconst b = `\n  keep   this  \n`;\nconst c = /* glsl */`\ntwo y\n`;\n');
});

test('squeezeGlsl: a // comment ends at a \\n escape (GLSL reads it as a newline), and the escape and what follows it stay', () => {
  assert.equal(squeezeGlsl(shader('#define A 1 // note\\n#define B 2 // other')), shader('#define A 1 \\n#define B 2 '));
});

test('squeezeGlslParts: a hole lying in a comment, a backslash before white space, and a many-line block comment in a # line leave the text as it was (null)', () => {
  assert.equal(squeezeGlslParts(['a // b ', ' c\nd']), null, 'the hole is in the comment');
  assert.equal(squeezeGlslParts(['a /* b ', ' c */ d']), null, 'the hole is in a block comment');
  assert.equal(squeezeGlslParts(['#define A 1 \\\n   2']), null, 'a line continued by a backslash');
  assert.equal(squeezeGlslParts(['a \\ \n b']), null, 'an escaped space, which trimming would turn into a continuation');
  assert.equal(squeezeGlslParts(['a \\\t\n b']), null, 'an escaped tab, which trimming would turn into a continuation as much');
  assert.equal(squeezeGlslParts(['a \\\r\n b']), null, 'and a continuation ended by a carriage return and a newline');
  assert.equal(squeezeGlslParts(['#define A 1 /* two\n lines */ 2\n']), null, 'a # line the comment would end');
  assert.equal(squeezeGlslParts(['  #define A 1 /* two\n lines */ 2\n']), null, 'an indented # line, which is how a shader holds it');
  assert.equal(squeezeGlslParts(['ab']), null, 'the private-use character the squeeze uses for a hole');
  assert.deepEqual(squeezeGlslParts(['  a  ', '  b  // c\n']), [' a ', ' b\n'], 'the white space beside no newline is kept, as one space');
  assert.deepEqual(squeezeGlslParts(['a \r\n  b\r\n']), ['a\nb\n'], 'a carriage return goes with the white space beside a newline');
  assert.deepEqual(squeezeGlslParts(['a\tb  c']), ['a\tb c'], 'a lone tab is not a run: only two or more are made one space');
  assert.deepEqual(squeezeGlslParts(['a// b']), ['a'], 'a line comment leaves nothing in its place, not even a space');
  assert.deepEqual(squeezeGlslParts(['a // b \\x c\nd']), ['a\nd'], 'a line comment goes on past a backslash that is not a \\n escape');
  assert.equal(squeezeGlsl(shader('#define A 1 /* two\n lines */ 2\n')), shader('#define A 1 /* two\n lines */ 2\n'), 'and the module is left as it was');
});

test('squeezeGlsl: a hole in a comment leaves its template alone while the others in the module are squeezed', () => {
  const code = 'const a = /* glsl */`\n  // ${x} in a comment\n  p   q\n`;\nconst b = /* glsl */`\n  r   s // t\n`;\n';
  assert.equal(squeezeGlsl(code), 'const a = /* glsl */`\n  // ${x} in a comment\n  p   q\n`;\nconst b = /* glsl */`\nr s\n`;\n');
});

test('glslSqueeze: the build plugin squeezes JavaScript and TypeScript modules (a query on the id too), and leaves other files, unmarked modules and unparsable ones as they were', () => {
  const plugin = glslSqueeze();
  assert.equal(plugin.apply, 'build');
  assert.equal(plugin.enforce, 'pre', 'before the TypeScript transform drops the marker comment');
  const warned: string[] = [];
  const run = (code: string, id: string): unknown => (plugin.transform as (this: { warn(m: string): void }, code: string, id: string) => unknown).call({ warn: (m) => warned.push(m) }, code, id);
  const ts = 'const n: number = 1;\nconst s = /* glsl */`\n  a   b // c\n`;\n';
  const squeezed = 'const n: number = 1;\nconst s = /* glsl */`\na b\n`;\n';
  assert.deepEqual(run(ts, '/src/materials.ts'), { code: squeezed, map: null }, 'a .ts file is read as TypeScript');
  assert.deepEqual(run(ts, '/src/materials.ts?v=3'), { code: squeezed, map: null });
  const js = 'const s = /* glsl */`\n  a   b // c\n`;\n';
  assert.deepEqual(run(js, '/node_modules/three/build/three.module.js'), { code: 'const s = /* glsl */`\na b\n`;\n', map: null });
  assert.deepEqual(run(js, '/src/a.mjs'), { code: 'const s = /* glsl */`\na b\n`;\n', map: null }, 'a .mjs module, and a .cjs one');
  assert.deepEqual(run(js, '/src/a.cjs'), { code: 'const s = /* glsl */`\na b\n`;\n', map: null });
  assert.deepEqual(run(ts, '/src/a.mts'), { code: squeezed, map: null }, 'a .mts module is TypeScript, as a .cts one is');
  assert.deepEqual(run(ts, '/src/a.cts'), { code: squeezed, map: null });
  // the same text is JavaScript in a .js file and TypeScript in a .ts one: between `<` and `>` a marked template is a template in the first (a comparison) and a type argument (a
  // template literal type, no shader) in the second
  const angled = 'const s = f < /* glsl */`\n  a   ${b}\n` > (1);\n';
  assert.deepEqual(run(angled, '/src/a.js'), { code: 'const s = f < /* glsl */`\na ${b}\n` > (1);\n', map: null }, 'a .js module is read as JavaScript');
  assert.equal(run(angled, '/src/a.ts'), null, 'and a .ts one as TypeScript');
  assert.equal(run(js, '/src/style.css'), null, 'only scripts');
  assert.equal(run('const s = `\n  a   b\n`;\n', '/src/a.ts'), null, 'no marker, no change');
  assert.equal(run('const s = /* glsl */`\na b\n`;\n', '/src/a.ts'), null, 'a template already squeezed is no change');
  assert.deepEqual(warned, []);
  assert.equal(run('const s = /* glsl */`\n  a   b\n`; const = ;', '/src/broken.ts'), null, 'a module that does not parse is left to the build to report');
  assert.equal(warned.length, 1);
  assert.match(warned[0] ?? '', /glsl-squeeze left \/src\/broken\.ts as it was/);
});
