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
const { t, summary } = require('./harness');

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

summary('§6.10.5.6 rescan & paint');
