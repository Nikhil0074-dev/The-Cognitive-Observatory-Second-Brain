#!/usr/bin/env bash
# End-to-end smoke test against a running stack (docker compose up). Usage: ./scripts/smoke.sh [http://localhost:3000]
set -e; API=${1:-http://localhost:3000}/api; H='content-type: application/json'; D=$(mktemp -d); EMAIL="smoke$RANDOM@test.co"
tok() { python3 -c "import sys,json;print(json.load(sys.stdin)['token'])"; }
A=$(curl -s $API/auth/register -H "$H" -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}" | tok)
B=$(curl -s $API/auth/register -H "$H" -d "{\"email\":\"b$EMAIL\",\"password\":\"password123\"}" | tok)
printf '# Reward Shaping\n\nAgents exploit incentives, so audit the reward metric.\n' > $D/a.md
printf '# Incentive Design\n\nPeople respond to incentives; defaults shape choices.\n' > $D/b.md
ID=$(curl -s -H "Authorization: Bearer $A" -F files=@$D/a.md -F files=@$D/b.md $API/notes/upload | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
sleep 6
echo -n "indexed notes: "; curl -s -H "Authorization: Bearer $A" $API/notes | python3 -c "import sys,json;print(sum(n['status']=='indexed' for n in json.load(sys.stdin)))"
echo -n "hybrid hit: "; curl -s -H "Authorization: Bearer $A" -H "$H" $API/search/hybrid -d '{"query":"incentives"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['results'][0]['title'])"
echo -n "other user sees (expect 0): "; curl -s -H "Authorization: Bearer $B" -H "$H" $API/search/semantic -d '{"query":"incentives"}' | python3 -c "import sys,json;print(len(json.load(sys.stdin)['results']))"
echo -n "foreign fetch (expect 404): "; curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $B" $API/notes/$ID
echo -n "foreign delete (expect 404): "; curl -s -o /dev/null -w "%{http_code}\n" -X DELETE -H "Authorization: Bearer $B" $API/notes/$ID
echo -n "similar-notes on another user's note id (expect 0 results): "; curl -s -H "Authorization: Bearer $B" -H "$H" $API/search/similar-notes -d "{\"note_id\":\"$ID\"}" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['results']))"
echo -n "no token (expect 401): "; curl -s -o /dev/null -w "%{http_code}\n" $API/notes
