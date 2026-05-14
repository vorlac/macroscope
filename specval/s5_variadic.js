"use strict";
// C23 §6.10.5 — Variadic macros and __VA_OPT__.
// "If the identifier-list in the macro definition does not end with an
//  ellipsis, the number of arguments shall equal the number of parameters.
//  Otherwise, there shall be at least as many arguments in the invocation as
//  there are parameters in the macro definition (excluding the ...)."
// __VA_OPT__(content): replaced by content if __VA_ARGS__ is non-empty,
// otherwise replaced by nothing.
const { t, summary } = require('./harness');

// Basic variadic
t('pure variadic',
  `#define F(...) __VA_ARGS__\nF(a,b,c)`, `a, b, c`);

t('one fixed + variadic',
  `#define F(x,...) x|__VA_ARGS__\nF(1,2,3)`, `1|2, 3`);

t('variadic with zero variadic args (C23 allows)',
  `#define F(x,...) [x|__VA_ARGS__]\nF(1)`, `[1|]`);

t('pure variadic with zero args',
  `#define F(...) [__VA_ARGS__]\nF()`, `[]`);

// __VA_OPT__ basic
t('VA_OPT empty varargs → emit nothing',
  `#define F(...) [__VA_OPT__(,) __VA_ARGS__]\nF()`, `[ ]`);

t('VA_OPT non-empty varargs → emit content',
  `#define F(...) [__VA_OPT__(,) __VA_ARGS__]\nF(a)`, `[, a]`);

// __VA_OPT__ content is subject to substitution
t('VA_OPT content with param ref',
  `#define F(x,...) [x __VA_OPT__(== __VA_ARGS__)]\nF(1,2,3)`, `[1 == 2, 3]`);

t('VA_OPT content with empty varargs hides param refs too',
  `#define F(x,...) [x __VA_OPT__(== __VA_ARGS__)]\nF(1)`, `[1 ]`);

// __VA_OPT__ enables the standard trailing-comma trick
t('GCC-like ,##__VA_ARGS__ replacement via __VA_OPT__',
  `#define LOG(fmt,...) printf(fmt __VA_OPT__(,) __VA_ARGS__)\nLOG("hello")`,
  `printf("hello" )`);

t('LOG with args',
  `#define LOG(fmt,...) printf(fmt __VA_OPT__(,) __VA_ARGS__)\nLOG("%d",x)`,
  `printf("%d" , x)`);

// __VA_OPT__ with # and ##
t('# inside __VA_OPT__ content',
  `#define F(...) [__VA_OPT__(#__VA_ARGS__)]\nF(a,b)`, `["a, b"]`);

t('## inside __VA_OPT__ content (literals)',
  `#define F(...) [__VA_OPT__(qq##rr)]\nF(z)`, `[qqrr]`);

t('## inside __VA_OPT__ substitutes params (raw, since ## operand)',
  `#define F(x,...) [__VA_OPT__(x##y)]\nF(p,r)`, `[py]`);

// Variadic flowing through nested calls
t('variadic forwarded through wrapper',
  `#define INNER(...) [__VA_ARGS__]\n#define OUTER(...) INNER(__VA_ARGS__)\nOUTER(1,2,3)`,
  `[1, 2, 3]`);

// Empty variadic forwarded
t('empty variadic forwarded',
  `#define INNER(...) [__VA_ARGS__]\n#define OUTER(...) INNER(__VA_ARGS__)\nOUTER()`,
  `[]`);

summary('§6.10.5 variadic / __VA_OPT__');
