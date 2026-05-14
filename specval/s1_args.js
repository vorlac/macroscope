"use strict";
// C23 §6.10.5.1 — function-like macro invocation and argument collection.
const { t, summary } = require('./harness');

// "The identifier shall be immediately followed by the ( preprocessing token"
// — whitespace between name and ( is allowed (it's still "followed by" in the
// preprocessing-token sense), per common interpretation.
t('whitespace before ( still invokes',
  `#define F(x) [x]\nF (1)`,
  `[1]`);

// 0-param vs 1-param disambiguation: M() with 0-param M = 0 args; with 1-param = 1 empty arg
t('M() with 0-param macro = 0 args',
  `#define F() ok\nF()`, `ok`);
t('M() with 1-param macro = 1 empty arg',
  `#define F(x) [x]\nF()`, `[]`);
t('M(,) with 2-param macro = 2 empty args',
  `#define F(a,b) [a|b]\nF(,)`, `[|]`);
t('M(,x) leading empty',
  `#define F(a,b) [a|b]\nF(,x)`, `[|x]`);
t('M(x,) trailing empty',
  `#define F(a,b) [a|b]\nF(x,)`, `[x|]`);

// Inner parens preserved (commas inside don't separate)
t('comma inside inner parens does not split',
  `#define F(a,b) a+b\nF((1,2),3)`, `(1,2)+3`);
t('deeply nested parens',
  `#define F(x) <x>\nF(((a,b),(c,d)))`, `<((a,b),(c,d))>`);

// Newline within arg list is whitespace
t('newline inside arg list',
  `#define F(a,b) [a|b]\nF(1,\n2)`, `[1|2]`);

// Arity mismatch errors (non-variadic)
t('arity too many → not expanded',
  `#define F(a) [a]\nF(1,2)`, `F(1,2)`); // current behavior: leave unexpanded
t('arity too few → not expanded',
  `#define F(a,b) [a|b]\nF(1)`, `F(1)`);

// Fn-like macro name not followed by ( is NOT invoked
t('fn-like without ( emits as identifier',
  `#define F(x) [x]\nF + 1`, `F + 1`);

summary('§6.10.5.1 arg parsing');
