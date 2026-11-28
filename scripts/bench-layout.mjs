// Force-layout cost per tick for the Network/Cluster/Timeline views (same d3-force setup as frontend/src/Graph.tsx).
// 60 fps leaves ~16.7 ms per frame for simulation AND drawing; drawing is not measured here (needs a real browser/GPU).
// Usage: (cd frontend && npm install) && node scripts/bench-layout.mjs
import { createRequire } from 'module';
const { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } = createRequire(new URL('../frontend/package.json', import.meta.url))('d3-force');
let seed = 1; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
console.log('| nodes | edges | ms per tick (median of 30) | 60 fps budget used by simulation alone |\n|---|---|---|---|');
for (const n of [1000, 5000, 10000]) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: i, rank: rnd(), x: (rnd() - 0.5) * 800, y: (rnd() - 0.5) * 800 }));
  const links = []; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) links.push({ source: i, target: (i + 1 + Math.floor(rnd() * 40)) % n });
  const sim = forceSimulation(nodes).force('link', forceLink(links).id((d) => d.id).strength(0.35).distance(45)).force('charge', forceManyBody().strength(-70))
    .force('collide', forceCollide().radius((d) => 7 + d.rank * 6)).force('x', forceX().strength(0.04)).force('y', forceY().strength(0.04)).stop();
  for (let i = 0; i < 5; i++) sim.tick();
  const t = []; for (let i = 0; i < 30; i++) { const a = performance.now(); sim.tick(); t.push(performance.now() - a); }
  t.sort((a, b) => a - b); const med = t[15];
  console.log(`| ${n} | ${links.length} | ${med.toFixed(1)} | ${Math.round((med / 16.7) * 100)}% |`);
}
