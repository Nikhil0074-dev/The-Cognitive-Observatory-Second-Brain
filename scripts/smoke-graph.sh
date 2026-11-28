#!/usr/bin/env bash
# Graph-layer smoke test: needs the API AND Neo4j. Uses the offline hash embedder with a low link threshold.
#   GRAPH_THRESHOLD=0.25 RATE_LIMIT_PER_MIN=5000 ... start the API ..., then:  ./scripts/smoke-graph.sh [http://localhost:3000]
# Optional: NEO4J_HTTP=http://localhost:7474 NEO4J_AUTH=neo4j:secondbrain also checks that deletions really remove graph nodes.
# SKIP_NEO4J=1 runs only the part that needs no graph database (note similarity vs. the threshold).
BASE=${1:-http://localhost:3000}; API="$BASE/api"; H='content-type: application/json'; R=$RANDOM; THRESH=${GRAPH_THRESHOLD:-0.25}; WAIT_S=${WAIT_S:-60}; WAIT_IDX=${WAIT_IDX:-90}
curl() { command curl -m 30 "$@"; }
js() { python3 -c "import sys,json;d=json.load(sys.stdin);$1" 2>/dev/null || echo ERR; }
PASS=0; FAILN=0; ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"; else FAILN=$((FAILN+1)); echo "  FAIL $1 (expected $2, got $3)"; fi; }
code() { curl -s -o /tmp/sg_body -w "%{http_code}" "$@"; }
reg() { curl -s $API/auth/register -H "$H" -d "{\"email\":\"$1\",\"password\":\"password123\"}" | js "print(d['token'])"; }
done_() { echo; echo "RESULT: $PASS passed, $FAILN failed"; [ "$FAILN" = 0 ]; exit $?; }
D=$(mktemp -d)
mk() { printf '%s\n' "$2" > "$D/$1.md"; }
mk rl1 '# Policy Gradient

An agent learns a policy by maximising cumulative reward signals from the environment using gradient updates.'
mk rl2 '# Reward Shaping

An agent learns faster when reward signals are shaped, but the policy can exploit cumulative reward from the environment.'
mk be1 '# Loss Aversion

People weigh losses more than gains, so framing and defaults shape choices more than raw payoffs.'
mk be2 '# Choice Architecture

Defaults and framing shape choices; people weigh losses more than gains when payoffs are presented.'
mk sat1 '# Methane Detection

Satellite sensors detect methane emissions from space using shortwave infrared bands and imagery.'
mk sat2 '# Carbon Accounting

Satellite imagery and sensors measure carbon emissions, combining shortwave infrared bands with ground inventories.'
TOK=$(reg "graph$R@t.co"); A="Authorization: Bearer $TOK"
echo "== A. notes indexed and similar enough to link (no graph database needed) =="
curl -s -H "$A" -F files=@$D/rl1.md -F files=@$D/rl2.md -F files=@$D/be1.md -F files=@$D/be2.md -F files=@$D/sat1.md -F files=@$D/sat2.md $API/notes/upload >/dev/null
for i in $(seq 1 $WAIT_IDX); do N=$(curl -s -H "$A" $API/notes | js "print(sum(x['status']=='indexed' for x in d))"); [ "$N" = 6 ] && break; sleep 1; done
ck "all 6 notes indexed" 6 "$N"
idof() { curl -s -H "$A" $API/notes | js "print([x['id'] for x in d if x['title']=='$1'][0])"; }
sim() { curl -s -H "$A" -H "$H" $API/search/similar-notes -d "{\"note_id\":\"$(idof "$1")\",\"limit\":5}" | js "print(([r['similarity'] for r in d['results'] if r['title']=='$2'] or [0])[0])"; }
PAIRS=("Policy Gradient|Reward Shaping" "Loss Aversion|Choice Architecture" "Methane Detection|Carbon Accounting")
for p in "${PAIRS[@]}"; do s=$(sim "${p%%|*}" "${p##*|}"); ck "similarity ${p%%|*} ~ ${p##*|} = $s is at least the threshold $THRESH" 1 "$(python3 -c "print(1 if float('$s')>=float('$THRESH') else 0)" 2>/dev/null || echo ERR)"; done
[ -n "$SKIP_NEO4J" ] && done_
echo "== B. graph edges (Neo4j) =="
for i in $(seq 1 $WAIT_S); do E=$(curl -s -H "$A" $API/graph/network | js "print(len(d['edges']))"); [ "$E" != ERR ] && [ "$E" -ge 3 ] 2>/dev/null && break; sleep 1; done
ck "the graph has edges (is Neo4j reachable?)" yes "$([ "$E" != ERR ] && [ "$E" -ge 3 ] 2>/dev/null && echo yes || echo "no ($E)")"
curl -s -H "$A" $API/graph/network > /tmp/sg_net.json
CONN=$(python3 - <<'PY'
import json
d=json.load(open('/tmp/sg_net.json')); t={n['id']:n['title'] for n in d['nodes']}
pairs={frozenset((t[e['source']],t[e['target']])) for e in d['edges'] if e['type']=='RELATED_TO'}
want=[("Policy Gradient","Reward Shaping"),("Loss Aversion","Choice Architecture"),("Methane Detection","Carbon Accounting")]
print(sum(frozenset(w) in pairs for w in want))
PY
)
ck "each similar pair is connected by a RELATED_TO edge" 3 "$CONN"
ck "no duplicate undirected edges" "True" "$(python3 -c "
import json;d=json.load(open('/tmp/sg_net.json'));k=[frozenset((e['source'],e['target'],e['type'])) for e in d['edges']];print(len(k)==len(set(k)))" 2>/dev/null || echo ERR)"
ck "similarities are between 0 and 1" "True" "$(python3 -c "
import json;d=json.load(open('/tmp/sg_net.json'));print(all(0<(e['similarity'] or 0)<=1 for e in d['edges'] if e['type']=='RELATED_TO'))" 2>/dev/null || echo ERR)"
PG=$(idof "Policy Gradient"); RS=$(idof "Reward Shaping"); LA=$(idof "Loss Aversion")
ck "neighbours of Policy Gradient include Reward Shaping" "True" "$(curl -s -H "$A" $API/graph/neighbors/$PG | js "print(any(e['title']=='Reward Shaping' for e in d['edges']))")"
echo "== B. clusters and discoveries =="
ck "louvain finds at least 2 communities" "True" "$(curl -s -X POST -H "$A" -H "$H" $API/graph/clusters/rebuild -d '{"method":"louvain"}' | js "print(len(d)>=2)")"
ck "every note belongs to a cluster" "True" "$(curl -s -H "$A" $API/graph/network | js "print(all(n['cluster_id'] for n in d['nodes']))")"
ck "insights overview has the expected shape" "True" "$(curl -s -H "$A" $API/insights | js "print(isinstance(d['hidden'],list) and isinstance(d['contradictions'],list))")"
ck "topics endpoint lists the clusters" "True" "$(curl -s -H "$A" $API/graph/topics | js "print(len(d)>=2 and all(t['keywords'] for t in d))")"
echo "== B. accepted connections and validation =="
ck "accept a SUPPORTS connection" 201 "$(code -X POST -H "$A" -H "$H" $API/graph/edges -d "{\"a\":\"$PG\",\"b\":\"$LA\",\"type\":\"SUPPORTS\"}")"
ck "it shows up under relationships?type=SUPPORTS" 1 "$(curl -s -H "$A" "$API/graph/relationships?type=SUPPORTS" | js "print(len(d))")"
ck "an unknown edge type is a 400" 400 "$(code -X POST -H "$A" -H "$H" $API/graph/edges -d "{\"a\":\"$PG\",\"b\":\"$LA\",\"type\":\"DROP\"}")"
ck "an edge to oneself is a 400" 400 "$(code -X POST -H "$A" -H "$H" $API/graph/edges -d "{\"a\":\"$PG\",\"b\":\"$PG\",\"type\":\"SUPPORTS\"}")"
TOK2=$(reg "other$R@t.co"); printf '# Other Note\n\nSomeone else.\n' > $D/o.md; curl -s -H "Authorization: Bearer $TOK2" -F files=@$D/o.md $API/notes/upload >/dev/null
OID=$(curl -s -H "Authorization: Bearer $TOK2" $API/notes | js "print(d[0]['id'])")
ck "linking to another user's note is a 404" 404 "$(code -X POST -H "$A" -H "$H" $API/graph/edges -d "{\"a\":\"$PG\",\"b\":\"$OID\",\"type\":\"SUPPORTS\"}")"
echo "== B. wikilinks become REFERENCES edges =="
python3 - "$D" <<'PY'
import sys,zipfile
z=zipfile.ZipFile(sys.argv[1]+'/vault.zip','w'); z.writestr('V/Alpha Ideas.md','Thinking about [[Beta Plan]] and oranges.'); z.writestr('V/Beta Plan.md','# Beta Plan\n\nThe plan for the orange orchard.'); z.close()
PY
curl -s -H "$A" -F files=@$D/vault.zip $API/notes/upload >/dev/null
for i in $(seq 1 $WAIT_S); do RF=$(curl -s -H "$A" "$API/graph/relationships?type=REFERENCES" | js "print(len(d))"); [ "$RF" = 1 ] && break; sleep 1; done
ck "the [[wikilink]] became a REFERENCES edge" 1 "$RF"
echo "== B. deleting removes graph data =="
ck "Policy Gradient has neighbours before deletion" "True" "$(curl -s -H "$A" $API/graph/neighbors/$PG | js "print(len(d['edges'])>0)")"
ck "delete the note" 200 "$(code -X DELETE -H "$A" $API/notes/$PG)"
ck "its graph node and edges are gone" 0 "$(curl -s -H "$A" $API/graph/neighbors/$PG | js "print(len(d['edges']))")"
if [ -n "$NEO4J_HTTP" ]; then
  neo() { curl -s -u "${NEO4J_AUTH:-neo4j:neo4j}" -H "$H" "$NEO4J_HTTP/db/neo4j/tx/commit" -d "{\"statements\":[{\"statement\":\"MATCH (n {workspace_id:\$ws}) RETURN count(n)\",\"parameters\":{\"ws\":\"$1\"}}]}" | js "print(d['results'][0]['data'][0]['row'][0])"; }
  W2=$(curl -s -H "$A" -H "$H" $API/workspaces -d '{"name":"Temp"}' | js "print(d['id'])"); T2=$(curl -s -X POST -H "$A" $API/workspaces/$W2/switch | js "print(d['token'])")
  curl -s -H "Authorization: Bearer $T2" -F files=@$D/rl1.md -F files=@$D/rl2.md $API/notes/upload >/dev/null
  for i in $(seq 1 $WAIT_S); do C=$(neo "$W2"); [ "$C" = 2 ] && break; sleep 1; done
  ck "graph holds the temp workspace's 2 nodes" 2 "$C"
  ck "deleting the workspace" 200 "$(code -X DELETE -H "$A" $API/workspaces/$W2)"
  ck "removes its graph nodes from Neo4j" 0 "$(neo "$W2")"
fi
done_
