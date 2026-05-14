"use strict";
// C23 §6.10.5.2 — Argument substitution.
// "Before being substituted, each argument's preprocessing tokens are
//  completely macro replaced as if they formed the rest of the preprocessing
//  file; no other preprocessing tokens are available."
const { t, summary } = require('./harness');

// Basic prescan
t('arg prescans before substitution',
  `#define INNER(x) [x]\n#define OUTER(y) (y,y)\nOUTER(INNER(7))`,
  `([7],[7])`);

// Prescan is independent — has its own context, no outer hidden macros
t('prescan does not inherit outer hide set',
  `#define A B\n#define F(x) x\nF(A)`,
  `B`);

// Prescan happens once, result substituted at each use site
t('prescanned form used at each plain use',
  `#define A 7\n#define F(x) x+x+x\nF(A)`,
  `7+7+7`);

// # operand of param is NOT prescanned
t('# blocks prescan of arg',
  `#define V 42\n#define S(x) #x\nS(V)`,
  `"V"`);

// ## operand of param is NOT prescanned
t('## blocks prescan of arg',
  `#define V 42\n#define C(a,b) a##b\nC(V,X)`,
  `VX`);

// Same param can be both # and plain — different forms at different sites
t('same param: # form raw, plain form expanded',
  `#define V 42\n#define W(x) #x ":" x\nW(V)`,
  `"V" ":" 42`);

// Same param can be both ## and plain
t('same param: ## form raw, plain form expanded',
  `#define V 42\n#define W(x) x##y x\nW(V)`,
  `Vy 42`);

// Variadic prescan
t('__VA_ARGS__ prescanned for plain use',
  `#define A 7\n#define F(...) (__VA_ARGS__)\nF(A,A)`,
  `(7, 7)`);

// __VA_ARGS__ as ## operand: not prescanned (raw)
t('__VA_ARGS__ as ## operand stays raw',
  `#define A 7\n#define F(x,...) x##__VA_ARGS__\nF(p,A)`,
  `pA`);

summary('§6.10.5.2 prescan');
