"use strict";
// C23 §6.10.5.6 — Rescanning and further replacement.
// "The resulting preprocessing token sequence is rescanned, ALONG WITH ALL
//  SUBSEQUENT PREPROCESSING TOKENS OF THE SOURCE FILE, for more macro names to
//  replace."
// "If the name of the macro being replaced is found during this scan of the
//  replacement list (not including the rest of the source file's preprocessing
//  tokens), it is not replaced. ... These nonreplaced macro name preprocessing
//  tokens are no longer available for further replacement even if they are
//  later (re)examined in contexts in which that macro name preprocessing token
//  would otherwise have been replaced."
const { t, tknown, summary } = require('./harness');

// Direct self-reference is blocked permanently
t('direct self-reference paints',
  `#define X X+1\nX`, `X+1`);

// Indirect self-reference also blocked
t('indirect self-reference paints',
  `#define A B\n#define B A\nA`, `A`);

// Mutual recursion via fn-like
t('mutual fn-like recursion paints',
  `#define A(x) B(x)\n#define B(x) A(x)\nA(1)`, `A(1)`);

// Painting persists across contexts
t('painted token survives outer rescans',
  `#define X 1\n#define ID(x) x\nID(X)`, `1`);

t('painted token from inner self-ref',
  `#define A A b\n#define ID(x) x\nID(A)`, `A b`); // A paints itself, then b emitted

// Rescan considers subsequent source tokens (CRITICAL SPEC REQUIREMENT)
t('rescan picks up ( from subsequent source',
  `#define F() G\n#define G() x\nF()()`, `x`);

t('rescan picks up arg from subsequent source',
  `#define F() G\n#define G(a) [a]\nF()(7)`, `[7]`);

// Multi-token substitution where last token is fn-like
t('rescan sees subsequent ( after multi-token expansion',
  `#define F() pre G\n#define G() x\nF()()`, `pre x`);

// The DEFER pattern (Boost.Preprocessor classic)
t('DEFER defers expansion by one rescan',
  `#define EMPTY()
#define DEFER(id) id EMPTY()
#define A() 1
#define EXPAND(x) x
EXPAND(DEFER(A)())`,
  `1`);

// User's deferred example: B vs C show one rescan layer's worth of difference
t('B(E) — one less rescan layer',
  `#define A(...)__VA_ARGS__
#define B(M,...)M(__VA_ARGS__)
#define D
#define E()F D()
#define F()A(42)
B(E)`,
  `F ()`);

t('C(E) — one more rescan layer',
  `#define A(...)__VA_ARGS__
#define C(M,...)A(M(__VA_ARGS__))
#define D
#define E()F D()
#define F()A(42)
C(E)`,
  `A(42)`);

// Chaos PP / Boost FOR_EACH chain — the `)` of each step is a SOURCE token
// (not from the inner macro's body), so its hide-set is empty. That makes the
// intersection of name and close hides empty, and the chain escapes prior
// macros' paint instead of being terminated by it. gcc / clang produce the
// same.
t('A→B chain expands all levels (hide-set intersection rule)',
  `#define A(x) [x] B
#define B(x) [x] A
A(1)(2)(3)(4)(5)`,
  `[1] [2] [3] [4] [5] B`);

t('FOR_EACH-style chain with END terminator',
  `#define END(...) END_(__VA_ARGS__)
#define END_(...) __VA_ARGS__##_END
#define A(x) [x] B
#define B(x) [x] A
#define A_END
#define B_END
END(A (1)(2)(3))`,
  `[1] [2] [3]`);

// Sanity check: even though the chain escapes paint, a pure cycle (where
// the `(` and `)` are BOTH inside the outer body) must still paint.
t('mutual fn-like cycle still paints despite intersection rule',
  `#define A(x) B(x)
#define B(x) A(x)
A(1)`,
  `A(1)`);

// KNOWN GAP — Boost.PP EVAL/DEFER recursion. This pattern relies on gcc's
// context-stack expansion model: when a macro M's expansion completes (i.e.
// the scan exits M's body), M is removed from the active "expanding" set.
// Macroscope uses Prosser-style per-token hide-sets, which accumulate
// monotonically and never drop M — so when A_'s body produces `A`, that
// new `A` token inherits A's hide via the intersection rule (because the
// `)` of A_() also lives inside something descended from A's expansion).
// Implementing this properly requires a structural rewrite of the
// expansion engine to track macro-expansion lifetimes as a stack.
//
// Macroscope produces ~2 unblock levels and then paints A; gcc produces
// ~40. Both implementations agree the chain TERMINATES correctly; they
// disagree on how deep it iterates.
tknown('Boost.PP EVAL/DEFER recursion (40+ levels)',
  `#define EVAL(...) EVAL1(EVAL1(EVAL1(__VA_ARGS__)))
#define EVAL1(...) EVAL2(EVAL2(EVAL2(__VA_ARGS__)))
#define EVAL2(...) EVAL3(EVAL3(EVAL3(__VA_ARGS__)))
#define EVAL3(...) __VA_ARGS__
#define EMPTY()
#define DEFER(id) id EMPTY()
#define A(x) [x] DEFER(B_)()(x+1)
#define B(x) [x] DEFER(A_)()(x+1)
#define A_() A
#define B_() B
EVAL(A(0))`,
  '~40 levels of [n+1+...+1] terminated by deferred call',
  '[0] [0+1] A(0+1+1) — only 2 levels before per-token hide blocks A');

summary('§6.10.5.6 rescan & paint');
