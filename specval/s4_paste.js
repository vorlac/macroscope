"use strict";
// C23 §6.10.5.4 — The ## operator.
// Operands not macro-expanded. Empty arg as ## operand → placemarker.
// Placemarker ## non-placemarker = non-placemarker.
// Placemarker ## placemarker = placemarker.
// Result rescanned for further macros. Result must be valid pp-token (else UB).
const { t, summary } = require('./harness');

// Basic
t('basic paste of two identifiers',
  `#define C(a,b) a##b\nC(foo,bar)`, `foobar`);

// ## blocks expansion of operands
t('## blocks operand expansion',
  `#define P pre_\n#define C(a,b) a##b\nC(P,x)`, `Px`);

// CAT_/CAT indirection
t('CAT_/CAT indirection forces prescan of args',
  `#define P pre_\n#define C_(a,b) a##b\n#define C(a,b) C_(a,b)\nC(P,x)`, `pre_x`);

// Pasted result rescanned (forms a macro name)
t('paste result rescanned if forms macro',
  `#define C_(a,b) a##b\n#define C(a,b) C_(a,b)\n#define foo_bar 99\nC(foo,_bar)`, `99`);

// Pasted result rescanned (forms a pp-number, not a macro)
t('paste forms pp-number',
  `#define C(a,b) a##b\nC(1,2)`, `12`);

// Empty arg as ## operand: placemarker → non-placemarker pasted with placemarker = non-placemarker
t('empty lhs ## rhs = rhs',
  `#define C(a,b) a##b\nC(,x)`, `x`);

t('lhs ## empty rhs = lhs',
  `#define C(a,b) a##b\nC(x,)`, `x`);

t('empty ## empty = empty (placemarker)',
  `#define C(a,b) a##b\nC(,)`, ``);

// ## chains, left-to-right
t('three-way chain a##b##c',
  `#define C3(a,b,c) a##b##c\nC3(x,y,z)`, `xyz`);

t('four-way chain',
  `#define C4(a,b,c,d) a##b##c##d\nC4(w,x,y,z)`, `wxyz`);

// ## with __VA_ARGS__
t('## __VA_ARGS__ pastes joined raw varargs',
  `#define F(x,...) x##__VA_ARGS__\nF(p,a)`, `pa`);

// Pasted then immediately invoked as macro
t('pasted name invoked as fn-like macro after rescan',
  `#define foo_bar(x) [x]\n#define C(a,b) a##b\n#define D(a,b) C(a,b)\nD(foo,_bar)(7)`,
  `[7]`);

// ## inside an object-like body — §6.10.5.5 applies to BOTH kinds. The
// body must be routed through substitute() so the paste happens, not just
// spliced verbatim into the stream.
t('## in obj-like body is processed (not left as ##)',
  `#define M m##M\nM`, `mM`);

t('## in obj-like body forms valid pp-token',
  `#define J pre##suf\nJ`, `presuf`);

summary('§6.10.5.4 paste');
