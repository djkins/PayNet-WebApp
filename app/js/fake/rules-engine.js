// A local evaluator for the subset of the Firestore Security Rules language used by
// firestore.rules. It powers Demo mode and the offline test suite so the app's writes
// are checked against the same rules file that is deployed. It is not Google's engine:
// always run `npm run test:emulator` against the official emulator before go-live.

export class Ts {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
}
export class Dur { constructor(ms) { this.ms = ms; } }
class PathV { constructor(s) { this.s = s; } }
class RSet { constructor(items) { this.items = items; } }
class MapDiff { constructor(a, b) { this.a = a; this.b = b; } }
export class RulesError extends Error {}
const ERR = (m) => { throw new RulesError(m); };

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && !(v instanceof Ts) && !(v instanceof Dur) && !(v instanceof PathV) && !(v instanceof RSet) && !(v instanceof MapDiff);

// ---------------------------------------------------------------- parser
class Parser {
  constructor(src) { this.s = src; this.i = 0; }
  ws() {
    for (;;) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { this.i++; continue; }
      if (this.s.startsWith('//', this.i)) { while (this.i < this.s.length && this.s[this.i] !== '\n') this.i++; continue; }
      if (this.s.startsWith('/*', this.i)) { const e = this.s.indexOf('*/', this.i + 2); this.i = e < 0 ? this.s.length : e + 2; continue; }
      return;
    }
  }
  peek(str) { this.ws(); return this.s.startsWith(str, this.i); }
  peekWord(w) { this.ws(); return this.s.startsWith(w, this.i) && !/[A-Za-z0-9_]/.test(this.s[this.i + w.length] || ''); }
  eat(str) { if (this.peek(str)) { this.i += str.length; return true; } return false; }
  eatWord(w) { if (this.peekWord(w)) { this.i += w.length; return true; } return false; }
  expect(str) { if (!this.eat(str)) this.fail(`expected "${str}"`); }
  fail(m) {
    const line = this.s.slice(0, this.i).split('\n').length;
    throw new Error(`Rules parse error line ${line}: ${m} near "${this.s.slice(this.i, this.i + 30)}"`);
  }
  ident() {
    this.ws(); const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i));
    if (!m) this.fail('expected identifier'); this.i += m[0].length; return m[0];
  }
  file() {
    if (this.eatWord('rules_version')) { this.expect('='); this.string(); this.expect(';'); }
    if (!this.eatWord('service')) this.fail('expected service');
    this.ident(); while (this.eat('.')) this.ident();
    this.expect('{'); const body = this.body(); this.expect('}');
    return { matches: body.matches, funcs: body.funcs, allows: body.allows };
  }
  body() {
    const out = { matches: [], funcs: {}, allows: [] };
    for (;;) {
      if (this.peek('}') || this.i >= this.s.length) return out;
      if (this.eatWord('match')) out.matches.push(this.match());
      else if (this.eatWord('function')) { const f = this.func(); out.funcs[f.name] = f; }
      else if (this.eatWord('allow')) out.allows.push(this.allow());
      else this.fail('unexpected token');
    }
  }
  match() {
    this.ws(); const segs = [];
    while (this.s[this.i] === '/') {
      this.i++;
      if (this.s[this.i] === '{') {
        const e = this.s.indexOf('}', this.i); const inner = this.s.slice(this.i + 1, e); this.i = e + 1;
        const [name, rest] = inner.split('=');
        segs.push({ wild: name.trim(), rest: rest === '**' });
      } else {
        const m = /^[A-Za-z0-9_\-()]+/.exec(this.s.slice(this.i)); if (!m) this.fail('bad path');
        segs.push({ lit: m[0] }); this.i += m[0].length;
      }
    }
    this.expect('{'); const body = this.body(); this.expect('}');
    return { segs, ...body };
  }
  func() {
    const name = this.ident(); this.expect('('); const params = [];
    if (!this.peek(')')) { do params.push(this.ident()); while (this.eat(',')); }
    this.expect(')'); this.expect('{'); const lets = [];
    while (this.eatWord('let')) { const n = this.ident(); this.expect('='); const e = this.expr(); this.expect(';'); lets.push([n, e]); }
    if (!this.eatWord('return')) this.fail('expected return');
    const body = this.expr(); this.expect(';'); this.expect('}');
    return { name, params, lets, body };
  }
  allow() {
    const ops = []; do ops.push(this.ident()); while (this.eat(','));
    let cond = { k: 'lit', v: true };
    if (this.eat(':')) { if (!this.eatWord('if')) this.fail('expected if'); cond = this.expr(); }
    this.expect(';'); return { ops, cond, src: '' };
  }
  string() {
    this.ws(); const q = this.s[this.i]; if (q !== "'" && q !== '"') this.fail('expected string');
    let out = ''; this.i++;
    while (this.s[this.i] !== q) {
      if (this.s[this.i] === '\\') { this.i++; const c = this.s[this.i]; out += c === 'n' ? '\n' : c; }
      else out += this.s[this.i];
      this.i++; if (this.i > this.s.length) this.fail('unterminated string');
    }
    this.i++; return out;
  }
  // expressions
  expr() {
    const c = this.or();
    if (this.peek('?')) { this.i++; const a = this.expr(); this.expect(':'); const b = this.expr(); return { k: 'cond', c, a, b }; }
    return c;
  }
  or() { let l = this.and(); while (this.peek('||')) { this.i += 2; l = { k: 'or', l, r: this.and() }; } return l; }
  and() { let l = this.eq(); while (this.peek('&&')) { this.i += 2; l = { k: 'and', l, r: this.eq() }; } return l; }
  eq() {
    let l = this.rel();
    for (;;) {
      if (this.peek('==')) { this.i += 2; l = { k: 'bin', op: '==', l, r: this.rel() }; }
      else if (this.peek('!=')) { this.i += 2; l = { k: 'bin', op: '!=', l, r: this.rel() }; }
      else return l;
    }
  }
  rel() {
    let l = this.add();
    for (;;) {
      if (this.peek('<=')) { this.i += 2; l = { k: 'bin', op: '<=', l, r: this.add() }; }
      else if (this.peek('>=')) { this.i += 2; l = { k: 'bin', op: '>=', l, r: this.add() }; }
      else if (this.peek('<')) { this.i += 1; l = { k: 'bin', op: '<', l, r: this.add() }; }
      else if (this.peek('>')) { this.i += 1; l = { k: 'bin', op: '>', l, r: this.add() }; }
      else if (this.peekWord('in')) { this.i += 2; l = { k: 'in', l, r: this.add() }; }
      else if (this.peekWord('is')) { this.i += 2; l = { k: 'is', l, t: this.ident() }; }
      else return l;
    }
  }
  add() {
    let l = this.mul();
    for (;;) {
      if (this.peek('+')) { this.i++; l = { k: 'bin', op: '+', l, r: this.mul() }; }
      else if (this.peek('-')) { this.i++; l = { k: 'bin', op: '-', l, r: this.mul() }; }
      else return l;
    }
  }
  mul() {
    let l = this.unary();
    for (;;) {
      if (this.peek('*')) { this.i++; l = { k: 'bin', op: '*', l, r: this.unary() }; }
      else if (this.peek('/') && !this.peek('//')) { this.i++; l = { k: 'bin', op: '/', l, r: this.unary() }; }
      else if (this.peek('%')) { this.i++; l = { k: 'bin', op: '%', l, r: this.unary() }; }
      else return l;
    }
  }
  unary() {
    if (this.peek('!') && !this.peek('!=')) { this.i++; return { k: 'not', e: this.unary() }; }
    if (this.peek('-')) { this.i++; return { k: 'neg', e: this.unary() }; }
    return this.postfix();
  }
  postfix() {
    let e = this.primary();
    for (;;) {
      if (this.peek('.')) {
        this.i++; const name = this.ident();
        if (this.peek('(')) { this.i++; e = { k: 'mcall', obj: e, name, args: this.args() }; }
        else e = { k: 'member', obj: e, name };
      } else if (this.peek('[')) { this.i++; const idx = this.expr(); this.expect(']'); e = { k: 'index', obj: e, idx }; }
      else return e;
    }
  }
  args() { const a = []; if (!this.peek(')')) { do a.push(this.expr()); while (this.eat(',')); } this.expect(')'); return a; }
  primary() {
    this.ws(); const c = this.s[this.i];
    if (c === '(') { this.i++; const e = this.expr(); this.expect(')'); return e; }
    if (c === '[') { this.i++; const items = []; if (!this.peek(']')) { do items.push(this.expr()); while (this.eat(',')); } this.expect(']'); return { k: 'list', items }; }
    if (c === "'" || c === '"') return { k: 'lit', v: this.string() };
    if (c === '/') return this.pathLit();
    const num = /^\d+(\.\d+)?/.exec(this.s.slice(this.i));
    if (num) { this.i += num[0].length; return { k: 'lit', v: Number(num[0]), float: !!num[1] }; }
    const id = this.ident();
    if (id === 'true') return { k: 'lit', v: true };
    if (id === 'false') return { k: 'lit', v: false };
    if (id === 'null') return { k: 'lit', v: null };
    if (this.peek('(')) { this.i++; return { k: 'call', name: id, args: this.args() }; }
    return { k: 'var', name: id };
  }
  pathLit() {
    const parts = [];
    while (this.s[this.i] === '/') {
      this.i++; parts.push({ lit: '/' });
      if (this.s.startsWith('$(', this.i)) {
        this.i += 2; const e = this.expr(); this.expect(')'); parts.push({ expr: e });
      } else {
        const m = /^[A-Za-z0-9_\-]+/.exec(this.s.slice(this.i)); if (!m) this.fail('bad path literal');
        parts.push({ lit: m[0] }); this.i += m[0].length;
      }
    }
    return { k: 'path', parts };
  }
}

export function parseRules(src) { return new Parser(src).file(); }

// ---------------------------------------------------------------- values
function typeOf(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Ts) return 'timestamp';
  if (v instanceof Dur) return 'duration';
  if (v instanceof PathV) return 'path';
  if (v instanceof RSet) return 'set';
  if (isMap(v)) return 'map';
  return 'unknown';
}
function deepEq(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (a instanceof Ts && b instanceof Ts) return a.ms === b.ms;
  if (a instanceof Dur && b instanceof Dur) return a.ms === b.ms;
  if (a instanceof PathV && b instanceof PathV) return a.s === b.s;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  if (isMap(a) && isMap(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && deepEq(a[k], b[k]));
  }
  return a === b;
}
const asBool = (v) => (typeof v === 'boolean' ? v : ERR('expected bool, got ' + typeOf(v)));
const mytParts = (ms) => { const d = new Date(ms); return d; };
const DUR_UNITS = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1, ns: 1e-6 };

function setOf(v) {
  if (v instanceof RSet) return v.items;
  if (Array.isArray(v)) return v;
  return ERR('expected list or set');
}

function callMethod(obj, name, args) {
  const t = typeOf(obj);
  if (obj instanceof MapDiff) {
    const a = obj.a, b = obj.b, ka = Object.keys(a), kb = Object.keys(b);
    const added = ka.filter((k) => !(k in b)), removed = kb.filter((k) => !(k in a));
    const changedK = ka.filter((k) => k in b && !deepEq(a[k], b[k]));
    const unchanged = ka.filter((k) => k in b && deepEq(a[k], b[k]));
    if (name === 'addedKeys') return new RSet(added);
    if (name === 'removedKeys') return new RSet(removed);
    if (name === 'changedKeys') return new RSet(changedK);
    if (name === 'unchangedKeys') return new RSet(unchanged);
    if (name === 'affectedKeys') return new RSet([...added, ...removed, ...changedK]);
    return ERR('unknown MapDiff method ' + name);
  }
  if (t === 'string') {
    if (name === 'size') return obj.length;
    if (name === 'matches') return new RegExp('^(?:' + args[0] + ')$').test(obj);
    if (name === 'split') return obj.split(args[0]);
    if (name === 'lower') return obj.toLowerCase();
    if (name === 'upper') return obj.toUpperCase();
    if (name === 'trim') return obj.trim();
    return ERR('unknown string method ' + name);
  }
  if (t === 'list' || t === 'set') {
    const items = setOf(obj);
    const other = () => setOf(args[0]);
    if (name === 'size') return items.length;
    if (name === 'hasAny') return other().some((x) => items.some((y) => deepEq(x, y)));
    if (name === 'hasAll') return other().every((x) => items.some((y) => deepEq(x, y)));
    if (name === 'hasOnly') return items.every((x) => other().some((y) => deepEq(x, y)));
    if (name === 'concat') return [...items, ...other()];
    if (name === 'toSet') return new RSet([...items]);
    if (name === 'difference') return new RSet(items.filter((x) => !other().some((y) => deepEq(x, y))));
    if (name === 'union') return new RSet([...items, ...other().filter((x) => !items.some((y) => deepEq(x, y)))]);
    if (name === 'intersection') return new RSet(items.filter((x) => other().some((y) => deepEq(x, y))));
    if (name === 'join') return items.join(args[0] ?? '');
    return ERR('unknown list method ' + name);
  }
  if (t === 'map') {
    if (name === 'keys') return Object.keys(obj);
    if (name === 'values') return Object.values(obj);
    if (name === 'size') return Object.keys(obj).length;
    if (name === 'get') { const k = args[0]; return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : args[1]; }
    if (name === 'diff') { if (!isMap(args[0])) ERR('diff expects map'); return new MapDiff(obj, args[0]); }
    return ERR('unknown map method ' + name);
  }
  if (t === 'timestamp') {
    const d = mytParts(obj.ms);
    if (name === 'year') return d.getUTCFullYear();
    if (name === 'month') return d.getUTCMonth() + 1;
    if (name === 'day') return d.getUTCDate();
    if (name === 'hours') return d.getUTCHours();
    if (name === 'minutes') return d.getUTCMinutes();
    if (name === 'seconds') return d.getUTCSeconds();
    if (name === 'dayOfWeek') return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (name === 'toMillis') return obj.ms;
    if (name === 'date') return new Ts(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return ERR('unknown timestamp method ' + name);
  }
  if (t === 'duration') {
    if (name === 'seconds') return Math.trunc(obj.ms / 1000);
    return ERR('unknown duration method ' + name);
  }
  return ERR(`cannot call ${name} on ${t}`);
}

function binop(op, a, b) {
  const ta = typeOf(a), tb = typeOf(b);
  const num = (x) => typeof x === 'number';
  switch (op) {
    case '==': return deepEq(a, b);
    case '!=': return !deepEq(a, b);
    case '<': case '<=': case '>': case '>=': {
      let x, y;
      if (num(a) && num(b)) { x = a; y = b; }
      else if (ta === 'string' && tb === 'string') { x = a; y = b; }
      else if (ta === 'timestamp' && tb === 'timestamp') { x = a.ms; y = b.ms; }
      else if (ta === 'duration' && tb === 'duration') { x = a.ms; y = b.ms; }
      else ERR(`cannot compare ${ta} and ${tb}`);
      return op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y;
    }
    case '+':
      if (num(a) && num(b)) return a + b;
      if (ta === 'string' && tb === 'string') return a + b;
      if (ta === 'list' && tb === 'list') return [...a, ...b];
      if (ta === 'timestamp' && tb === 'duration') return new Ts(a.ms + b.ms);
      if (ta === 'duration' && tb === 'timestamp') return new Ts(a.ms + b.ms);
      if (ta === 'duration' && tb === 'duration') return new Dur(a.ms + b.ms);
      return ERR(`cannot add ${ta} and ${tb}`);
    case '-':
      if (num(a) && num(b)) return a - b;
      if (ta === 'timestamp' && tb === 'duration') return new Ts(a.ms - b.ms);
      if (ta === 'timestamp' && tb === 'timestamp') return new Dur(a.ms - b.ms);
      return ERR(`cannot subtract ${tb} from ${ta}`);
    case '*': if (num(a) && num(b)) return a * b; return ERR('bad *');
    case '/':
      if (!num(a) || !num(b)) ERR('bad /'); if (b === 0) ERR('division by zero');
      return Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b;
    case '%': if (Number.isInteger(a) && Number.isInteger(b) && b !== 0) return a % b; return ERR('bad %');
  }
  return ERR('unknown op ' + op);
}

// ---------------------------------------------------------------- evaluator
export class RulesEngine {
  constructor(src) { this.ast = parseRules(src); }

  // req: {method:'get'|'list'|'create'|'update'|'delete', path:'users/a', auth, time:Ts,
  //       resource: data|null, newData: data|null, getDoc(path, after) -> data|null}
  allowed(req) {
    const ops = req.method === 'get' || req.method === 'list' ? [req.method, 'read'] : [req.method, 'write'];
    const segs = ['databases', '(default)', 'documents', ...req.path.split('/')];
    const access = new Set();
    const ctx = { req, access };
    const errors = [];
    const results = this._walk(this.ast.matches, segs, {}, [this.ast.funcs], ops, ctx, errors);
    return { ok: results, errors, accessCount: access.size, accessed: [...access] };
  }

  _walk(matches, segs, vars, funcScopes, ops, ctx, errors) {
    for (const m of matches) {
      const bound = { ...vars }; let i = 0, ok = true;
      for (const seg of m.segs) {
        if (seg.rest) { bound[seg.wild] = segs.slice(i).join('/'); i = segs.length; break; }
        if (i >= segs.length) { ok = false; break; }
        if (seg.lit) { if (seg.lit !== segs[i]) { ok = false; break; } }
        else bound[seg.wild] = segs[i];
        i++;
      }
      if (!ok) continue;
      const scopes = [...funcScopes, m.funcs];
      if (i === segs.length) {
        for (const a of m.allows) {
          if (!a.ops.some((o) => ops.includes(o))) continue;
          try {
            const env = this._env(bound, scopes, ctx);
            if (this._eval(a.cond, env) === true) return true;
          } catch (e) { if (e instanceof RulesError) errors.push(e.message); else throw e; }
        }
      }
      if (i < segs.length || m.matches.length) {
        if (this._walk(m.matches, segs.slice(i), bound, scopes, ops, ctx, errors)) return true;
      }
    }
    return false;
  }

  _env(bound, scopes, ctx) {
    const { req } = ctx;
    const request = {
      auth: req.auth ? { uid: req.auth.uid, token: { email: req.auth.email ?? null, email_verified: !!req.auth.emailVerified } } : null,
      time: req.time,
      method: req.method,
      path: new PathV('/databases/(default)/documents/' + req.path),
      resource: req.newData ? { data: req.newData, id: req.path.split('/').pop() } : null,
    };
    const resource = req.resource ? { data: req.resource, id: req.path.split('/').pop() } : null;
    return { vars: { ...bound, database: '(default)', request, resource }, scopes, ctx };
  }

  _fn(name, env) {
    for (let i = env.scopes.length - 1; i >= 0; i--) if (env.scopes[i][name]) return env.scopes[i][name];
    return null;
  }

  _doc(pathV, after, env) {
    if (!(pathV instanceof PathV)) ERR('get() expects a path');
    const prefix = '/databases/(default)/documents/';
    if (!pathV.s.startsWith(prefix)) ERR('bad path ' + pathV.s);
    const p = pathV.s.slice(prefix.length);
    env.ctx.access.add((after ? 'after:' : '') + p);
    return env.ctx.req.getDoc(p, after);
  }

  _eval(n, env) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'list': return n.items.map((x) => this._eval(x, env));
      case 'var': {
        if (n.name in env.vars) return env.vars[n.name];
        if (n.name === 'math' || n.name === 'duration' || n.name === 'timestamp') return { __ns: n.name };
        return ERR('unknown variable ' + n.name);
      }
      case 'path': {
        let s = '';
        for (const p of n.parts) {
          if (p.lit) s += p.lit;
          else { const v = this._eval(p.expr, env); if (typeof v !== 'string') ERR('path segment must be string'); s += v; }
        }
        return new PathV(s);
      }
      case 'member': {
        const o = this._eval(n.obj, env);
        if (o === null || o === undefined) ERR(`null value has no property ${n.name}`);
        if (isMap(o) && Object.prototype.hasOwnProperty.call(o, n.name)) return o[n.name];
        return ERR(`property ${n.name} is undefined`);
      }
      case 'index': {
        const o = this._eval(n.obj, env), i = this._eval(n.idx, env);
        if (Array.isArray(o)) { if (!Number.isInteger(i) || i < 0 || i >= o.length) ERR('index out of range'); return o[i]; }
        if (isMap(o)) { if (!Object.prototype.hasOwnProperty.call(o, i)) ERR(`key ${i} missing`); return o[i]; }
        return ERR('cannot index ' + typeOf(o));
      }
      case 'not': return !asBool(this._eval(n.e, env));
      case 'neg': { const v = this._eval(n.e, env); if (typeof v !== 'number') ERR('bad -'); return -v; }
      case 'cond': return asBool(this._eval(n.c, env)) ? this._eval(n.a, env) : this._eval(n.b, env);
      case 'or': {
        let lerr = null;
        try { if (asBool(this._eval(n.l, env))) return true; } catch (e) { if (!(e instanceof RulesError)) throw e; lerr = e; }
        const r = asBool(this._eval(n.r, env));
        if (r) return true; if (lerr) throw lerr; return false;
      }
      case 'and': {
        let lerr = null;
        try { if (!asBool(this._eval(n.l, env))) return false; } catch (e) { if (!(e instanceof RulesError)) throw e; lerr = e; }
        const r = asBool(this._eval(n.r, env));
        if (!r) return false; if (lerr) throw lerr; return true;
      }
      case 'bin': return binop(n.op, this._eval(n.l, env), this._eval(n.r, env));
      case 'in': {
        const v = this._eval(n.l, env), c = this._eval(n.r, env);
        if (Array.isArray(c) || c instanceof RSet) return setOf(c).some((x) => deepEq(x, v));
        if (isMap(c)) return Object.prototype.hasOwnProperty.call(c, v);
        return ERR('bad in');
      }
      case 'is': {
        const v = this._eval(n.l, env), t = typeOf(v);
        if (n.t === 'number') return t === 'int' || t === 'float';
        if (n.t === 'float') return t === 'float' || t === 'int' && false;
        if (n.t === 'bool') return t === 'bool';
        return t === n.t;
      }
      case 'mcall': {
        if (n.obj.k === 'var' && ['math', 'duration', 'timestamp'].includes(n.obj.name) && !(n.obj.name in env.vars)) {
          const args = n.args.map((a) => this._eval(a, env));
          const key = n.obj.name + '.' + n.name;
          if (key === 'math.floor') return Math.floor(args[0]);
          if (key === 'math.ceil') return Math.ceil(args[0]);
          if (key === 'math.abs') return Math.abs(args[0]);
          if (key === 'math.round') return Math.round(args[0]);
          if (key === 'duration.value') {
            if (!(args[1] in DUR_UNITS)) ERR('bad duration unit');
            return new Dur(args[0] * DUR_UNITS[args[1]]);
          }
          if (key === 'timestamp.date') return new Ts(Date.UTC(args[0], args[1] - 1, args[2]));
          return ERR('unknown function ' + key);
        }
        const o = this._eval(n.obj, env);
        const args = n.args.map((a) => this._eval(a, env));
        return callMethod(o, n.name, args);
      }
      case 'call': {
        const args = n.args.map((a) => this._eval(a, env));
        switch (n.name) {
          case 'get': { const d = this._doc(args[0], false, env); if (!d) ERR('get() of missing document ' + args[0].s); return { data: d }; }
          case 'getAfter': { const d = this._doc(args[0], true, env); if (!d) ERR('getAfter() of missing document ' + args[0].s); return { data: d }; }
          case 'exists': return !!this._doc(args[0], false, env);
          case 'existsAfter': return !!this._doc(args[0], true, env);
          case 'string': {
            const v = args[0];
            if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return String(v);
            if (v === null) return 'null';
            return ERR('cannot convert to string');
          }
          case 'int': return Math.trunc(Number(args[0]));
          case 'float': return Number(args[0]);
          case 'path': return new PathV(args[0]);
          case 'debug': return args[0];
        }
        const f = this._fn(n.name, env);
        if (!f) ERR('unknown function ' + n.name);
        if (f.params.length !== args.length) ERR('wrong arg count for ' + n.name);
        const depth = (env.depth || 0) + 1; if (depth > 20) ERR('max call depth');
        const vars = { ...env.vars }; f.params.forEach((p, i) => { vars[p] = args[i]; });
        const fenv = { ...env, vars, depth };
        for (const [name, e] of f.lets) fenv.vars = { ...fenv.vars, [name]: this._eval(e, fenv) };
        return this._eval(f.body, fenv);
      }
    }
    return ERR('unknown node ' + n.k);
  }
}
