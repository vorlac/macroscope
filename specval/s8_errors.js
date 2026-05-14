"use strict";
// Test the live error-detection: parse + body validation produces the expected
// { line, msg } diagnostics.
const ext = require('./pp');

let passed = 0, failed = 0;
const fails = [];

function checkErrors(name, src, expectedSubstrings) {
  const { errors } = ext.parseInput(src);
  const errStrs = errors.map(e => `L${e.line || '?'}: ${e.msg}`);
  const allFound = expectedSubstrings.every(needle =>
    errStrs.some(s => s.includes(needle))
  );
  if (allFound) { passed++; return; }
  failed++;
  fails.push({ name, expected: expectedSubstrings, got: errStrs });
}

function expectNoErrors(name, src) {
  const { errors } = ext.parseInput(src);
  if (errors.length === 0) { passed++; return; }
  failed++;
  fails.push({ name, expected: 'no errors', got: errors.map(e => `L${e.line}: ${e.msg}`) });
}

// Directive-level errors
checkErrors('missing name on #define', `#define\nX`, ['L1', '#define is missing a macro name']);
checkErrors('missing name on #undef', `#undef\nX`, ['L1', '#undef is missing a macro name']);
checkErrors('unclosed param list', `#define F(a, b\nX`, ['L1', 'unclosed parameter list']);
checkErrors('unsupported #include', `#include <stdio.h>`, ['L1', "directive '#include' not supported"]);
checkErrors('unsupported #ifdef', `#ifdef X\n#endif`, ['L1', "directive '#ifdef' not supported"]);
checkErrors('unsupported #pragma', `#pragma once`, ['L1', "directive '#pragma' not supported"]);

// Macro definition errors
checkErrors('duplicate param', `#define F(a, a) a`, ['L1', "duplicate parameter 'a'"]);
checkErrors('... not at end', `#define F(..., a) a`, ['L1', "'...' must be the last parameter"]);
checkErrors('invalid param name', `#define F(1x) 1x`, ['L1', "invalid parameter name"]);

// Body-level errors (§6.10.5)
checkErrors('## at start of body',
  `#define BAD(x) ##x\nBAD(z)`,
  ['L1', "'##' cannot appear at the start"]);

checkErrors('## at end of body',
  `#define BAD(x) x##\nBAD(z)`,
  ['L1', "'##' cannot appear at the end"]);

checkErrors('# not followed by id',
  `#define BAD(x) # 5\nBAD(z)`,
  ['L1', "'#' must be followed by a parameter"]);

checkErrors('# followed by non-param',
  `#define BAD(x) #y\nBAD(z)`,
  ['L1', "'#' followed by non-parameter 'y'"]);

checkErrors('__VA_ARGS__ in non-variadic',
  `#define NOTVAR(x) __VA_ARGS__\nNOTVAR(1)`,
  ['L1', "'__VA_ARGS__' is valid only inside a variadic macro"]);

checkErrors('__VA_OPT__ in non-variadic',
  `#define NOTVAR(x) __VA_OPT__(x)\nNOTVAR(1)`,
  ['L1', "'__VA_OPT__' is valid only inside a variadic macro"]);

// Tokenizer-level errors
checkErrors('unterminated string in content',
  `#define X 1\nprintf("hello\n);`,
  ['L2', "unterminated string literal"]);

checkErrors('unterminated char literal',
  `char c = 'a\nputs("ok");`,
  ['L1', "unterminated character literal"]);

checkErrors('unterminated block comment',
  `/* this comment never ends\nint x;`,
  ['L1', "unterminated '/* … */' block comment"]);

// Line number attribution across mixed content + directives
checkErrors('error after directive attributes to correct line',
  `#define X 1
some content
#include <foo>
"unterminated`,
  ['L3', "directive '#include' not supported", "L4", "unterminated string literal"]);

// Negative cases: valid programs should produce zero errors
expectNoErrors('valid basic',          `#define X 1\nX`);
expectNoErrors('valid variadic',       `#define F(...) __VA_ARGS__\nF(1,2)`);
expectNoErrors('valid VA_OPT',         `#define F(...) __VA_OPT__(,) __VA_ARGS__\nF(1)`);
expectNoErrors('valid stringize',      `#define S(x) #x\nS(hello)`);
expectNoErrors('valid paste',          `#define C(a,b) a##b\nC(foo,bar)`);
expectNoErrors('valid multi-line cmt', `/* hi\n   there */\n#define X 1\nX`);
expectNoErrors('valid VA_ARGS via #',  `#define S(...) #__VA_ARGS__\nS(a,b)`);

const tag = failed === 0 ? '✓' : '✗';
console.log(`[error-detection] ${tag} ${passed}/${passed+failed}`);
for (const f of fails) {
  console.log(`  ✗ ${f.name}`);
  console.log(`    expected: ${JSON.stringify(f.expected)}`);
  console.log(`    got:      ${JSON.stringify(f.got)}`);
}
