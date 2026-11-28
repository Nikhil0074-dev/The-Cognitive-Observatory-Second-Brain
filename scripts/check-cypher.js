// Syntax-checks every Cypher query passed to neo.run() using Neo4j's own parser (no database needed).
// This validates grammar only; it cannot prove the queries return the right data. Usage: npm run check:cypher
const fs = require('fs'), path = require('path');
const { validateSyntax } = require('@neo4j-cypher/language-support');
const root = path.join(__dirname, '..', 'src'), files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(p) && !/spec/.test(p) && files.push(p); } })(root);
let found = 0, bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8'); let i = 0;
  while ((i = s.indexOf('neo.run(', i)) >= 0) {
    let j = i + 8; while (/\s/.test(s[j])) j++;
    const q = s[j]; if (q !== "'" && q !== '`') { i = j; continue; }
    let k = j + 1, out = ''; while (k < s.length) { if (s[k] === '\\') { out += s[k + 1]; k += 2; continue; } if (s[k] === q) break; out += s[k++]; }
    out = out.replace(/\$\{[^}]*\}/g, 'X'); found++; i = k;
    const d = validateSyntax(out, {}) || [];
    if (d.length) { bad++; console.error(`SYNTAX PROBLEM in ${path.relative(root, f)}:\n  ${out.replace(/\s+/g, ' ').slice(0, 160)}\n  -> ${d.map(x => x.message).join(' | ')}`); }
  }
}
console.log(`${found} Cypher queries checked, ${bad} with syntax problems`);
process.exit(bad || !found ? 1 : 0);
