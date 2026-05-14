"use strict";
const { t, summary } = require('./harness');

// Original 34 regression tests
t('object-like', `#define X 42\nX`, `42`);
t('chained object', `#define A B\n#define B C\n#define C 42\nA`, `42`);
t('simple fn', `#define ADD(a,b) (a + b)\nADD(1,2)`, `(1 + 2)`);
t('nested compose',
  `#define SQ(x) ((x)*(x))
#define DBL(x) ((x)+(x))
#define COMP(x) SQ(DBL(x))
COMP(5)`,
  `((((5)+(5)))*(((5)+(5))))`);
t('arg prescan',
  `#define INNER(x) ((x)+1)
#define OUTER(y) [y,y]
OUTER(INNER(7))`,
  `[((7)+1),((7)+1)]`);
t('stringize literal', `#define STR(x) #x\nSTR(hello)`, `"hello"`);
t('stringize blocks expansion', `#define V 42\n#define STR(x) #x\nSTR(V)`, `"V"`);
t('XSTR indirection', `#define V 42\n#define STR(x) #x\n#define XSTR(x) STR(x)\nXSTR(V)`, `"42"`);
t('basic paste', `#define C(a,b) a##b\nC(foo,bar)`, `foobar`);
t('paste blocks expansion', `#define P my_\n#define C(a,b) a##b\nC(P,var)`, `Pvar`);
t('CAT_/CAT indirection', `#define P my_\n#define C_(a,b) a##b\n#define C(a,b) C_(a,b)\nC(P,var)`, `my_var`);
t('paste forms macro then rescans', `#define C_(a,b) a##b\n#define C(a,b) C_(a,b)\n#define foo_bar 99\nC(foo,_bar)`, `99`);
t('direct self-ref', `#define FOO FOO + 1\nFOO`, `FOO + 1`);
t('indirect self-ref', `#define FOO BAR\n#define BAR FOO\nFOO`, `FOO`);
t('combine flags', `#define BIT(n) (1u<<(n))\n#define R BIT(0)\n#define W BIT(1)\n#define CMB(a,b) ((a)|(b))\nCMB(R,W)`, `(((1u<<(0)))|((1u<<(1))))`);
t('# and same param plain', `#define W(x) #x ":" x\nW(42)`, `"42" ":" 42`);
t('mixed # and ## (blocking)', `#define S(x) #x\n#define C_(a,b) a##b\n#define C(a,b) C_(a,b)\nS(C(a,b))`, `"C(a,b)"`);
t('mixed # and ## via indirection', `#define S_(x) #x\n#define S(x) S_(x)\n#define C_(a,b) a##b\n#define C(a,b) C_(a,b)\nS(C(a,b))`, `"ab"`);
t('basic variadic', `#define X(...) __VA_ARGS__\nX(1,2,3)`, `1, 2, 3`);
t('variadic with fixed', `#define X(a,...) a + __VA_ARGS__\nX(1,2,3)`, `1 + 2, 3`);
t('empty variadic', `#define X(...) __VA_ARGS__\nX()`, ``);
t('variadic flows through call', `#define A(...) __VA_ARGS__\n#define WRAP(...) A(__VA_ARGS__)\nWRAP(1,2)`, `1, 2`);
t('VA_OPT non-empty', `#define F(...) f(0 __VA_OPT__(,) __VA_ARGS__)\nF(1,2)`, `f(0 , 1, 2)`);
t('VA_OPT empty', `#define F(...) f(0 __VA_OPT__(,) __VA_ARGS__)\nF()`, `f(0 )`);
t('VA_OPT with param ref empty', `#define X(a, ...) a __VA_OPT__(b=__VA_ARGS__)\nX(1)`, `1`);
t('VA_OPT with param ref filled', `#define X(a, ...) a __VA_OPT__(b=__VA_ARGS__)\nX(1, 2)`, `1 b=2`);
t('a##b##c', `#define CAT3(a,b,c) a##b##c\nCAT3(x,y,z)`, `xyz`);
t('a##b##c##d', `#define CAT4(a,b,c,d) a##b##c##d\nCAT4(w,x,y,z)`, `wxyz`);
t('M() with 1-param M', `#define F(x) [x]\nF()`, `[]`);
t('M() with 0-param M', `#define F() ok\nF()`, `ok`);
t('M(,) is two empty args', `#define F(a,b) [a|b]\nF(,)`, `[|]`);

// User's deferred-expansion example
const userExample = `#define A(...)__VA_ARGS__
#define B(M,...)M(__VA_ARGS__)
#define C(M,...)A(M(__VA_ARGS__))
#define D
#define E()F D()
#define F()A(42)`;
t('B(E) → F ()', `${userExample}\nB(E)`, `F ()`);
t('C(E) → A(42)', `${userExample}\nC(E)`, `A(42)`);

t('painted token resists later expansion',
  `#define A(x) x x
#define B B + 1
A(B)`,
  `B + 1 B + 1`);

// Block-comment whitespace in body must be stripped (replacement list excludes
// leading/trailing whitespace; comments become spaces in phase 3).
t('block comment at start of body stripped',
  `#define F/**/42\nF`, `42`);
t('block comments wrapping body value stripped',
  `#define F/**/42/**/\nF`, `42`);
t('comment body-ws not leaked into stringization',
  `#define S(...)S_(__VA_ARGS__)\n#define S_(...)#__VA_ARGS__\n#define F/**/42/**/\nS((F))`,
  `"(42)"`);

// Block comments before or within the # directive marker must be normalized
// away before directive recognition (translation phase 3 → phase 4 ordering).
t('leading block comment before #define recognized',
  `/**/#define X ok\nX`, `ok`);
t('block comment between # and define keyword recognized',
  `#/**/define X ok\nX`, `ok`);

// §6.4.6 Digraphs — %: → #, %:%: → ##, <: → [, :> → ], <% → {, %> → }
t('digraph %:define recognized as directive',
  `%:define X 42\nX`, `42`);
t('digraph %: stringize in body',
  `%:define STR(x) %:x\nSTR(hi)`, `"hi"`);
t('digraph %:%: paste in body',
  `%:define CAT(a,b) a%:%:b\nCAT(foo,bar)`, `foobar`);
t('digraph <: and :> as brackets',
  `%:define F(x) x<:0:>\nF(arr)`, `arr[0]`);

// §6.10.3.6: # __VA_OPT__(content) stringizes the VA_OPT expansion as a unit;
// empty VA_ARGS → VA_OPT disappears → stringize empty → ""
t('#__VA_OPT__ empty VA_ARGS stringizes to empty string',
  `#define S(...)#__VA_OPT__(__VA_ARGS__)\nS()`, `""`);
t('#__VA_OPT__ non-empty VA_ARGS stringizes content',
  `#define S(...)#__VA_OPT__(__VA_ARGS__)\nS(a,b)`, `"a,b"`);

summary('regression 34');
