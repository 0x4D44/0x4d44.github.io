// A small GLSL interpreter for tests. Node has no GPU, and the logic in a shader (what a drop does under a roof, what the ground does when it
// is wet) is worth running, not only reading. This runs the subset of GLSL ES the repo's own shaders use (floats, vec2-4, mat3 and mat4, swizzles,
// user functions, if/return, the common built-ins), and it is strict where a GPU's compiler is: a vec3 added to a vec4, a float declared from a
// vec2, the wrong number of arguments, an unknown name, or a smoothstep with its edges the wrong way round (undefined in GLSL) all throw.
// It is arithmetic in double precision, not a GPU: it answers "does the logic do what it says", not "does this driver agree".

export class Mat {
  readonly n: 3 | 4;
  readonly e: number[];
  constructor(n: 3 | 4, e: number[]) {
    if (e.length !== n * n) throw new Error(`GLSL: a mat${n} has ${n * n} numbers, not ${e.length}`);
    this.n = n;
    this.e = e;
  }
}
/** A texture the program samples; what `texture2D` does with it is the environment's. */
export class Sampler {
  readonly data: unknown;
  constructor(data: unknown) {
    this.data = data;
  }
}
export type Value = number | boolean | number[] | Mat | Sampler;
export interface Env {
  /** uniforms, attributes, varyings and built-in variables, by name; assignments to a name that is not local land here */
  vars: Record<string, Value>;
  /** functions the program calls that the language does not have, e.g. texture2D */
  fns?: Record<string, (...args: Value[]) => Value>;
}

// ---- reading the source ------------------------------------------------------------------------------------------------------------------

interface Tok { t: 'num' | 'id' | 'op' | 'eof'; v: string }
type Expr =
  | { k: 'num'; v: number }
  | { k: 'id'; name: string }
  | { k: 'call'; name: string; args: Expr[] }
  | { k: 'swz'; e: Expr; s: string }
  | { k: 'un'; op: string; e: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr };
type Stmt =
  | { k: 'decl'; type: string; name: string; init: Expr | null }
  | { k: 'assign'; name: string; swz: string | null; op: string; e: Expr }
  | { k: 'if'; c: Expr; a: Stmt; b: Stmt | null }
  | { k: 'ret'; e: Expr | null }
  | { k: 'block'; body: Stmt[] }
  | { k: 'expr'; e: Expr };
interface Fn { type: string; params: { type: string; name: string }[]; body: Stmt[] }

const TYPES = new Set(['void', 'float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'sampler2D']);
const TOKEN = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(<=|>=|==|!=|&&|\|\||\+=|-=|\*=|\/=|[-+*/<>=!?:;,.(){}[\]])/y;

function tokenize(source: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < source.length) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(source);
    if (!m) throw new Error(`GLSL: cannot read ${JSON.stringify(source.slice(i, i + 24))}`);
    i = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined) out.push({ t: 'op', v: m[3] });
  }
  out.push({ t: 'eof', v: '' });
  return out;
}

class Parser {
  private i = 0;
  private readonly toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
  }
  private get tok(): Tok { return this.toks[this.i] as Tok; }
  private is(v: string): boolean { return this.tok.t !== 'num' && this.tok.v === v; }
  private eat(v: string): void {
    if (!this.is(v)) throw new Error(`GLSL: expected "${v}" but found "${this.tok.v}" (token ${this.i})`);
    this.i++;
  }
  private take(v: string): boolean {
    if (!this.is(v)) return false;
    this.i++;
    return true;
  }
  private ident(): string {
    if (this.tok.t !== 'id') throw new Error(`GLSL: expected a name but found "${this.tok.v}"`);
    return this.toks[this.i++]!.v;
  }
  atEnd(): boolean { return this.tok.t === 'eof'; }

  /** Top level: declarations (ignored, they are the environment's) and function definitions. */
  program(): { fns: Map<string, Fn>; declared: Map<string, string> } {
    const fns = new Map<string, Fn>();
    const declared = new Map<string, string>();
    while (!this.atEnd()) {
      if (this.take('precision')) { while (!this.take(';')) this.i++; continue; }
      const qualifier = ['uniform', 'attribute', 'varying', 'in', 'out', 'const'].find((q) => this.take(q));
      const type = this.ident();
      if (!TYPES.has(type)) throw new Error(`GLSL: "${type}" is not a type`);
      const name = this.ident();
      if (!qualifier && this.take('(')) {
        const params: Fn['params'] = [];
        if (!this.is(')')) {
          do { const ptype = this.ident(); params.push({ type: ptype, name: this.ident() }); } while (this.take(','));
        }
        this.eat(')');
        this.eat('{');
        fns.set(name, { type, params, body: this.statements() });
        continue;
      }
      declared.set(name, type);
      while (this.take(',')) declared.set(this.ident(), type);
      if (this.take('=')) this.expr();
      this.eat(';');
    }
    return { fns, declared };
  }

  /** Statements up to the closing brace, which is eaten (or to the end, for a bare snippet). */
  statements(untilEnd = false): Stmt[] {
    const body: Stmt[] = [];
    while (untilEnd ? !this.atEnd() : !this.take('}')) body.push(this.statement());
    return body;
  }

  private statement(): Stmt {
    if (this.take('{')) return { k: 'block', body: this.statements() };
    if (this.take('if')) {
      this.eat('(');
      const c = this.expr();
      this.eat(')');
      const a = this.statement();
      return { k: 'if', c, a, b: this.take('else') ? this.statement() : null };
    }
    if (this.take('return')) {
      const e = this.is(';') ? null : this.expr();
      this.eat(';');
      return { k: 'ret', e };
    }
    if (this.tok.t === 'id' && TYPES.has(this.tok.v) && this.toks[this.i + 1]!.t === 'id') {
      const type = this.ident();
      const name = this.ident();
      const init = this.take('=') ? this.expr() : null;
      this.eat(';');
      return { k: 'decl', type, name, init };
    }
    if (this.tok.t === 'id') {
      const dotted = this.toks[this.i + 1]!.v === '.' && this.toks[this.i + 2]!.t === 'id';
      const at = this.toks[this.i + (dotted ? 3 : 1)]!;
      if (at.t === 'op' && ['=', '+=', '-=', '*=', '/='].includes(at.v)) {
        const name = this.ident();
        const swz = dotted ? (this.eat('.'), this.ident()) : null;
        const op = this.toks[this.i++]!.v;
        const e = this.expr();
        this.eat(';');
        return { k: 'assign', name, swz, op, e };
      }
    }
    const e = this.expr();
    this.eat(';');
    return { k: 'expr', e };
  }

  expr(): Expr { return this.cond(); }
  private cond(): Expr {
    const c = this.binary(0);
    if (!this.take('?')) return c;
    const a = this.cond();
    this.eat(':');
    return { k: 'cond', c, a, b: this.cond() };
  }
  private static readonly LEVELS: string[][] = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/']];
  private binary(level: number): Expr {
    if (level === Parser.LEVELS.length) return this.unary();
    let l = this.binary(level + 1);
    for (;;) {
      const op = Parser.LEVELS[level]!.find((o) => this.is(o));
      if (!op) return l;
      this.i++;
      l = { k: 'bin', op, l, r: this.binary(level + 1) };
    }
  }
  private unary(): Expr {
    if (this.take('-')) return { k: 'un', op: '-', e: this.unary() };
    if (this.take('+')) return this.unary();
    if (this.take('!')) return { k: 'un', op: '!', e: this.unary() };
    return this.postfix();
  }
  private postfix(): Expr {
    let e = this.primary();
    while (this.take('.')) e = { k: 'swz', e, s: this.ident() };
    return e;
  }
  private primary(): Expr {
    if (this.tok.t === 'num') return { k: 'num', v: Number(this.toks[this.i++]!.v) };
    if (this.take('(')) {
      const e = this.expr();
      this.eat(')');
      return e;
    }
    const name = this.ident();
    if (!this.take('(')) return { k: 'id', name };
    const args: Expr[] = [];
    if (!this.is(')')) do { args.push(this.expr()); } while (this.take(','));
    this.eat(')');
    return { k: 'call', name, args };
  }
}

/** Every function name a statement or expression calls. */
function callNames(n: Stmt | Expr | null): string[] {
  if (!n) return [];
  switch (n.k) {
    case 'num': case 'id': return [];
    case 'call': return [n.name, ...n.args.flatMap(callNames)];
    case 'swz': case 'un': return callNames(n.e);
    case 'bin': return [...callNames(n.l), ...callNames(n.r)];
    case 'cond': return [...callNames(n.c), ...callNames(n.a), ...callNames(n.b)];
    case 'decl': return callNames(n.init);
    case 'assign': case 'expr': return callNames(n.e);
    case 'if': return [...callNames(n.c), ...callNames(n.a), ...callNames(n.b)];
    case 'ret': return callNames(n.e);
    case 'block': return n.body.flatMap(callNames);
  }
}

// ---- values ------------------------------------------------------------------------------------------------------------------------------

const typeOf = (v: Value): string => (typeof v === 'number' ? 'float' : typeof v === 'boolean' ? 'bool' : Array.isArray(v) ? `vec${v.length}` : v instanceof Mat ? `mat${v.n}` : 'sampler2D');
const fits = (type: string, v: Value): boolean => typeOf(v) === type || (type === 'int' && typeof v === 'number');
const COMPONENTS = ['xyzw', 'rgba', 'stpq'];

function swizzle(v: Value, s: string): Value {
  if (!Array.isArray(v)) throw new Error(`GLSL: .${s} on a ${typeOf(v)}`);
  const set = COMPONENTS.find((c) => [...s].every((ch) => c.includes(ch)));
  if (!set || s.length > 4) throw new Error(`GLSL: .${s} is not a swizzle`);
  const out = [...s].map((ch) => {
    const k = set.indexOf(ch);
    if (k >= v.length) throw new Error(`GLSL: .${s} reads past the end of a vec${v.length}`);
    return v[k] as number;
  });
  return out.length === 1 ? (out[0] as number) : out;
}

/** `target.s op= v` for a vec: a new vec with those components written (GLSL does not allow a component twice on the left). */
function writeSwizzle(target: Value, s: string, op: string, v: Value): Value {
  if (!Array.isArray(target)) throw new Error(`GLSL: .${s} on a ${typeOf(target)}`);
  const set = COMPONENTS.find((c) => [...s].every((ch) => c.includes(ch)));
  if (!set || s.length > 4 || new Set(s).size !== s.length) throw new Error(`GLSL: .${s} cannot be assigned to`);
  const at = [...s].map((ch) => set.indexOf(ch));
  if (at.some((k) => k >= target.length)) throw new Error(`GLSL: .${s} reaches past the end of a vec${target.length}`);
  const part = swizzle(target, s);
  const result = op === '=' ? v : arithmetic(op[0] as string, part, v);
  if (typeOf(result) !== typeOf(part)) throw new Error(`GLSL: .${s} is a ${typeOf(part)}, not a ${typeOf(result)}`);
  const out = [...target];
  at.forEach((k, i) => { out[k] = Array.isArray(result) ? (result[i] as number) : (result as number); });
  return out;
}

const zero = (type: string): Value => (/^vec[234]$/.test(type) ? new Array<number>(Number(type.slice(3))).fill(0) : type === 'bool' ? false : 0);
/** Variables a vertex or fragment shader writes without declaring. */
const OUTPUTS = new Set(['gl_Position', 'gl_PointSize', 'gl_FragColor']);

function matVec(m: Mat, v: number[]): number[] {
  if (v.length !== m.n) throw new Error(`GLSL: mat${m.n} * vec${v.length}`);
  return Array.from({ length: m.n }, (_, i) => v.reduce((s, x, j) => s + (m.e[j * m.n + i] as number) * x, 0));
}
function vecMat(v: number[], m: Mat): number[] {
  if (v.length !== m.n) throw new Error(`GLSL: vec${v.length} * mat${m.n}`);
  return Array.from({ length: m.n }, (_, j) => v.reduce((s, x, i) => s + x * (m.e[j * m.n + i] as number), 0));
}
function matMat(a: Mat, b: Mat): Mat {
  if (a.n !== b.n) throw new Error(`GLSL: mat${a.n} * mat${b.n}`);
  const n = a.n;
  const e = new Array<number>(n * n).fill(0);
  for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) e[c * n + r] = (e[c * n + r] as number) + (a.e[k * n + r] as number) * (b.e[c * n + k] as number);
  return new Mat(a.n, e);
}

function arithmetic(op: string, a: Value, b: Value): Value {
  const f = (x: number, y: number): number => (op === '+' ? x + y : op === '-' ? x - y : op === '*' ? x * y : x / y);
  if (typeof a === 'number' && typeof b === 'number') return f(a, b);
  if (op === '*') {
    if (a instanceof Mat && b instanceof Mat) return matMat(a, b);
    if (a instanceof Mat && Array.isArray(b)) return matVec(a, b);
    if (Array.isArray(a) && b instanceof Mat) return vecMat(a, b);
  }
  if (Array.isArray(a) && typeof b === 'number') return a.map((x) => f(x, b));
  if (typeof a === 'number' && Array.isArray(b)) return b.map((y) => f(a, y));
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) throw new Error(`GLSL: ${typeOf(a)} ${op} ${typeOf(b)}`);
    return a.map((x, i) => f(x, b[i] as number));
  }
  throw new Error(`GLSL: ${typeOf(a)} ${op} ${typeOf(b)}`);
}

const num = (v: Value, what: string): number => {
  if (typeof v !== 'number') throw new Error(`GLSL: ${what} wants a float, not a ${typeOf(v)}`);
  return v;
};
/** Apply `f` to the components of its arguments, scalars standing in for vectors where the other arguments are vectors. */
function componentwise(args: Value[], f: (...xs: number[]) => number): Value {
  const size = Math.max(...args.map((a) => (Array.isArray(a) ? a.length : 1)));
  for (const a of args) if (Array.isArray(a) && a.length !== size) throw new Error('GLSL: vectors of different sizes');
  const at = (k: number): number[] => args.map((a) => (Array.isArray(a) ? (a[k] as number) : num(a, 'a built-in')));
  return size === 1 && !args.some(Array.isArray) ? f(...at(0)) : Array.from({ length: size }, (_, k) => f(...at(k)));
}
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

const BUILTINS: Record<string, (...args: Value[]) => Value> = {
  abs: (x) => componentwise([x as Value], Math.abs),
  floor: (x) => componentwise([x as Value], Math.floor),
  fract: (x) => componentwise([x as Value], (v) => v - Math.floor(v)),
  exp: (x) => componentwise([x as Value], Math.exp),
  sqrt: (x) => componentwise([x as Value], Math.sqrt),
  sin: (x) => componentwise([x as Value], Math.sin),
  cos: (x) => componentwise([x as Value], Math.cos),
  asin: (x) => componentwise([x as Value], Math.asin),
  min: (a, b) => componentwise([a as Value, b as Value], Math.min),
  max: (a, b) => componentwise([a as Value, b as Value], Math.max),
  pow: (a, b) => componentwise([a as Value, b as Value], Math.pow),
  step: (e, x) => componentwise([e as Value, x as Value], (a, b) => (b < a ? 0 : 1)),
  clamp: (x, a, b) => componentwise([x as Value, a as Value, b as Value], clamp),
  mix: (a, b, t) => componentwise([a as Value, b as Value, t as Value], (x, y, k) => x * (1 - k) + y * k),
  smoothstep: (a, b, x) => componentwise([a as Value, b as Value, x as Value], (lo, hi, v) => {
    if (!(lo < hi)) throw new Error(`GLSL: smoothstep(${lo}, ${hi}, ...) has its edges the wrong way round, which is undefined`);
    const t = clamp((v - lo) / (hi - lo), 0, 1);
    return t * t * (3 - 2 * t);
  }),
  length: (v) => (Array.isArray(v) ? Math.hypot(...v) : Math.abs(num(v, 'length'))),
  normalize: (v) => {
    if (!Array.isArray(v)) throw new Error('GLSL: normalize wants a vector');
    const len = Math.hypot(...v);
    return v.map((x) => x / len);
  },
  dot: (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) throw new Error('GLSL: dot wants two vectors of one size');
    return a.reduce((s, x, i) => s + x * (b[i] as number), 0);
  },
};

function construct(type: string, args: Value[]): Value {
  if (type === 'float') return num(args[0] as Value, 'float()');
  if (!/^(vec[234]|mat[34])$/.test(type)) throw new Error(`GLSL: ${type}() is not supported by this interpreter`);
  const n = Number(type.slice(3));
  if (type.startsWith('mat')) {
    const m = args[0];
    if (args.length === 1 && m instanceof Mat) {
      if (m.n === n) return m;
      if (m.n === 4 && n === 3) return new Mat(3, [0, 1, 2, 4, 5, 6, 8, 9, 10].map((k) => m.e[k] as number));
    }
    throw new Error(`GLSL: cannot make a ${type} from that`);
  }
  const flat: number[] = [];
  for (const a of args) {
    if (typeof a === 'number') flat.push(a);
    else if (Array.isArray(a)) flat.push(...a);
    else throw new Error(`GLSL: a ${type} cannot be made from a ${typeOf(a)}`);
  }
  if (flat.length === 1) return Array.from({ length: n }, () => flat[0] as number);
  if (flat.length !== n) throw new Error(`GLSL: ${type}() was given ${flat.length} numbers`);
  return flat;
}

// ---- running it --------------------------------------------------------------------------------------------------------------------------

type Scope = Map<string, { type: string; value: Value }>;
class Return {
  readonly value: Value | undefined;
  constructor(value: Value | undefined) {
    this.value = value;
  }
}

export class Glsl {
  private readonly fns: Map<string, Fn>;
  private readonly declared: Map<string, string>;

  constructor(source: string) {
    const parsed = new Parser(tokenize(source)).program();
    this.fns = parsed.fns;
    this.declared = parsed.declared;
    // a GPU compiler wants a function defined before it is called, and no recursion
    const order = [...this.fns.keys()];
    order.forEach((name, i) => {
      for (const callee of this.fns.get(name)!.body.flatMap(callNames)) {
        if (order.indexOf(callee) >= i) throw new Error(`GLSL: ${name} calls ${callee} before it is defined`);
      }
    });
  }

  /** The names the source declared as uniforms, attributes and varyings, with their types. */
  get globals(): ReadonlyMap<string, string> { return this.declared; }

  /** Call a function of the program. */
  call(name: string, args: Value[], env: Env): Value | undefined {
    return this.invoke(name, args, env);
  }

  /**
   * Read bare statements (a snippet that lives inside some `main`) once. The result runs them with this program's functions and returns the
   * variables they declared; what they assign to a name the environment holds (gl_Position, a varying, diffuseColor) lands in `env.vars`.
   */
  snippet(statements: string): (env: Env) => Record<string, Value> {
    const parsed = new Parser(tokenize(statements)).statements(true);
    return (env) => {
      const scope: Scope = new Map();
      for (const s of parsed) this.exec(s, scope, env);
      return Object.fromEntries([...scope].map(([k, v]) => [k, v.value]));
    };
  }

  /** `snippet`, read and run in one go. */
  run(statements: string, env: Env): Record<string, Value> {
    return this.snippet(statements)(env);
  }

  /** Evaluate one expression. */
  evaluate(expression: string, env: Env, locals: Record<string, Value> = {}): Value {
    const scope: Scope = new Map(Object.entries(locals).map(([k, v]) => [k, { type: typeOf(v), value: v }]));
    return this.eval(new Parser(tokenize(expression)).expr(), scope, env);
  }

  private invoke(name: string, args: Value[], env: Env): Value | undefined {
    const fn = this.fns.get(name);
    if (!fn) throw new Error(`GLSL: no function ${name}`);
    if (fn.params.length !== args.length) throw new Error(`GLSL: ${name} takes ${fn.params.length} arguments, not ${args.length}`);
    const scope: Scope = new Map();
    fn.params.forEach((p, i) => {
      const v = args[i] as Value;
      if (!fits(p.type, v)) throw new Error(`GLSL: ${name}'s ${p.name} is a ${p.type}, not a ${typeOf(v)}`);
      scope.set(p.name, { type: p.type, value: v });
    });
    try {
      for (const s of fn.body) this.exec(s, scope, env);
    } catch (e) {
      if (!(e instanceof Return)) throw e;
      if (fn.type !== 'void' && (e.value === undefined || !fits(fn.type, e.value))) throw new Error(`GLSL: ${name} returns a ${fn.type}`);
      return e.value;
    }
    if (fn.type !== 'void') throw new Error(`GLSL: ${name} reaches its end without returning a ${fn.type}`);
    return undefined;
  }

  private exec(s: Stmt, scope: Scope, env: Env): void {
    switch (s.k) {
      case 'block': for (const t of s.body) this.exec(t, scope, env); return;
      case 'decl': {
        if (scope.has(s.name)) throw new Error(`GLSL: ${s.name} is declared twice`);
        const value = s.init ? this.eval(s.init, scope, env) : undefined;
        if (value !== undefined && !fits(s.type, value)) throw new Error(`GLSL: ${s.name} is a ${s.type}, not a ${typeOf(value)}`);
        scope.set(s.name, { type: s.type, value: value ?? zero(s.type) });
        return;
      }
      case 'assign': {
        const v = this.eval(s.e, scope, env);
        const local = scope.get(s.name);
        const current = local ? local.value : env.vars[s.name];
        if (current === undefined) {
          if (s.swz || s.op !== '=') throw new Error(`GLSL: ${s.name} is not set`);
          if (!this.declared.has(s.name) && !OUTPUTS.has(s.name)) throw new Error(`GLSL: ${s.name} is not declared`);
        }
        const next = s.swz ? writeSwizzle(current as Value, s.swz, s.op, v) : s.op === '=' ? v : arithmetic(s.op[0] as string, current as Value, v);
        if (local) {
          if (!fits(local.type, next)) throw new Error(`GLSL: ${s.name} is a ${local.type}, not a ${typeOf(next)}`);
          local.value = next;
        } else {
          if (current !== undefined && typeOf(current) !== typeOf(next)) throw new Error(`GLSL: ${s.name} is a ${typeOf(current)}, not a ${typeOf(next)}`);
          env.vars[s.name] = next;
        }
        return;
      }
      case 'if': {
        const c = this.eval(s.c, scope, env);
        if (typeof c !== 'boolean') throw new Error('GLSL: if wants a bool');
        if (c) this.exec(s.a, scope, env);
        else if (s.b) this.exec(s.b, scope, env);
        return;
      }
      case 'ret': throw new Return(s.e ? this.eval(s.e, scope, env) : undefined);
      case 'expr': this.eval(s.e, scope, env);
    }
  }

  private eval(e: Expr, scope: Scope, env: Env): Value {
    switch (e.k) {
      case 'num': return e.v;
      case 'id': {
        const local = scope.get(e.name);
        if (local) return local.value;
        if (e.name === 'true' || e.name === 'false') return e.name === 'true';
        const v = env.vars[e.name];
        if (v === undefined) throw new Error(`GLSL: ${e.name} is not defined`);
        return v;
      }
      case 'swz': return swizzle(this.eval(e.e, scope, env), e.s);
      case 'un': {
        const v = this.eval(e.e, scope, env);
        if (e.op === '!') {
          if (typeof v !== 'boolean') throw new Error('GLSL: ! wants a bool');
          return !v;
        }
        return arithmetic('-', 0, v) as Value;
      }
      case 'cond': {
        const c = this.eval(e.c, scope, env);
        if (typeof c !== 'boolean') throw new Error('GLSL: ?: wants a bool');
        return this.eval(c ? e.a : e.b, scope, env);
      }
      case 'bin': {
        if (e.op === '&&' || e.op === '||') {
          const l = this.eval(e.l, scope, env);
          if (typeof l !== 'boolean') throw new Error(`GLSL: ${e.op} wants bools`);
          if (e.op === '&&' ? !l : l) return l;
          const r = this.eval(e.r, scope, env);
          if (typeof r !== 'boolean') throw new Error(`GLSL: ${e.op} wants bools`);
          return r;
        }
        const l = this.eval(e.l, scope, env), r = this.eval(e.r, scope, env);
        if (['<', '>', '<=', '>='].includes(e.op)) {
          const a = num(l, e.op), b = num(r, e.op);
          return e.op === '<' ? a < b : e.op === '>' ? a > b : e.op === '<=' ? a <= b : a >= b;
        }
        if (e.op === '==' || e.op === '!=') {
          if (typeof l !== typeof r || Array.isArray(l) || Array.isArray(r)) throw new Error(`GLSL: ${typeOf(l)} ${e.op} ${typeOf(r)}`);
          return e.op === '==' ? l === r : l !== r;
        }
        return arithmetic(e.op, l, r);
      }
      case 'call': {
        const args = e.args.map((a) => this.eval(a, scope, env));
        if (TYPES.has(e.name)) return construct(e.name, args);
        const user = this.fns.has(e.name);
        if (user) {
          const v = this.invoke(e.name, args, env);
          if (v === undefined) throw new Error(`GLSL: ${e.name} returns nothing`);
          return v;
        }
        const own = env.fns?.[e.name] ?? BUILTINS[e.name];
        if (!own) throw new Error(`GLSL: no function ${e.name}`);
        if (own.length > 0 && own.length !== args.length) throw new Error(`GLSL: ${e.name} takes ${own.length} arguments, not ${args.length}`);
        return own(...args);
      }
    }
  }
}

// ---- binding what a shader is given -------------------------------------------------------------------------------------------------------

interface HasXY { x: number; y: number; z?: number; w?: number }
/** A THREE uniform or attribute value, as the shader would see it. */
export function toValue(v: unknown): Value {
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v && typeof v === 'object') {
    const o = v as { isMatrix4?: boolean; isMatrix3?: boolean; elements?: number[]; isColor?: boolean; r?: number; g?: number; b?: number };
    if (o.isMatrix4 && o.elements) return new Mat(4, [...o.elements]);
    if (o.isMatrix3 && o.elements) return new Mat(3, [...o.elements]);
    if (o.isColor) return [o.r as number, o.g as number, o.b as number];
    const c = v as HasXY;
    if (typeof c.x === 'number' && typeof c.y === 'number') return [c.x, c.y, ...(typeof c.z === 'number' ? [c.z] : []), ...(typeof c.w === 'number' ? [c.w] : [])];
    if (Array.isArray(v)) return v as number[];
  }
  return new Sampler(v);
}
