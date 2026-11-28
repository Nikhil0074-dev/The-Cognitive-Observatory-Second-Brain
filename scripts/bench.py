#!/usr/bin/env python
"""Indexing throughput and search latency against a running API (stdlib only).
Usage: RATE_LIMIT_PER_MIN=100000 <start API>; python3 scripts/bench.py [http://localhost:3000] [notes=3000]
With the offline hash embedder the embedding itself is nearly free, so this measures the pipeline (extract, chunk, Postgres, Qdrant, queue).
With OpenAI or a local model the embedding service will dominate indexing time, which this does not measure."""
import http.client, json, random, statistics, sys, time, uuid
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'; N = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
host, port = BASE.split('//')[1].split(':'); conn = http.client.HTTPConnection(host, int(port), timeout=120); TOK = ''
def call(method, path, body=None, headers=None):
    h = {'content-type': 'application/json', **({'Authorization': 'Bearer ' + TOK} if TOK else {}), **(headers or {})}
    t = time.perf_counter(); conn.request(method, '/api' + path, body=(json.dumps(body) if isinstance(body, (dict, list)) else body), headers=h)
    r = conn.getresponse(); data = r.read(); return r.status, (json.loads(data) if data[:1] in (b'{', b'[') else data), (time.perf_counter() - t) * 1000
def pct(xs, p): xs = sorted(xs); return xs[min(len(xs) - 1, int(len(xs) * p))]
rnd = random.Random(7)
TOPICS = ['reward policy agent exploration value gradient episode environment critic bandit'.split(), 'incentive framing default loss payoff choice nudge anchoring discount bias'.split(),
 'satellite imagery methane emissions carbon sensor band orbit cloud infrared'.split(), 'transformer attention token embedding retrieval context prompt layer decoder encoder'.split(),
 'metric funnel cohort retention pricing roadmap feedback growth activation experiment'.split(), 'equilibrium strategy auction mechanism signaling coalition payoff player utility game'.split()]
GENERAL = 'the and with from this that have will about which their there when while because between however another notes idea review summary'.split()
def note(i):
    t = TOPICS[i % len(TOPICS)]; words = [rnd.choice(t) if rnd.random() < 0.8 else rnd.choice(GENERAL) for _ in range(120)]
    return f'bench-{i}.md', f'# {t[0].title()} {t[1]} {i}\n\n' + ' '.join(words) + '.\n'
s, j, _ = call('POST', '/auth/register', {'email': f'bench{uuid.uuid4().hex[:8]}@t.co', 'password': 'password123'}); TOK = j['token']
print(f'## Benchmark: {N} notes, ~120 words each, 6 topics\n')
t0 = time.perf_counter(); B = uuid.uuid4().hex
for start in range(0, N, 100):
    parts = []
    for i in range(start, min(N, start + 100)):
        name, text = note(i); parts.append(f'--{B}\r\nContent-Disposition: form-data; name="files"; filename="{name}"\r\nContent-Type: text/markdown\r\n\r\n{text}\r\n')
    s, _, _ = call('POST', '/notes/upload', ''.join(parts) + f'--{B}--\r\n', {'content-type': f'multipart/form-data; boundary={B}'})
    assert s in (200, 201), s
up = time.perf_counter() - t0; print(f'- upload + extract + queue: {up:.1f}s ({N / up:.0f} notes/s)')
indexed = 0
while time.perf_counter() - t0 < 250:
    s, j, _ = call('GET', '/settings'); indexed = j['notes']['indexed']
    if indexed >= N: break
    time.sleep(2)
tot = time.perf_counter() - t0; print(f'- indexed {indexed}/{N} in {tot:.0f}s end to end ({indexed / tot:.1f} notes/s); 10k notes would take about {10000 / max(indexed / tot, 0.01) / 60:.0f} min at this rate (extrapolation, hash embedder)')
s, notes, _ = call('GET', '/notes'); ids = [n['id'] for n in notes]
def q(): t = rnd.choice(TOPICS); return ' '.join(rnd.sample(t, 4))
rows = []
for label, fn in [('semantic search', lambda: call('POST', '/search/semantic', {'query': q()})), ('hybrid search', lambda: call('POST', '/search/hybrid', {'query': q()})),
                  ('similar notes', lambda: call('POST', '/search/similar-notes', {'note_id': rnd.choice(ids)})), ('list notes (200)', lambda: call('GET', '/notes')),
                  ('graph network (nodes + edges)', lambda: call('GET', '/graph/network?limit=1000'))]:
    for _ in range(5): fn()
    ts = [fn()[2] for _ in range(100)]; rows.append((label, statistics.median(ts), pct(ts, 0.95), pct(ts, 0.99)))
print('\n| request (100 calls, warm) | p50 ms | p95 ms | p99 ms | target |\n|---|---|---|---|---|')
for l, a, b, c in rows: print(f'| {l} | {a:.0f} | {b:.0f} | {c:.0f} | {"< 100 ms" if "search" in l or "similar" in l else ""} |')
t = time.perf_counter(); s, j, _ = call('POST', '/graph/clusters/rebuild', {'method': 'louvain'}); print(f'\n- louvain cluster rebuild over {indexed} notes: {time.perf_counter() - t:.1f}s -> {len(j) if isinstance(j, list) else j} clusters')
t = time.perf_counter(); s, j, _ = call('POST', '/graph/clusters/rebuild', {'method': 'kmeans'}); print(f'- k-means cluster rebuild: {time.perf_counter() - t:.1f}s -> {len(j) if isinstance(j, list) else j} clusters')
