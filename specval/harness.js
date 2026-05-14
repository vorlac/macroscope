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

module.exports = { t, texact, summary };
