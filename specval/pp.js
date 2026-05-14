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
    // Digraphs (§6.4.6) — longest match first
    if (c === '%' && src[i+1] === ':' && src[i+2] === '%' && src[i+3] === ':') {
      tokens.push({ type: 'hashhash', value: '##', line: tokLine });
      i += 4; continue;
    }
    if (c === '%' && src[i+1] === ':') {
      tokens.push({ type: 'hash', value: '#', line: tokLine });
      i += 2; continue;
    }
    if (c === '<' && src[i+1] === ':') {
      tokens.push({ type: 'punct', value: '[', line: tokLine });
      i += 2; continue;
    }
    if (c === ':' && src[i+1] === '>') {
      tokens.push({ type: 'punct', value: ']', line: tokLine });
      i += 2; continue;
    }
    if (c === '<' && src[i+1] === '%') {
      tokens.push({ type: 'punct', value: '{', line: tokLine });
      i += 2; continue;
    }
    if (c === '%' && src[i+1] === '>') {
      tokens.push({ type: 'punct', value: '}', line: tokLine });
      i += 2; continue;
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

    // Normalize for directive detection: strip leading block-comments
    // (/**/#define X → #define X) then collapse comments between # and the
    // directive keyword (#/**/define X → #define X).  Comments are replaced
    // by whitespace in translation phase 3, so both forms are well-formed.
    // Also map the %: digraph to # so %:define X is recognized as a directive.
    let directiveLine = line;
    while (/^\/\*[^]*?\*\//.test(directiveLine))
      directiveLine = directiveLine.replace(/^\/\*[^]*?\*\//, '').trimStart();
    if (directiveLine.startsWith('%:'))
      directiveLine = '#' + directiveLine.slice(2);
    directiveLine = directiveLine.replace(/^(#\s*)(?:\/\*[^]*?\*\/\s*)*/g, '$1');

    if (directiveLine.startsWith('#')) {
      contentBuf += '\n';   // keep line counting aligned

      const unclosedFn = directiveLine.match(/^#\s*define\s+(\w+)\(/);
      if (unclosedFn && !/^#\s*define\s+\w+\([^)]*\)/.test(directiveLine)) {
        errors.push({ line: lineNo, msg: `unclosed parameter list in #define ${unclosedFn[1]}` });
        flush();
        contentStartLine = lineNo + 1;
        continue;
      }

      const defM = directiveLine.match(/^#\s*define\s+(\w+)(\([^)]*\))?(.*)$/);
      const undefM = directiveLine.match(/^#\s*undef\s+(\w+)\s*$/);
      const defNoNameM = !defM && /^#\s*define\b/.test(directiveLine);
      const undefNoNameM = !undefM && /^#\s*undef\b/.test(directiveLine);

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
          macro = { kind: 'fn', name, params, variadic, body: trimWs(tokenize(bodySrc, errors, lineNo)) };
        } else {
          macro = { kind: 'obj', name, body: trimWs(tokenize(bodySrc, errors, lineNo)) };
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
      } else if (/^#\s*(if|ifdef|ifndef|else|elif|elifdef|elifndef|endif|include|pragma|error|warning|line|embed)\b/.test(directiveLine)) {
        errors.push({ line: lineNo, msg: `directive '#${directiveLine.match(/^#\s*(\w+)/)[1]}' not supported by this simulator` });
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
// Preprocessor — context-stack expansion (cpplib / Clang style).
//
// Tokens are pulled lazily from a stack of contexts. Each context corresponds
// to a macro's substituted body (or the original input for the bottom frame).
// A macro is "active" while its context is on the stack; when the context
// exhausts, the macro pops off and is eligible for expansion again. This is
// the model gcc and clang use, and it's what enables Boost.PP-style EVAL/DEFER
// recursion — a fresh `A` token produced by `A_()` after A's own context has
// already popped is free to expand again.
//
// Per-token hide-sets still exist, but only to *persist paint* across scan
// boundaries: when an active-macro identifier is emitted, we tag it with that
// macro's name so subsequent rescans (e.g. of a prescanned arg substituted
// into another body) keep treating it as painted.
//
// Argument prescan (§6.10.5.1 "completely macro-replaced before substitution")
// runs as a fresh sub-expansion. Crucially, the OUTER active stack propagates
// to the prescan — that prevents `M(x) ID(M(x))` from looping — but the macro
// being invoked is NOT yet active, which is what lets the EVAL pattern's
// nested same-named calls each expand in turn.
// ---------------------------------------------------------------------------

class Preprocessor {
  constructor(macros) {
    this.macros = macros;
    this.steps = [];
  }

  record(/* kind, desc, tokens, marker */) { /* no-op for Node tests */ }

  process(initialTokens) {
    return this._expand(initialTokens, null);
  }

  // Expand `initialTokens`. `outerActive` is a Set of macro names treated as
  // active in addition to whatever this expansion pushes onto its own stack
  // (used for arg prescan to inherit the calling expansion's active set).
  _expand(initialTokens, outerActive) {
    const ctxs = [{
      tokens: initialTokens.map(t => ({
        ...t,
        hide: t.hide ? new Set(t.hide) : new Set()
      })),
      pos: 0,
      macro: null
    }];
    const output = [];

    const isActive = (name) => {
      if (outerActive && outerActive.has(name)) return true;
      for (const ctx of ctxs) if (ctx.macro === name) return true;
      return false;
    };

    const popExhausted = () => {
      while (ctxs.length > 0) {
        const top = ctxs[ctxs.length - 1];
        if (top.pos < top.tokens.length) return;
        ctxs.pop();
      }
    };

    const consume = () => {
      popExhausted();
      if (ctxs.length === 0) return null;
      const top = ctxs[ctxs.length - 1];
      return top.tokens[top.pos++];
    };

    // Look ahead for the next non-ws token across all live contexts WITHOUT
    // popping — used to decide if a fn-like macro identifier is followed by
    // '(' (possibly across context boundaries, e.g. F() expanding to G with
    // the '(' coming from the surrounding source).
    const peekNonWs = () => {
      for (let ci = ctxs.length - 1; ci >= 0; ci--) {
        const ctx = ctxs[ci];
        for (let p = ctx.pos; p < ctx.tokens.length; p++) {
          if (ctx.tokens[p].type !== 'ws') return ctx.tokens[p];
        }
      }
      return null;
    };

    // Consume a fn-like macro's argument list (assumes peekNonWs() == '(').
    // Spans context boundaries naturally, since consume() pops as it goes.
    const collectArgsFromStream = () => {
      while (true) {
        popExhausted();
        if (ctxs.length === 0) return null;
        const top = ctxs[ctxs.length - 1];
        const t = top.tokens[top.pos];
        if (t.type === 'ws') { top.pos++; continue; }
        if (t.value === '(') { top.pos++; break; }
        return null;
      }
      const args = [];
      let cur = [];
      let depth = 0;
      while (true) {
        const t = consume();
        if (t === null) return null;
        if (t.value === '(') { depth++; cur.push(t); continue; }
        if (t.value === ')') {
          if (depth === 0) {
            // Only push cur if it contains non-whitespace tokens OR we already
            // have prior args. Pure-whitespace content between parens (e.g.
            // F(\n)) is not a pp-token and must not count as an argument.
            if (trimWs(cur).length > 0 || args.length > 0) args.push(cur);
            return args;
          }
          depth--; cur.push(t); continue;
        }
        if (t.value === ',' && depth === 0) {
          args.push(cur); cur = []; continue;
        }
        cur.push(t);
      }
    };

    // Snapshot of macros active at the moment of an arg prescan. The macro
    // currently being invoked is intentionally not yet on the stack.
    const prescanActive = () => {
      const s = new Set();
      if (outerActive) for (const m of outerActive) s.add(m);
      for (const ctx of ctxs) if (ctx.macro !== null) s.add(ctx.macro);
      return s;
    };

    let iters = 0;
    const ITER_LIMIT = 10000000;

    while (true) {
      if (++iters > ITER_LIMIT) break;
      popExhausted();
      if (ctxs.length === 0) break;
      const tok = consume();
      if (tok === null) break;

      if (tok.type !== 'id') { output.push(tok); continue; }

      const name = tok.value;

      // Painted by a prior expansion (hide-set carries paint across scans).
      if (tok.hide && tok.hide.has(name)) { output.push(tok); continue; }
      // Not a known macro.
      if (!this.macros.has(name)) { output.push(tok); continue; }
      // Currently being expanded — paint and emit so future rescans honor it.
      if (isActive(name)) {
        const newHide = new Set(tok.hide || []);
        newHide.add(name);
        output.push({ ...tok, hide: newHide });
        continue;
      }

      const macro = this.macros.get(name);

      if (macro.kind === 'obj') {
        // §6.10.5.5: route obj bodies through substitute() so '##' and any
        // stray '#' are processed even though there are no params/args.
        const substituted = this.substitute(macro.body, [], [], []);
        ctxs.push({ tokens: substituted, pos: 0, macro: name });
        continue;
      }

      // Function-like: only invokes if the next non-ws token across the
      // live contexts is '('. Otherwise emit the bare identifier.
      const next = peekNonWs();
      if (!next || next.value !== '(') { output.push(tok); continue; }

      const rawArgs = collectArgsFromStream();
      if (rawArgs === null) { output.push(tok); continue; }

      let args = rawArgs;
      if (args.length === 0 && macro.params.length > 0) args = [[]];

      const fixedCount = macro.params.length;
      const arityOk = macro.variadic ? args.length >= fixedCount : args.length === fixedCount;
      if (!arityOk) {
        // Arity mismatch: emit the call verbatim (matches the prior splicing
        // behavior which left such calls untouched). collectArgsFromStream
        // already consumed the parens, so reconstruct the surface text.
        output.push(tok);
        output.push({ type: 'punct', value: '(', hide: new Set() });
        for (let k = 0; k < rawArgs.length; k++) {
          if (k > 0) output.push({ type: 'punct', value: ',', hide: new Set() });
          for (const at of rawArgs[k]) output.push(at);
        }
        output.push({ type: 'punct', value: ')', hide: new Set() });
        continue;
      }

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

      // §6.10.5.1 prescan: each arg is fully expanded by a fresh sub-expansion
      // that inherits the current active set (so direct/indirect recursive
      // uses still paint). The macro being invoked is intentionally absent
      // from prescanActive(): same-named nested calls (EVAL pattern) need to
      // expand within their own arg.
      const subActive = prescanActive();
      const prescanned = [];
      for (let k = 0; k < allArgs.length; k++) {
        const subPP = new Preprocessor(this.macros);
        prescanned.push(subPP._expand(allArgs[k], subActive));
      }

      const substituted = this.substitute(macro.body, effectiveParams, allArgs, prescanned);

      ctxs.push({ tokens: substituted, pos: 0, macro: name });
    }

    return output;
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
          // §6.10.3.6: # __VA_OPT__(content) — stringize the VA_OPT expansion as a unit
          if (body[j].value === '__VA_OPT__') {
            const k0 = nextNonWs(j + 1);
            if (k0 < body.length && body[k0].value === '(') {
              let depth = 1, k = k0 + 1;
              while (k < body.length && depth > 0) {
                if (body[k].value === '(') depth++;
                else if (body[k].value === ')') { depth--; if (depth === 0) break; }
                k++;
              }
              if (k < body.length && body[k].value === ')') {
                const vaIdx = paramIdx('__VA_ARGS__');
                const vaEmpty = vaIdx < 0 || trimWs(args[vaIdx]).length === 0;
                const expanded = vaEmpty ? [] : this.substitute(body.slice(k0 + 1, k), params, args, prescanned);
                result.push({ type: 'str', value: stringizeArg(expanded), hide: new Set() });
                i = k + 1;
                continue;
              }
            }
          }
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
