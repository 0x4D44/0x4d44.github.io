// What the tests of the squeeze of three's shader strings (three-squeeze.test.ts, three-squeeze-hooks.test.ts) share: three's own source, three's own patterns read from it, and how to compare
// two shader texts that differ in white space. This imports nothing of the page, so a test may load it before it squeezes THREE.ShaderChunk in place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const threePath = fileURLToPath(import.meta.resolve('three'));
export const threeSource = readFileSync(threePath, 'utf8');

/** One of three's regular expressions, read from its source (a rename or a change of it is an error here, not a silent pass). */
export function threePattern(name: string): RegExp {
  const m = new RegExp(`^const ${name} = /(.*)/([a-z]*);$`, 'm').exec(threeSource);
  if (!m) throw new Error(`three.module.js has no \`const ${name} = /.../\` (three has changed: read how it resolves includes and unrolls loops again)`);
  return new RegExp(m[1] as string, m[2]);
}

/** A copy to `test`: a global pattern keeps its `lastIndex` between calls, and the two of three's are shared by everything that uses them. */
export const fresh = (re: RegExp): RegExp => new RegExp(re.source, re.flags);

export const includePattern = threePattern('includePattern');
export const unrollLoopPattern = threePattern('unrollLoopPattern');

/** three's table of which program (a key of ShaderLib) each material type is drawn with (WebGLPrograms.js), read from its source. */
export const shaderIds: Readonly<Record<string, string>> = (() => {
  const table = /const shaderIDs = \{([^}]*)\}/.exec(threeSource)?.[1];
  if (!table) throw new Error('three.module.js has no `const shaderIDs = {...}` (three has changed)');
  return Object.fromEntries([...table.matchAll(/(\w+): '(\w+)'/g)].map((m) => [m[1] as string, m[2] as string]));
})();

/** three's resolveIncludes (WebGLProgram.js), over the chunks given. */
export function resolveIncludes(text: string, chunks: Readonly<Record<string, string>>): string {
  return text.replace(includePattern, (_m, name: string) => {
    const chunk = chunks[name];
    if (chunk === undefined) throw new Error(`Can not resolve #include <${name}>`);
    return resolveIncludes(chunk, chunks);
  });
}

/** three's replaceLightNums and replaceClippingPlaneNums, with a number for each (the loops need digits), then its unrollLoops and loopReplacer: the text, and how many loops it unrolled. */
export function unrollLoops(text: string): { text: string; loops: number } {
  let loops = 0;
  const numbered = text.replace(/\b(?:NUM|UNION)_[A-Z_]+/g, '3');
  const unrolled = numbered.replace(unrollLoopPattern, (_m, from: string, to: string, snippet: string) => {
    loops++;
    let out = '';
    for (let i = parseInt(from); i < parseInt(to); i++) out += snippet.replace(/\[\s*i\s*\]/g, `[ ${i} ]`).replace(/UNROLLED_LOOP_INDEX/g, String(i));
    return out;
  });
  return { text: unrolled, loops };
}

export const withoutComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
/** The text with its comments and every white space gone: what a compiler reads, but for where a token ends. */
export const bare = (s: string): string => withoutComments(s).replace(/\s+/g, '');
/** The text line by line, each line's white space a single space: where each token ends and where each line does, too. */
export const lines = (s: string): string[] => withoutComments(s).split('\n').map((l) => l.trim().replace(/\s+/g, ' '));
