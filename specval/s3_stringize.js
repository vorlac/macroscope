"use strict";
// C23 §6.10.5.3 — The # operator. Whitespace and escaping rules matter.
const { t, texact, summary } = require('./harness');

texact('basic stringize',
  `#define S(x) #x\nS(hello)`,
  `"hello"`);

texact('multi-token arg',
  `#define S(x) #x\nS(a b c)`,
  `"a b c"`);

texact('internal whitespace collapses to single space',
  `#define S(x) #x\nS(a   b)`,
  `"a b"`);

texact('multiple spaces and tabs collapse',
  `#define S(x) #x\nS(a\t\t  b)`,
  `"a b"`);

texact('leading/trailing ws deleted',
  `#define S(x) #x\nS(   hello   )`,
  `"hello"`);

texact('comment in arg becomes single space',
  `#define S(x) #x\nS(a /* c */ b)`,
  `"a b"`);

texact('empty arg stringizes to empty string',
  `#define S(x) #x\nS()`,
  `""`);

texact('string literal in arg gets quotes escaped',
  `#define S(x) #x\nS("hello")`,
  `"\\"hello\\""`);

texact('string literal with backslash',
  `#define S(x) #x\nS("a\\nb")`,
  `"\\"a\\\\nb\\""`);

texact('macro in arg not expanded',
  `#define V 42\n#define S(x) #x\nS(V)`,
  `"V"`);

texact('XSTR forces prescan',
  `#define V 42\n#define STR(x) #x\n#define XSTR(x) STR(x)\nXSTR(V)`,
  `"42"`);

texact('# __VA_ARGS__ stringizes joined varargs',
  `#define S(...) #__VA_ARGS__\nS(a,b,c)`,
  `"a, b, c"`);

texact('# __VA_ARGS__ empty',
  `#define S(...) #__VA_ARGS__\nS()`,
  `""`);

summary('§6.10.5.3 stringize');
