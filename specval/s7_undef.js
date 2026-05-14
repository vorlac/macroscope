"use strict";
// C23 §6.10.3.5 — #undef directive.
// Removes the macro definition. Subsequent uses of the identifier are not
// macro-replaced. Re-defining after #undef is permitted.
const { t, summary } = require('./harness');

t('#undef removes a macro',
  `#define X 1
#undef X
X`, `X`);

t('#define after #undef restores',
  `#define X 1
#undef X
#define X 2
X`, `2`);

t('#undef of undefined macro is a no-op',
  `#undef Y
Y`, `Y`);

t('mid-file: X expands before, not after #undef',
  `#define X 1
X
#undef X
X`, `1\nX`);

t('#undef a function-like macro',
  `#define F(x) [x]
F(1)
#undef F
F(2)`, `[1]\nF(2)`);

summary('§6.10.3.5 #undef');
