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

// EXPAND supplies exactly ONE rescan pass. Inside A(0)'s prescan, DEFER splits
// B_ from its `()`, so B_ is skipped and left in the output stream. On the
// rescan EXPAND triggers, B_() is now adjacent → expands to B(0+1) → `[0+1]`
// plus DEFER(A_)()  which defers A_ the same way. No more rescans remain, so
// A_ is left un-invoked.
t('EXPAND gives one extra rescan — A/B alternation produces 2 levels',
  `#define EMPTY()
#define DEFER(id) id EMPTY()
#define EXPAND(x) x
#define A(x) [x] DEFER(B_)()(x+1)
#define B(x) [x] DEFER(A_)()(x+1)
#define A_() A
#define B_() B
EXPAND(A(0))`,
  `[0] [0+1] A_ ()(0+1+1)`);

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

// Boost.PP EVAL/DEFER recursion. With cpplib/clang-style context-stack
// expansion, a macro is "active" only while its body context is on the stack;
// once the context exhausts, the macro pops off and is eligible to expand
// again. That's what lets `A_()` produce a fresh `A` token that re-expands
// (since the original `A(0)` context popped long ago), and EVAL's nested
// invocations supply the rescan layers that keep the chain going. Total
// iteration count: 1 (initial A(0) prescan) + 1 (EVAL) + 3 (EVAL1) + 9
// (EVAL2) + 27 (EVAL3) = 41. Matches gcc and clang exactly.
{
  const N = 41;
  const bumps = (k) => '0' + '+1'.repeat(k);
  const levels = [];
  for (let k = 0; k < N; k++) levels.push(`[${bumps(k)}]`);
  const expected = levels.join(' ') + ` B_ ()(${bumps(N)})`;
  t('Boost.PP EVAL/DEFER recursion (41 levels — gcc/clang parity)',
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
    expected);
}

summary('§6.10.5.6 rescan & paint');
