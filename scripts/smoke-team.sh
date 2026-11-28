#!/usr/bin/env bash
# Team-workspace smoke test: roles, invites, instant revocation, transfer, deletion safety. API only; safe to repeat.
# Makes ~110 requests, more than the default per-IP limit (100/min): start the API with RATE_LIMIT_PER_MIN=1000 for this test.
# Usage: ./scripts/smoke-team.sh [http://localhost:3000]
BASE=${1:-http://localhost:3000}; R=$RANDOM; H='content-type: application/json'
curl() { command curl -m 30 "$@"; }
js() { python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }
code() { curl -s -o /tmp/body -w "%{http_code}" "$@"; }
wsof() { python3 -c "import sys,json,base64;t=sys.argv[1].split('.')[1];t+='='*(-len(t)%4);print(json.loads(base64.urlsafe_b64decode(t))['ws'])" "$1"; }
reg() { curl -s $BASE/api/auth/register -H "$H" -d "{\"email\":\"$1\",\"password\":\"password123\"}" | js "print(d['token'])"; }
login() { curl -s $BASE/api/auth/login -H "$H" -d "{\"email\":\"$1\",\"password\":\"password123\"}" | js "print(d['token'])"; }
printf '# Roadmap\n\nLaunch the beta in March with hybrid search.\n' > /tmp/team.md; printf '# Alice Diary\n\nPrivate thoughts about salary negotiation.\n' > /tmp/diary.md; printf '# Bob Findings\n\nGradient descent notes from the team workshop.\n' > /tmp/bobnote.md; printf '# Temp\n\nThrowaway note.\n' > /tmp/temp.md
sleep 0
PASS=0; FAILN=0; ck() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"; else FAILN=$((FAILN+1)); echo "  FAIL $1 (expected $2, got $3)"; fi; }
code() { curl -s -o /tmp/body -w "%{http_code}" "$@"; }
wsof() { python3 -c "import sys,json,base64;t=sys.argv[1].split('.')[1];t+='='*(-len(t)%4);print(json.loads(base64.urlsafe_b64decode(t))['ws'])" "$1"; }
reg() { curl -s $BASE/api/auth/register -H "$H" -d "{\"email\":\"$1\",\"password\":\"password123\"}" | js "print(d['token'])"; }
login() { curl -s $BASE/api/auth/login -H "$H" -d "{\"email\":\"$1\",\"password\":\"password123\"}" | js "print(d['token'])"; }
printf '# Roadmap\n\nLaunch the beta in March with hybrid search.\n' > /tmp/team.md; printf '# Alice Diary\n\nPrivate thoughts about salary negotiation.\n' > /tmp/diary.md; printf '# Bob Findings\n\nGradient descent notes from the team workshop.\n' > /tmp/bobnote.md; printf '# Temp\n\nThrowaway note.\n' > /tmp/temp.md
echo "== setup: alice, her team workspace, a pending invite for bob =="
TOK_A=$(reg alice$R@t.co); A="Authorization: Bearer $TOK_A"; PERS_A=$(curl -s -H "$A" $BASE/api/workspaces | js "print(d[0]['id'])")
ck "new user has one workspace, role owner" "owner" "$(curl -s -H "$A" $BASE/api/workspaces | js "print(d[0]['role'])")"
TID=$(curl -s -H "$A" -H "$H" $BASE/api/workspaces -d '{"name":"Team"}' | js "print(d['id'])")
TA=$(curl -s -X POST -H "$A" $BASE/api/workspaces/$TID/switch | js "print(d['token'])"); AT="Authorization: Bearer $TA"
ck "switch returns a token scoped to the team workspace" "$TID" "$(wsof $TA)"
curl -s -H "$AT" -F files=@/tmp/team.md $BASE/api/notes/upload >/dev/null; curl -s -H "$A" -F files=@/tmp/diary.md $BASE/api/notes/upload >/dev/null
ck "invite an unregistered email" "invited" "$(curl -s -H "$AT" -H "$H" $BASE/api/workspaces/$TID/members -d "{\"email\":\"Bob$R@T.co\",\"role\":\"viewer\"}" | js "print(list(d)[0])")"
ck "owner sees the pending invite" "bob$R@t.co" "$(curl -s -H "$AT" $BASE/api/workspaces/$TID/members | js "print(d['invites'][0]['email'])")"
ck "invite with a bad role is rejected" 400 "$(code -H "$AT" -H "$H" $BASE/api/workspaces/$TID/members -d '{"email":"x@t.co","role":"owner"}')"
echo "== bob registers: the invite is accepted automatically =="
TOK_B=$(reg bob$R@t.co); B="Authorization: Bearer $TOK_B"
ck "bob belongs to 2 workspaces" 2 "$(curl -s -H "$B" $BASE/api/workspaces | js "print(len(d))")"
PERS_B=$(curl -s -H "$B" $BASE/api/workspaces | js "print([w['id'] for w in d if w['role']=='owner'][0])")
ck "bob's role in Team is viewer" viewer "$(curl -s -H "$B" $BASE/api/workspaces | js "print([w['role'] for w in d if w['id']=='$TID'][0])")"
TB=$(curl -s -X POST -H "$B" $BASE/api/workspaces/$TID/switch | js "print(d['token'])"); BT="Authorization: Bearer $TB"; sleep 5
echo "== viewer: can read, cannot write, cannot administer =="
ck "viewer search finds the team note" "Roadmap" "$(curl -s -H "$BT" -H "$H" $BASE/api/search/hybrid -d '{"query":"beta march hybrid"}' | js "print(d['results'][0]['title'])")"
ck "viewer cannot see alice's personal note" 0 "$(curl -s -H "$BT" -H "$H" $BASE/api/search/hybrid -d '{"query":"salary negotiation"}' | js "print(len(d['results']))")"
ck "viewer lists only team notes" "['Roadmap']" "$(curl -s -H "$BT" $BASE/api/notes | js "print([n['title'] for n in d])")"
ck "viewer settings report role" viewer "$(curl -s -H "$BT" $BASE/api/settings | js "print(d['role'])")"
ck "viewer can ask the assistant" 201 "$(code -H "$BT" -H "$H" $BASE/api/assistant/chat -d '{"query":"beta"}')"
ck "viewer can read topics" 200 "$(code -H "$BT" $BASE/api/graph/topics)"
ck "viewer upload blocked" 403 "$(code -H "$BT" -F files=@/tmp/bobnote.md $BASE/api/notes/upload)"
NID=$(curl -s -H "$BT" $BASE/api/notes | js "print(d[0]['id'])")
ck "viewer delete blocked" 403 "$(code -X DELETE -H "$BT" $BASE/api/notes/$NID)"
ck "viewer reindex blocked" 403 "$(code -X POST -H "$BT" $BASE/api/notes/reindex)"
ck "viewer connect GitHub blocked" 403 "$(code -H "$BT" -H "$H" $BASE/api/sources/github -d '{"repo":"a/b"}')"
ck "viewer sync blocked" 403 "$(code -X POST -H "$BT" $BASE/api/sources/00000000-0000-0000-0000-000000000000/sync)"
ck "viewer cluster rebuild blocked" 403 "$(code -X POST -H "$BT" -H "$H" $BASE/api/graph/clusters/rebuild -d '{}')"
ck "viewer Drive connect blocked" 403 "$(code -H "$BT" $BASE/api/sources/drive/auth-url)"
ck "audit log is owner-only" 403 "$(code -H "$BT" $BASE/api/audit)"
ck "viewer cannot add members" 403 "$(code -H "$BT" -H "$H" $BASE/api/workspaces/$TID/members -d '{"email":"c@t.co","role":"viewer"}')"
ck "viewer can list members, sees no invites" "0" "$(curl -s -H "$BT" $BASE/api/workspaces/$TID/members | js "print(len(d['invites']))")"
echo "== promotion takes effect on the SAME token =="
BID=$(curl -s -H "$AT" $BASE/api/workspaces/$TID/members | js "print([m['user_id'] for m in d['members'] if m['email']=='bob$R@t.co'][0])")
ck "owner promotes bob to editor" 200 "$(code -X PATCH -H "$AT" -H "$H" $BASE/api/workspaces/$TID/members/$BID -d '{"role":"editor"}')"
ck "bob's existing token can now upload" 201 "$(code -H "$BT" -F files=@/tmp/bobnote.md $BASE/api/notes/upload)"
ck "editor still cannot manage members" 403 "$(code -H "$BT" -H "$H" $BASE/api/workspaces/$TID/members -d '{"email":"c@t.co","role":"viewer"}')"
AID=$(curl -s -H "$AT" $BASE/api/workspaces/$TID/members | js "print([m['user_id'] for m in d['members'] if m['email']=='alice$R@t.co'][0])")
ck "editor cannot change the owner's role" 403 "$(code -X PATCH -H "$BT" -H "$H" $BASE/api/workspaces/$TID/members/$AID -d '{"role":"viewer"}')"
ck "active workspace is remembered: login lands in Team" "$TID" "$(wsof "$(login bob$R@t.co)")"
echo "== removal cuts access immediately =="
ck "owner removes bob" 200 "$(code -X DELETE -H "$AT" $BASE/api/workspaces/$TID/members/$BID)"
ck "bob's team token is dead at once" 401 "$(code -H "$BT" $BASE/api/notes)"
ck "bob's next login falls back to his own workspace" "$PERS_B" "$(wsof "$(login bob$R@t.co)")"
ck "bob cannot switch back into Team" 404 "$(code -X POST -H "$B" $BASE/api/workspaces/$TID/switch)"
ck "bob cannot switch into alice's personal workspace" 404 "$(code -X POST -H "$B" $BASE/api/workspaces/$PERS_A/switch)"
ck "bob cannot read Team's member list" 404 "$(code -H "$B" $BASE/api/workspaces/$TID/members)"
echo "== owner rules, ids, leaving =="
ck "owner cannot leave" 409 "$(code -X DELETE -H "$AT" $BASE/api/workspaces/$TID/members/$AID)"
ck "malformed workspace id is a 400, not a 500" 400 "$(code -H "$A" $BASE/api/workspaces/not-a-uuid/members)"
ck "re-adding an existing user is immediate" added "$(curl -s -H "$AT" -H "$H" $BASE/api/workspaces/$TID/members -d "{\"email\":\"bob$R@t.co\",\"role\":\"editor\"}" | js "print(list(d)[0])")"
ck "a member can leave on their own" 200 "$(code -X DELETE -H "$B" $BASE/api/workspaces/$TID/members/$BID)"
echo "== ownership transfer =="
curl -s -o /dev/null -H "$AT" -H "$H" $BASE/api/workspaces/$TID/members -d "{\"email\":\"bob$R@t.co\",\"role\":\"editor\"}"
ck "alice transfers ownership to bob" 201 "$(code -X POST -H "$AT" -H "$H" $BASE/api/workspaces/$TID/transfer -d "{\"user_id\":\"$BID\"}")"
ck "alice is now an editor (can upload)" 201 "$(code -H "$AT" -F files=@/tmp/temp.md $BASE/api/notes/upload)"
ck "alice can no longer manage members" 403 "$(code -H "$AT" -H "$H" $BASE/api/workspaces/$TID/members -d '{"email":"c@t.co","role":"viewer"}')"
TB2=$(curl -s -X POST -H "$B" $BASE/api/workspaces/$TID/switch | js "print(d['token'])"); BT2="Authorization: Bearer $TB2"
ck "bob (new owner) can read the audit log" 200 "$(code -H "$BT2" $BASE/api/audit)"
ck "bob transfers it back to alice" 201 "$(code -X POST -H "$BT2" -H "$H" $BASE/api/workspaces/$TID/transfer -d "{\"user_id\":\"$AID\"}")"
echo "== deleting data safely =="
TMP=$(curl -s -H "$A" -H "$H" $BASE/api/workspaces -d '{"name":"Temp"}' | js "print(d['id'])"); TT=$(curl -s -X POST -H "$A" $BASE/api/workspaces/$TMP/switch | js "print(d['token'])")
ck "owner deletes the temp workspace" 200 "$(code -X DELETE -H "$A" $BASE/api/workspaces/$TMP)"
ck "the deleted workspace's token is dead" 401 "$(code -H "Authorization: Bearer $TT" $BASE/api/notes)"
ck "cannot delete your only workspace" 409 "$(code -X DELETE -H "$B" $BASE/api/workspaces/$PERS_B)"
ck "alice cannot delete her account while Team has other members" 409 "$(code -X DELETE -H "$A" -H "$H" $BASE/api/account -d '{"password":"password123"}')"; echo "       -> $(js "print(d['message'])" < /tmp/body | cut -c1-150)"
curl -s -o /dev/null -X DELETE -H "$AT" $BASE/api/workspaces/$TID/members/$BID
ck "after removing bob, alice's account deletion succeeds" 200 "$(code -X DELETE -H "$A" -H "$H" $BASE/api/account -d '{"password":"password123"}')"
ck "bob still works in his own workspace" 200 "$(code -H "Authorization: Bearer $(login bob$R@t.co)" $BASE/api/notes)"
echo; echo "RESULT: $PASS passed, $FAILN failed"

[ "$FAILN" = 0 ]
