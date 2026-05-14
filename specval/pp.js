"use strict";

// ===========================================================================
// Macroscope — preprocessor reference implementation (Node module).
//
// This file mirrors the logic embedded in ../index.html so the spec-validation
// suite can exercise the same code paths under Node. Keep the two in lockstep.
//
// Covers the macro-replacement portion of C23 §6.10.5 plus §6.10.3.5 #undef.
// ===========================================================================

// ---------------------------------------------------------------------------
// Tokenizer (translation phases 3+, comments → single space).
// Tracks line numbers per token and reports unterminated literals/comments
// via the optional `errors` array.
// ---------------------------------------------------------------------------

function tokenize(src, errors, startLine) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  let line = startLine || 1;
  const report = (lno, msg) => { if (errors) errors.push({ line: lno, msg }); };

  while (i < n) {
    const c = src[i];
    const tokLine = line;

    if (/\s/.test(c)) {
      let s = '';
      while (i < n && /\s/.test(src[i])) {
        if (src[i] === '\n') line++;
        s += src[i++];
      }
      tokens.push({ type: 'ws', value: s, line: tokLine });
      continue;
    }
    if (c === '/' && src[i+1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      tokens.push({ type: 'ws', value: ' ', line: tokLine });
      continue;
    }
    if (c === '/' && src[i+1] === '*') {
      i += 2;
      let closed = false;
      while (i < n) {
        if (src[i] === '*' && src[i+1] === '/') { closed = true; i += 2; break; }
        if (src[i] === '\n') line++;
        i++;
      }
      if (!closed) report(tokLine, "unterminated '/* … */' block comment");
      tokens.push({ type: 'ws', value: ' ', line: tokLine });
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let s = '';
      while (i < n && /[a-zA-Z0-9_]/.test(src[i])) s += src[i++];
      tokens.push({ type: 'id', value: s, line: tokLine });
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i+1] || ''))) {
      let s = '';
      while (i < n && /[0-9a-zA-Z._]/.test(src[i])) {
        if ((src[i] === 'e' || src[i] === 'E') && (src[i+1] === '+' || src[i+1] === '-')) {
          s += src[i++]; s += src[i++]; continue;
        }
        s += src[i++];
      }
      tokens.push({ type: 'num', value: s, line: tokLine });
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let s = c; i++;
      let closed = false;
      while (i < n) {
        if (src[i] === q) { s += src[i++]; closed = true; break; }
        if (src[i] === '\n') break;
        if (src[i] === '\\' && i + 1 < n) { s += src[i++]; s += src[i++]; continue; }
        s += src[i++];
      }
      if (!closed) report(tokLine, `unterminated ${q === '"' ? 'string' : 'character'} literal`);
      tokens.push({ type: 'str', value: s, line: tokLine });
      continue;
    }
    if (c === '#' && src[i+1] === '#') {
      tokens.push({ type: 'hashhash', value: '##', line: tokLine });
      i += 2;
      continue;
    }
    if (c === '#') {
      tokens.push({ type: 'hash', value: '#', line: tokLine });
      i++;
      continue;
    }
    const two = src.substr(i, 2);
    if (['==','!=','<=','>=','&&','||','<<','>>','++','--','->','+=','-=','*=','/=','%=','&=','|=','^='].includes(two)) {
      tokens.push({ type: 'punct', value: two, line: tokLine });
      i += 2;
      continue;
    }
    tokens.push({ type: 'punct', value: c, line: tokLine });
    i++;
  }
  return tokens;
}

function detok(tokens) { return tokens.map(t => t.value).join(''); }

function trimWs(tokens) {
  let lo = 0, hi = tokens.length;
  while (lo < hi && tokens[lo].type === 'ws') lo++;
  while (hi > lo && tokens[hi-1].type === 'ws') hi--;
  return tokens.slice(lo, hi);
}

function cloneToken(t) { return { ...t, hide: t.hide ? new Set(t.hide) : new Set() }; }
function cloneTokens(toks) { return toks.map(cloneToken); }

// ---------------------------------------------------------------------------
// Source parsing → ordered command list:
//   { type: 'define', name, macro, line }
//   { type: 'undef',  name, line }
//   { type: 'content', tokens }
// Plus a structured errors[] of { line, msg } entries.
// ---------------------------------------------------------------------------

function parseInput(source) {
  const commands = [];
  const errors = [];
  source = source.replace(/\\\n/g, ' ');
  const lines = source.split('\n');

  let contentBuf = '';
  let contentStartLine = 1;

  const flush = () => {
    if (contentBuf.length > 0) {
      const tokErrs = [];
      const tokens = tokenize(contentBuf, tokErrs, contentStartLine);
      for (const e of tokErrs) errors.push(e);
      const meaningful = tokens.some(t => t.type !== 'ws');
      if (meaningful) commands.push({ type: 'content', tokens });
    }
    contentBuf = '';
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const lineNo = li + 1;
    const line = raw.trim();

    if (!line) {
      contentBuf += '\n';
      continue;
    }
    if (line.startsWith('#')) {
      contentBuf += '\n';   // keep line counting aligned

      // Unclosed fn-like param list — detect before main regex
      const unclosedFn = line.match(/^#\s*define\s+(\w+)\(/);
      if (unclosedFn && !/^#\s*define\s+\w+\([^)]*\)/.test(line)) {
        errors.push({ line: lineNo, msg: `unclosed parameter list in #define ${unclosedFn[1]}` });
        flush();
        contentStartLine = lineNo + 1;
        continue;
      }

      const defM = line.match(/^#\s*define\s+(\w+)(\([^)]*\))?(.*)$/);
      const undefM = line.match(/^#\s*undef\s+(\w+)\s*$/);
      const defNoNameM = !defM && /^#\s*define\b/.test(line);
      const undefNoNameM = !undefM && /^#\s*undef\b/.test(line);

      if (defM) {
        flush();
        contentStartLine = lineNo + 1;
        const name = defM[1];
        const paramsSrc = defM[2];
        const bodySrc = defM[3].replace(/^\s+/, '');
        let macro;
        if (paramsSrc) {
          const inner = paramsSrc.slice(1, -1).trim();
          const rawParams = inner ? inner.split(',').map(p => p.trim()) : [];
          let variadic = false;
          const params = [];
          for (let pi = 0; pi < rawParams.length; pi++) {
            if (rawParams[pi] === '...') {
              if (pi === rawParams.length - 1) variadic = true;
              else errors.push({ line: lineNo, msg: `'...' must be the last parameter of ${name}` });
            } else if (!/^[a-zA-Z_]\w*$/.test(rawParams[pi])) {
              errors.push({ line: lineNo, msg: `invalid parameter name '${rawParams[pi]}' in ${name}` });
            } else if (params.includes(rawParams[pi])) {
              errors.push({ line: lineNo, msg: `duplicate parameter '${rawParams[pi]}' in ${name}` });
            } else {
              params.push(rawParams[pi]);
            }
          }
          macro = { kind: 'fn', name, params, variadic, body: tokenize(bodySrc, errors, lineNo) };
        } else {
          macro = { kind: 'obj', name, body: tokenize(bodySrc, errors, lineNo) };
        }
        commands.push({ type: 'define', name, macro, line: lineNo });
      } else if (undefM) {
        flush();
        contentStartLine = lineNo + 1;
        commands.push({ type: 'undef', name: undefM[1], line: lineNo });
      } else if (defNoNameM) {
        errors.push({ line: lineNo, msg: `#define is missing a macro name` });
      } else if (undefNoNameM) {
        errors.push({ line: lineNo, msg: `#undef is missing a macro name` });
      } else if (/^#\s*(if|ifdef|ifndef|else|elif|elifdef|elifndef|endif|include|pragma|error|warning|line|embed)\b/.test(line)) {
        errors.push({ line: lineNo, msg: `directive '#${line.match(/^#\s*(\w+)/)[1]}' not supported by this simulator` });
      } else {
        errors.push({ line: lineNo, msg: `unrecognized directive: ${line}` });
      }
    } else {
      contentBuf += raw + '\n';
    }
  }
  flush();

  // Body validation (§6.10.5.3 #, §6.10.5.4 ##, §6.10.5 variadic).
  for (const cmd of commands) {
    if (cmd.type !== 'define') continue;
    const m = cmd.macro;
    const body = m.body;
    const tBody = trimWs(body);

    if (tBody.length > 0) {
      if (tBody[0].type === 'hashhash') {
        errors.push({ line: cmd.line, msg: `'##' cannot appear at the start of ${m.name}'s body` });
      }
      if (tBody.length > 1 && tBody[tBody.length - 1].type === 'hashhash') {
        errors.push({ line: cmd.line, msg: `'##' cannot appear at the end of ${m.name}'s body` });
      }
    }

    if (m.kind === 'fn') {
      for (let bi = 0; bi < body.length; bi++) {
        if (body[bi].type !== 'hash') continue;
        let bj = bi + 1;
        while (bj < body.length && body[bj].type === 'ws') bj++;
        const next = body[bj];
        if (!next || next.type !== 'id') {
          errors.push({ line: cmd.line, msg: `'#' must be followed by a parameter name in ${m.name}` });
          break;
        }
        const isParam = m.params.includes(next.value) || (m.variadic && next.value === '__VA_ARGS__');
        if (!isParam) {
          errors.push({ line: cmd.line, msg: `'#' followed by non-parameter '${next.value}' in ${m.name}` });
          break;
        }
      }
    }

    if (!m.variadic) {
      for (const t of body) {
        if (t.type === 'id' && (t.value === '__VA_ARGS__' || t.value === '__VA_OPT__')) {
          errors.push({ line: cmd.line, msg: `'${t.value}' is valid only inside a variadic macro (${m.name} is not variadic)` });
          break;
        }
      }
    }
  }

  // De-dupe + sort.
  const seen = new Set();
  const deduped = [];
  for (const e of errors) {
    const key = `${e.line}|${e.msg}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(e); }
  }
  deduped.sort((a, b) => (a.line || 0) - (b.line || 0));

  return { commands, errors: deduped };
}

// ---------------------------------------------------------------------------
// Preprocessor — iterative splicing, per-token hide sets (Prosser-style).
// ---------------------------------------------------------------------------

class Preprocessor {
  constructor(macros) {
    this.macros = macros;
    this.steps = [];
  }

  record(/* kind, desc, tokens, marker */) { /* no-op for Node tests */ }

  collectArgs(tokens, openIdx) {
    const args = [];
    const argPositions = [];
    let cur = [];
    let curStart = openIdx + 1;
    let depth = 0;
    let i = openIdx + 1;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.value === '(') { depth++; cur.push(t); i++; continue; }
      if (t.value === ')') {
        if (depth === 0) {
          if (cur.length > 0 || args.length > 0) {
            args.push(cur);
            argPositions.push({ start: curStart, end: i });
          }
          return [args, argPositions, i];
        }
        depth--; cur.push(t); i++; continue;
      }
      if (t.value === ',' && depth === 0) {
        args.push(cur);
        argPositions.push({ start: curStart, end: i });
        cur = [];
        i++;
        curStart = i;
        continue;
      }
      cur.push(t); i++;
    }
    return null;
  }

  process(initialTokens) {
    let tokens = initialTokens.map(t => ({
      ...t,
      hide: t.hide ? new Set(t.hide) : new Set()
    }));

    let i = 0;
    let iters = 0;
    const ITER_LIMIT = 100000;

    while (i < tokens.length) {
      if (++iters > ITER_LIMIT) return tokens;
      const tok = tokens[i];

      if (tok.type !== 'id' || tok.hide.has(tok.value) || !this.macros.has(tok.value)) {
        i++;
        continue;
      }

      const macro = this.macros.get(tok.value);

      if (macro.kind === 'obj') {
        // §6.10.5.5: ## processing happens for both object-like and function-
        // like bodies. Route obj-like bodies through substitute() with empty
        // params so any ## (or stray #) in the body is handled.
        const substituted = this.substitute(macro.body, [], [], []);
        const newHide = new Set(tok.hide); newHide.add(macro.name);
        const replacement = substituted.map(b => ({
          ...b,
          hide: new Set([...(b.hide || []), ...newHide])
        }));
        tokens = tokens.slice(0, i).concat(replacement, tokens.slice(i + 1));
        continue;
      }

      let j = i + 1;
      while (j < tokens.length && tokens[j].type === 'ws') j++;
      if (j >= tokens.length || tokens[j].value !== '(') {
        i++;
        continue;
      }

      const argResult = this.collectArgs(tokens, j);
      if (!argResult) return tokens;
      const [rawArgs, , closeIdx] = argResult;

      let args = rawArgs;
      if (args.length === 0 && macro.params.length > 0) args = [[]];

      const fixedCount = macro.params.length;
      const arityOk = macro.variadic ? args.length >= fixedCount : args.length === fixedCount;
      if (!arityOk) { i = closeIdx + 1; continue; }

      let effectiveParams, allArgs;
      if (macro.variadic) {
        effectiveParams = [...macro.params, '__VA_ARGS__'];
        const fixed = args.slice(0, fixedCount);
        const variadicArgs = args.slice(fixedCount);
        const vaTokens = [];
        for (let k = 0; k < variadicArgs.length; k++) {
          if (k > 0) {
            vaTokens.push({ type: 'punct', value: ',', hide: new Set() });
            vaTokens.push({ type: 'ws',    value: ' ', hide: new Set() });
          }
          vaTokens.push(...variadicArgs[k]);
        }
        allArgs = [...fixed, vaTokens];
      } else {
        effectiveParams = macro.params;
        allArgs = args;
      }

      const prescanned = [];
      for (let k = 0; k < allArgs.length; k++) {
        const subPP = new Preprocessor(this.macros);
        const argInput = allArgs[k].map(t => ({ ...t, hide: t.hide ? new Set(t.hide) : new Set() }));
        prescanned.push(subPP.process(argInput));
      }

      const substituted = this.substitute(macro.body, effectiveParams, allArgs, prescanned);

      // §6.10.5.6 / Prosser fn-like rule: invocation's hide-set is the
      // intersection of the name token's and the closing-paren's hide-sets,
      // plus the macro itself. The intersection is what lets `M(...)`
      // invocations whose `)` came from outside M's body escape M's hide
      // (so the FOR_EACH / END_END chain trick works), while keeping cycle
      // painting intact when `(` and `)` are both inside the outer body.
      const closeHide = tokens[closeIdx].hide || new Set();
      const newHide = new Set();
      for (const h of tok.hide) if (closeHide.has(h)) newHide.add(h);
      newHide.add(macro.name);
      const final = substituted.map(t => ({
        ...t,
        hide: new Set([...(t.hide || []), ...newHide])
      }));

      tokens = tokens.slice(0, i).concat(final, tokens.slice(closeIdx + 1));
    }

    return tokens;
  }

  substitute(body, params, args, prescanned) {
    const result = [];
    const paramIdx = (name) => params.indexOf(name);

    const rawValue = (t) => {
      if (t.type === 'id') {
        const pi = paramIdx(t.value);
        if (pi >= 0) return detok(trimWs(args[pi]));
      }
      return t.value;
    };

    const nextNonWs = (p) => {
      while (p < body.length && body[p].type === 'ws') p++;
      return p;
    };

    // §6.10.5.3: whitespace between tokens → single space, leading/trailing
    // stripped, \ and " escaped inside string/char-literal token spellings.
    const stringizeArg = (argTokens) => {
      const trimmed = trimWs(argTokens);
      let s = '';
      let prevWasNonWs = false;
      for (const t of trimmed) {
        if (t.type === 'ws') {
          if (prevWasNonWs) { s += ' '; prevWasNonWs = false; }
        } else {
          let spelling = t.value;
          if (t.type === 'str') {
            spelling = spelling.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          }
          s += spelling;
          prevWasNonWs = true;
        }
      }
      return '"' + s + '"';
    };

    let i = 0;
    while (i < body.length) {
      const t = body[i];

      if (t.type === 'hash') {
        const j = nextNonWs(i + 1);
        if (j < body.length && body[j].type === 'id') {
          const pi = paramIdx(body[j].value);
          if (pi >= 0) {
            result.push({ type: 'str', value: stringizeArg(args[pi]), hide: new Set() });
            i = j + 1;
            continue;
          }
        }
        result.push({ ...t });
        i++;
        continue;
      }

      if (t.type === 'id' && t.value === '__VA_OPT__') {
        const j = nextNonWs(i + 1);
        if (j < body.length && body[j].value === '(') {
          let depth = 1;
          let k = j + 1;
          while (k < body.length && depth > 0) {
            if (body[k].value === '(') depth++;
            else if (body[k].value === ')') {
              depth--;
              if (depth === 0) break;
            }
            k++;
          }
          if (k < body.length && body[k].value === ')') {
            const optContent = body.slice(j + 1, k);
            const vaIdx = paramIdx('__VA_ARGS__');
            const vaEmpty = vaIdx < 0 || trimWs(args[vaIdx]).length === 0;
            if (!vaEmpty) {
              result.push(...this.substitute(optContent, params, args, prescanned));
            }
            i = k + 1;
            continue;
          }
        }
        result.push({ ...t });
        i++;
        continue;
      }

      const lookahead = nextNonWs(i + 1);
      if (lookahead < body.length && body[lookahead].type === 'hashhash') {
        let pastedStr = rawValue(t);
        let curIdx = i;
        while (true) {
          const opIdx = nextNonWs(curIdx + 1);
          if (opIdx >= body.length || body[opIdx].type !== 'hashhash') break;
          const rhsIdx = nextNonWs(opIdx + 1);
          if (rhsIdx >= body.length) break;
          pastedStr += rawValue(body[rhsIdx]);
          curIdx = rhsIdx;
        }
        const retoks = tokenize(pastedStr).map(t => ({ ...t, hide: new Set() }));
        result.push(...trimWs(retoks));
        i = curIdx + 1;
        continue;
      }

      if (t.type === 'id') {
        const pi = paramIdx(t.value);
        if (pi >= 0) {
          // §6.10.5.1: whitespace is not a preprocessing token. Strip wrapping
          // ws on substitution so `M(  x  )` substitutes `x`, not `  x  ` —
          // and an all-whitespace arg substitutes to nothing.
          result.push(...cloneTokens(trimWs(prescanned[pi])));
          i++;
          continue;
        }
      }

      result.push({ ...t });
      i++;
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Top-level: process commands in order, expand each content segment with the
// macros snapshot in effect at that point.
// ---------------------------------------------------------------------------

function runOne(source) {
  const { commands } = parseInput(source);
  const macros = new Map();
  const results = [];
  for (const cmd of commands) {
    if (cmd.type === 'define') macros.set(cmd.name, cmd.macro);
    else if (cmd.type === 'undef') macros.delete(cmd.name);
    else if (cmd.type === 'content') {
      const pp = new Preprocessor(macros);
      results.push(...pp.process(cmd.tokens));
    }
  }
  return detok(trimWs(results));
}

module.exports = { tokenize, detok, trimWs, cloneTokens, parseInput, Preprocessor, runOne };
