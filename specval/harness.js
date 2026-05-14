"use strict";
const { runOne } = require('./pp');

let passed = 0, failed = 0;
const fails = [];

function t(name, source, expected) {
  let got;
  try { got = runOne(source); }
  catch (e) { got = `<ERROR: ${e.message}>`; }
  const norm = s => s.replace(/\s+/g, '');
  const pass = norm(got) === norm(expected);
  if (pass) { passed++; }
  else { failed++; fails.push({ name, expected, got }); }
}

// Exact comparison — whitespace IS significant (used for stringize tests).
function texact(name, source, expected) {
  let got;
  try { got = runOne(source); }
  catch (e) { got = `<ERROR: ${e.message}>`; }
  // Still trim outer whitespace; only internal whitespace matters.
  const pass = got.trim() === expected.trim();
  if (pass) { passed++; }
  else { failed++; fails.push({ name, expected, got }); }
}

function summary(area) {
  const tag = failed === 0 ? '✓' : '✗';
  console.log(`[${area}] ${tag} ${passed}/${passed+failed}`);
  for (const f of fails) {
    console.log(`  ✗ ${f.name}`);
    console.log(`    expected: ${JSON.stringify(f.expected)}`);
    console.log(`    got:      ${JSON.stringify(f.got)}`);
  }
}

// Document a known gap without failing the suite. Use sparingly — only for
// behaviors we've explicitly chosen not to implement (e.g. patterns that
// require a context-stack expansion model). Prints a [known-gap] line.
function tknown(name, source, expected, gotOverride) {
  console.log(`  [known-gap] ${name}`);
  console.log(`    expected: ${JSON.stringify(expected)}`);
  if (gotOverride !== undefined) {
    console.log(`    current:  ${JSON.stringify(gotOverride)}`);
  }
}

module.exports = { t, texact, tknown, summary };
