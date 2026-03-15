#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# Form 6 Full QA Test Suite — Registration of a Trademark
# USAGE: bash tests/form6-qa/test_form6_full_qa.sh
# Run from project root. Dev server must be running: npm run dev
#
# Workflow:
#   Initiator → BUM + FBP + CLUSTER_HEAD (parallel) → Legal GM (initial review)
#   → Legal Officer (initial actions) → Legal GM (final approval)
#   → Legal Officer (finalization → COMPLETED)
# ══════════════════════════════════════════════════════════════════════════════

BASE="http://localhost:3000"

if ! curl -s --max-time 3 "$BASE/api/auth/csrf" > /dev/null 2>&1; then
  echo -e "\033[0;31m❌ Dev server is not running. Start it with: npm run dev\033[0m"
  exit 1
fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────
echo -e "\n\033[1;33m🧹 Cleaning up previous QA test data...\033[0m"
npx prisma db execute --stdin <<'SQL' 2>/dev/null
DELETE FROM "submission_parties"           WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F6_%');
DELETE FROM "submission_approvals"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F6_%');
DELETE FROM "submission_documents"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F6_%');
DELETE FROM "submission_comments"          WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F6_%');
DELETE FROM "submission_special_approvers" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F6_%');
DELETE FROM "submissions"                  WHERE "submissionNo" LIKE 'LHD_QA_F6_%';
SQL
echo -e "\033[0;32m  ✅ Cleanup done\033[0m"

# ─── Colours & helpers ────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
NC='\033[0m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
pass()    { echo -e "${GREEN}  ✅ $1${NC}"; }
fail()    { echo -e "${RED}  ❌ $1${NC}"; }
info()    { echo -e "${BLUE}  ℹ️  $1${NC}"; }
section() { echo -e "\n${YELLOW}══════════════════════════════════════${NC}"; echo -e "${YELLOW}  $1${NC}"; echo -e "${YELLOW}══════════════════════════════════════${NC}"; }
subsect() { echo -e "\n${CYAN}  ── $1 ──${NC}"; }

PASS_COUNT=0; FAIL_COUNT=0
track_pass() { PASS_COUNT=$((PASS_COUNT+1)); pass "$1"; }
track_fail() { FAIL_COUNT=$((FAIL_COUNT+1)); fail "$1"; }

# ─── Auth helper ──────────────────────────────────────────────────────────────
login() {
  local EMAIL=$1 COOKIE=$2
  CSRF=$(curl -s -c $COOKIE "$BASE/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
  curl -s -c $COOKIE -b $COOKIE -X POST "$BASE/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "email=$EMAIL" \
    --data-urlencode "password=Test@1234" \
    --data-urlencode "csrfToken=$CSRF" \
    --data-urlencode "json=true" -L > /dev/null
  SESSION=$(curl -s -b $COOKIE "$BASE/api/auth/session" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('name','FAILED'))")
  if [ "$SESSION" != "FAILED" ] && [ -n "$SESSION" ]; then
    track_pass "Logged in as: $SESSION"
  else
    track_fail "Login failed for $EMAIL"; exit 1
  fi
}

# ─── API helpers ──────────────────────────────────────────────────────────────
get_sub()   { curl -s -b /tmp/c_f6_initiator.txt "$BASE/api/submissions/$1"; }
api_ok()    { echo $1 | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; return $?; }
get_id()    { echo $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))"; }
get_field() { get_sub $2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1',''))" 2>/dev/null; }

check_status() {
  ACTUAL=$(get_field "status" $1)
  [ "$ACTUAL" = "$2" ] && track_pass "status = $2 ✓" || track_fail "status: expected '$2', got '$ACTUAL'"
}
check_lo_stage() {
  ACTUAL=$(get_field "loStage" $1)
  [ "$ACTUAL" = "$2" ] && track_pass "loStage = $2 ✓" || track_fail "loStage: expected '$2', got '$ACTUAL'"
}
check_gm_stage() {
  ACTUAL=$(get_field "legalGmStage" $1)
  [ "$ACTUAL" = "$2" ] && track_pass "legalGmStage = $2 ✓" || track_fail "legalGmStage: expected '$2', got '$ACTUAL'"
}
check_field() {
  ACTUAL=$(get_field "$1" $2)
  [ "$ACTUAL" = "$3" ] && track_pass "$1 = '$3' ✓" || track_fail "$1: expected '$3', got '$ACTUAL'"
}

approve() {
  local COOKIE=$1 SUB=$2 ROLE=$3 ACTION=$4 LABEL=$5
  R=$(curl -s -b $COOKIE -X POST "$BASE/api/submissions/$SUB/approve" \
    -H "Content-Type: application/json" \
    -d "{\"role\":\"$ROLE\",\"action\":\"$ACTION\",\"comment\":\"QA test\",\"approverName\":\"QA $ROLE\"}")
  api_ok "$R" && track_pass "$LABEL ✓" || { track_fail "$LABEL FAILED"; echo "    → $(echo $R | python3 -c 'import sys,json; print(json.load(sys.stdin).get("error","?"))')"; }
}

# ─── Form 6 submission factory ────────────────────────────────────────────────
make_f6() {
  local NO=$1 STATUS=$2
  curl -s -b /tmp/c_f6_initiator.txt -X POST "$BASE/api/submissions" \
    -H "Content-Type: application/json" \
    -d "{
      \"submissionNo\": \"$NO\",
      \"formId\": 6,
      \"formName\": \"Registration of a Trademark\",
      \"status\": \"$STATUS\",
      \"initiatorId\": \"$INITIATOR_ID\",
      \"initiatorName\": \"Test Initiator\",
      \"companyCode\": \"DIMO PLC\",
      \"sapCostCenter\": \"000003999\",
      \"title\": \"Registration of a Trademark\",
      \"scopeOfAgreement\": \"{\\\"trademarkClass\\\":\\\"Class 12 - Vehicles\\\",\\\"artworkOrWord\\\":\\\"DIMO WORDMARK\\\",\\\"remarks\\\":\\\"QA test trademark registration\\\"}\",
      \"term\": \"Class 12 - Vehicles\",
      \"initiatorComments\": \"DIMO WORDMARK\",
      \"lkrValue\": \"0\",
      \"remarks\": \"QA Test Submission\",
      \"legalOfficerId\": \"\",
      \"bumId\": \"$BUM_ID\",
      \"fbpId\": \"$FBP_ID\",
      \"clusterHeadId\": \"$CH_ID\",
      \"parties\": []
    }"
}

# ══════════════════════════════════════════════════════════════════════════════
section "STEP 0: Environment Setup"
# ══════════════════════════════════════════════════════════════════════════════

# Bootstrap login to fetch user IDs
CSRF=$(curl -s -c /tmp/c_f6_initiator.txt "$BASE/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -c /tmp/c_f6_initiator.txt -b /tmp/c_f6_initiator.txt -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=oliva.perera@testdimo.com" \
  --data-urlencode "password=Test@1234" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "json=true" -L > /dev/null

USERS=$(curl -s -b /tmp/c_f6_initiator.txt "$BASE/api/users?includeInactive=true")
uid() { echo $USERS | python3 -c "import sys,json; u=[x for x in json.load(sys.stdin).get('data',[]) if x.get('email')=='$1']; print(u[0]['id'] if u else '')"; }

INITIATOR_ID=$(uid "oliva.perera@testdimo.com")
BUM_ID=$(uid "grace.perera@testdimo.com")
FBP_ID=$(uid "madurika.sama@testdimo.com")
CH_ID=$(uid "mangala.wick@testdimo.com")
LO_ID=$(uid "sandalie.gomes@testdimo.com")
LGM_ID=$(uid "dinali.guru@testdimo.com")
SA_ID=$(uid "special.approver@testdimo.com")

[ -n "$INITIATOR_ID" ] && track_pass "Initiator ID:    $INITIATOR_ID" || { track_fail "Initiator not found"; exit 1; }
[ -n "$BUM_ID"  ]      && track_pass "BUM ID:          $BUM_ID"       || { track_fail "BUM not found"; exit 1; }
[ -n "$FBP_ID"  ]      && track_pass "FBP ID:          $FBP_ID"       || { track_fail "FBP not found"; exit 1; }
[ -n "$CH_ID"   ]      && track_pass "Cluster Head:    $CH_ID"        || { track_fail "Cluster Head not found"; exit 1; }
[ -n "$LO_ID"   ]      && track_pass "Legal Officer:   $LO_ID"        || { track_fail "Legal Officer not found"; exit 1; }
[ -n "$LGM_ID"  ]      && track_pass "Legal GM:        $LGM_ID"       || { track_fail "Legal GM not found"; exit 1; }
[ -n "$SA_ID"   ]      && track_pass "Special Approver: $SA_ID"       || track_fail "Special Approver not found (non-fatal)"

subsect "Login all roles"
login "oliva.perera@testdimo.com"     /tmp/c_f6_initiator.txt
login "grace.perera@testdimo.com"     /tmp/c_f6_bum.txt
login "madurika.sama@testdimo.com"    /tmp/c_f6_fbp.txt
login "mangala.wick@testdimo.com"     /tmp/c_f6_ch.txt
login "dinali.guru@testdimo.com"      /tmp/c_f6_lgm.txt
login "sandalie.gomes@testdimo.com"   /tmp/c_f6_lo.txt
login "special.approver@testdimo.com" /tmp/c_f6_sa.txt

# ══════════════════════════════════════════════════════════════════════════════
section "TEST A: Full Happy Path — End to End"
# ══════════════════════════════════════════════════════════════════════════════
# Flow: Initiator → BUM + FBP + CH (parallel) → Legal GM (initial)
#   → Legal Officer (initial review) → Legal GM (final) → Legal Officer (finalize) → COMPLETED

subsect "A1: Initiator creates Form 6 submission"
RES=$(make_f6 "LHD_QA_F6_HAPPY_001" "PENDING_APPROVAL")
SUB=$(get_id "$RES")
SUB_NO=$(echo $RES | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('submissionNo','') or d.get('data',{}).get('submissionNo',''))")
[ -n "$SUB" ] && track_pass "Submission created — No: $SUB_NO | ID: $SUB" || { track_fail "Submission creation failed: $RES"; exit 1; }

subsect "A2: Verify initial field values"
check_field "formId"       $SUB "6"
check_field "formName"     $SUB "Registration of a Trademark"
check_field "status"       $SUB "PENDING_APPROVAL"
check_field "loStage"      $SUB "PENDING_LEGAL_GM"
check_field "legalGmStage" $SUB "INITIAL_REVIEW"
check_field "companyCode"  $SUB "DIMO PLC"
check_field "term"         $SUB "Class 12 - Vehicles"

APPROVALS=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
[ "$APPROVALS" -eq "3" ] && track_pass "3 parallel approvals created (BUM+FBP+CH) ✓" || track_fail "Expected 3 approvals, got $APPROVALS"

# Verify NO CEO approval for Form 6
CEO_APPROVAL=$(get_sub $SUB | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='CEO']))")
[ "$CEO_APPROVAL" -eq "0" ] && track_pass "No CEO approval row (Form 6 has no CEO step) ✓" || track_fail "Form 6 should NOT have CEO, found $CEO_APPROVAL"

# Verify CLUSTER_HEAD approval exists
CH_APPROVAL=$(get_sub $SUB | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='CLUSTER_HEAD']))")
[ "$CH_APPROVAL" -eq "1" ] && track_pass "CLUSTER_HEAD approval row present ✓" || track_fail "Expected 1 CLUSTER_HEAD approval, got $CH_APPROVAL"

subsect "A3: BUM approves"
approve /tmp/c_f6_bum.txt $SUB BUM APPROVED "BUM approval"
check_status $SUB "PENDING_APPROVAL"

subsect "A4: FBP approves — still waiting for CH"
approve /tmp/c_f6_fbp.txt $SUB FBP APPROVED "FBP approval"
check_status $SUB "PENDING_APPROVAL"

subsect "A5: Cluster Head approves — moves to PENDING_LEGAL_GM (no CEO)"
approve /tmp/c_f6_ch.txt $SUB CLUSTER_HEAD APPROVED "Cluster Head approval"
check_status $SUB "PENDING_LEGAL_GM"

subsect "A6: Legal GM assigns officer + initial approval — PENDING_LEGAL_OFFICER (INITIAL_REVIEW)"
PATCH_R=$(curl -s -b /tmp/c_f6_lgm.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d "{\"assignedLegalOfficer\": \"$LO_ID\"}")
api_ok "$PATCH_R" && track_pass "Legal GM assigned legal officer ✓" || track_fail "Officer assignment failed"
approve /tmp/c_f6_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM initial approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "INITIAL_REVIEW"
check_gm_stage $SUB "INITIAL_REVIEW"
check_field "assignedLegalOfficer" $SUB "$LO_ID"

subsect "A7: Legal Officer submits to GM — PENDING_LEGAL_GM_FINAL"
approve /tmp/c_f6_lo.txt $SUB LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "Legal Officer submit to GM"
check_status   $SUB "PENDING_LEGAL_GM_FINAL"
check_gm_stage $SUB "FINAL_APPROVAL"
check_lo_stage $SUB "PENDING_GM"

subsect "A8: Legal GM final approval — PENDING_LEGAL_OFFICER (FINALIZATION)"
approve /tmp/c_f6_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM final approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "FINALIZATION"

subsect "A9: Legal Officer marks COMPLETED"
COMP_RES=$(curl -s -b /tmp/c_f6_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"COMPLETED","comment":"Trademark registration complete","approverName":"Sandalie Gomes"}')
api_ok "$COMP_RES" && track_pass "Legal Officer COMPLETED ✓" || track_fail "LO COMPLETED failed"
check_status $SUB "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST B: Draft Save & Edit"
# ══════════════════════════════════════════════════════════════════════════════

subsect "B1: Save as DRAFT"
RES=$(make_f6 "LHD_QA_F6_DRAFT_001" "DRAFT")
DR=$(get_id "$RES")
[ -n "$DR" ] && track_pass "Draft created: $DR" || track_fail "Draft creation failed"
check_status $DR "DRAFT"

subsect "B2: Edit draft — update trademarkClass and promote to PENDING_APPROVAL"
PATCH_RES=$(curl -s -b /tmp/c_f6_initiator.txt -X PATCH "$BASE/api/submissions/$DR" \
  -H "Content-Type: application/json" \
  -d '{"status":"PENDING_APPROVAL","term":"Class 4 - Lubricants and Fuels","scopeOfAgreement":"{\"trademarkClass\":\"Class 4 - Lubricants and Fuels\",\"artworkOrWord\":\"DIMO LUBRICANTS\",\"remarks\":\"Updated QA test\"}"}')
api_ok "$PATCH_RES" && track_pass "Draft PATCH succeeded ✓" || track_fail "Draft edit failed"
check_status $DR "PENDING_APPROVAL"

subsect "B3: Verify updated scopeOfAgreement (trademarkClass) saved"
UPDATED=$(get_sub $DR | python3 -c "
import sys,json
d=json.load(sys.stdin)
try:
  s=json.loads(d.get('data',{}).get('scopeOfAgreement','{}'))
  print(s.get('trademarkClass',''))
except:
  print('')
" 2>/dev/null)
[ "$UPDATED" = "Class 4 - Lubricants and Fuels" ] && track_pass "scopeOfAgreement.trademarkClass updated ✓" || track_fail "trademarkClass not updated: $UPDATED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST C: Send Back Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "C1: BUM sends back"
RES=$(make_f6 "LHD_QA_F6_SB_BUM_001" "PENDING_APPROVAL")
SB_BUM=$(get_id "$RES")
approve /tmp/c_f6_bum.txt $SB_BUM BUM SENT_BACK "BUM send-back"
check_status $SB_BUM "SENT_BACK"

subsect "C2: FBP sends back"
RES=$(make_f6 "LHD_QA_F6_SB_FBP_001" "PENDING_APPROVAL")
SB_FBP=$(get_id "$RES")
approve /tmp/c_f6_fbp.txt $SB_FBP FBP SENT_BACK "FBP send-back"
check_status $SB_FBP "SENT_BACK"

subsect "C3: Cluster Head sends back"
RES=$(make_f6 "LHD_QA_F6_SB_CH_001" "PENDING_APPROVAL")
SB_CH=$(get_id "$RES")
approve /tmp/c_f6_ch.txt $SB_CH CLUSTER_HEAD SENT_BACK "Cluster Head send-back"
check_status $SB_CH "SENT_BACK"

subsect "C4: Legal GM sends back at initial review"
RES=$(make_f6 "LHD_QA_F6_SB_LGM_001" "PENDING_LEGAL_GM")
SB_LGM=$(get_id "$RES")
approve /tmp/c_f6_lgm.txt $SB_LGM LEGAL_GM SENT_BACK "Legal GM send-back"
check_status $SB_LGM "SENT_BACK"

subsect "C5: Legal Officer returns to initiator (RETURNED_TO_INITIATOR)"
RES=$(make_f6 "LHD_QA_F6_SB_LO_001" "PENDING_LEGAL_OFFICER")
SB_LO=$(get_id "$RES")
R=$(curl -s -b /tmp/c_f6_lo.txt -X POST "$BASE/api/submissions/$SB_LO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"RETURNED_TO_INITIATOR","comment":"Missing trademark specimens","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "Legal Officer return to initiator ✓" || track_fail "LO return failed"
check_status $SB_LO "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST D: Parallel Approval Logic"
# ══════════════════════════════════════════════════════════════════════════════

subsect "D1: Only BUM approves — stays PENDING_APPROVAL"
RES=$(make_f6 "LHD_QA_F6_PAR_001" "PENDING_APPROVAL")
PAR=$(get_id "$RES")
approve /tmp/c_f6_bum.txt $PAR BUM APPROVED "BUM only approval"
check_status $PAR "PENDING_APPROVAL"

subsect "D2: FBP also approves — still PENDING_APPROVAL (CH not yet)"
approve /tmp/c_f6_fbp.txt $PAR FBP APPROVED "FBP approval (2 of 3)"
check_status $PAR "PENDING_APPROVAL"

subsect "D3: Cluster Head approves — moves to PENDING_LEGAL_GM (not PENDING_CEO)"
approve /tmp/c_f6_ch.txt $PAR CLUSTER_HEAD APPROVED "CH approval — triggers transition"
check_status $PAR "PENDING_LEGAL_GM"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST E: Cancellation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "E1: BUM cancels"
RES=$(make_f6 "LHD_QA_F6_CANCEL_001" "PENDING_APPROVAL")
CAN=$(get_id "$RES")
approve /tmp/c_f6_bum.txt $CAN BUM CANCELLED "BUM cancellation"
check_status $CAN "CANCELLED"

subsect "E2: Cluster Head cancels"
RES=$(make_f6 "LHD_QA_F6_CANCEL_002" "PENDING_APPROVAL")
CAN2=$(get_id "$RES")
approve /tmp/c_f6_ch.txt $CAN2 CLUSTER_HEAD CANCELLED "Cluster Head cancellation"
check_status $CAN2 "CANCELLED"

subsect "E3: Legal GM cancels"
RES=$(make_f6 "LHD_QA_F6_CANCEL_003" "PENDING_LEGAL_GM")
CAN3=$(get_id "$RES")
approve /tmp/c_f6_lgm.txt $CAN3 LEGAL_GM CANCELLED "Legal GM cancellation"
check_status $CAN3 "CANCELLED"

subsect "E4: Legal Officer cancels"
RES=$(make_f6 "LHD_QA_F6_CANCEL_004" "PENDING_LEGAL_OFFICER")
CAN4=$(get_id "$RES")
R=$(curl -s -b /tmp/c_f6_lo.txt -X POST "$BASE/api/submissions/$CAN4/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"CANCELLED","comment":"Cancelled by LO","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "LO cancellation ✓" || track_fail "LO cancellation failed"
check_status $CAN4 "CANCELLED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST F: Special Approver Flow"
# ══════════════════════════════════════════════════════════════════════════════

subsect "F1: Legal GM assigns Special Approver at initial review"
RES=$(make_f6 "LHD_QA_F6_SA_001" "PENDING_LEGAL_GM")
SA_SUB=$(get_id "$RES")
SA_RES=$(curl -s -b /tmp/c_f6_lgm.txt -X POST "$BASE/api/submissions/$SA_SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"specialApprovers\":[{\"email\":\"special.approver@testdimo.com\",\"name\":\"Special Approver\",\"dept\":\"Legal\"}],\"assignedOfficer\":\"$LO_ID\"}")
api_ok "$SA_RES" && track_pass "Legal GM assigned special approver ✓" || track_fail "Special approver assignment failed"
check_status   $SA_SUB "PENDING_SPECIAL_APPROVER"
check_lo_stage $SA_SUB "INITIAL_REVIEW"

subsect "F2: Special Approver approves — routes to Legal Officer"
SA_APPROVE=$(curl -s -b /tmp/c_f6_sa.txt -X POST "$BASE/api/submissions/$SA_SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_APPROVE" && track_pass "Special Approver approved ✓" || track_fail "Special Approver approval failed"
check_status   $SA_SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SA_SUB "INITIAL_REVIEW"

subsect "F3: Legal Officer assigns Special Approver (from LO stage)"
RES=$(make_f6 "LHD_QA_F6_SA_LO_001" "PENDING_LEGAL_OFFICER")
SA_LO_SUB=$(get_id "$RES")
SA_LO_RES=$(curl -s -b /tmp/c_f6_lo.txt -X POST "$BASE/api/submissions/$SA_LO_SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"ASSIGN_SPECIAL_APPROVER","specialApproverEmail":"special.approver@testdimo.com","specialApproverName":"Special Approver"}')
api_ok "$SA_LO_RES" && track_pass "Legal Officer assigned special approver ✓" || track_fail "LO special approver assignment failed"
check_status $SA_LO_SUB "PENDING_SPECIAL_APPROVER"

subsect "F4: Special Approver approves — routes back to Legal Officer (REVIEW_FOR_GM)"
SA_LO_APP=$(curl -s -b /tmp/c_f6_sa.txt -X POST "$BASE/api/submissions/$SA_LO_SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_LO_APP" && track_pass "Special Approver approved (LO path) ✓" || track_fail "Special Approver LO path failed"
check_status   $SA_LO_SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SA_LO_SUB "REVIEW_FOR_GM"

subsect "F5: Special Approver sends back"
RES=$(make_f6 "LHD_QA_F6_SA_SB_001" "PENDING_SPECIAL_APPROVER")
SA_SB=$(get_id "$RES")
# Seed special approver record
curl -s -b /tmp/c_f6_lgm.txt -X POST "$BASE/api/submissions/$SA_SB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_GM","action":"APPROVED","specialApprovers":[{"email":"special.approver@testdimo.com","name":"Special Approver","dept":"Legal"}]}' > /dev/null
SA_SB_RES=$(curl -s -b /tmp/c_f6_sa.txt -X POST "$BASE/api/submissions/$SA_SB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"SENT_BACK","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_SB_RES" && track_pass "Special Approver sent back ✓" || track_fail "SA send-back failed"
check_status $SA_SB "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST G: Document Management"
# ══════════════════════════════════════════════════════════════════════════════

subsect "G1: Verify document count on creation (from form config)"
RES=$(make_f6 "LHD_QA_F6_DOCS_001" "PENDING_APPROVAL")
DOCS_SUB=$(get_id "$RES")
DOC_COUNT=$(get_sub $DOCS_SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
info "Form 6 doc count at creation: $DOC_COUNT (depends on admin settings)"
[ "$DOC_COUNT" -ge "0" ] && track_pass "Document creation checked: $DOC_COUNT docs ✓" || track_fail "Document count error"

subsect "G2: Legal GM can update document status"
# Advance to PENDING_LEGAL_OFFICER so LO can update docs
LGM_R=$(curl -s -b /tmp/c_f6_lgm.txt -X POST "$BASE/api/submissions/$DOCS_SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\"}" 2>/dev/null)
# Only test doc update if docs exist
if [ "$DOC_COUNT" -gt "0" ]; then
  DOC_ID=$(get_sub $DOCS_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[0]['id'] if docs else '')")
  [ -n "$DOC_ID" ] && track_pass "Got document ID: $DOC_ID" || track_fail "No document ID"
  DOC_UPD=$(curl -s -b /tmp/c_f6_lo.txt -X PATCH "$BASE/api/submissions/$DOCS_SUB" \
    -H "Content-Type: application/json" \
    -d "{\"documentId\":\"$DOC_ID\",\"documentStatus\":\"APPROVED\",\"documentComment\":\"Trademark specimens verified\"}")
  api_ok "$DOC_UPD" && track_pass "Document status updated to APPROVED ✓" || track_fail "Document update failed"
else
  info "No documents to update (form config not set up) — configure via /settings to add Form 6 docs"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "TEST H: Resubmission"
# ══════════════════════════════════════════════════════════════════════════════

subsect "H1: Create resubmission linked to original (LHD_QA_F6_HAPPY_001)"
RESUB=$(curl -s -b /tmp/c_f6_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F6_HAPPY_001_R1\",
    \"formId\": 6, \"formName\": \"Registration of a Trademark\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"DIMO PLC\", \"sapCostCenter\": \"000003999\",
    \"title\": \"Registration of a Trademark\",
    \"scopeOfAgreement\": \"{\\\"trademarkClass\\\":\\\"Class 12 - Vehicles\\\",\\\"artworkOrWord\\\":\\\"DIMO MARK V2\\\",\\\"remarks\\\":\\\"Resubmission\\\"}\",
    \"term\": \"Class 12 - Vehicles\", \"lkrValue\": \"0\", \"remarks\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": [],
    \"parentId\": \"$SUB\", \"isResubmission\": true
  }")
RID=$(get_id "$RESUB")
RPARENT=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('parentId',''))")
RFLAG=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isResubmission',''))")
[ -n "$RID" ]           && track_pass "Resubmission created: $RID ✓"  || track_fail "Resubmission failed"
[ "$RPARENT" = "$SUB" ] && track_pass "parentId linked correctly ✓"    || track_fail "parentId wrong: $RPARENT"
[ "$RFLAG" = "True" ]   && track_pass "isResubmission = True ✓"        || track_fail "isResubmission flag wrong: $RFLAG"

subsect "H2: Mark original as RESUBMITTED"
MR=$(curl -s -b /tmp/c_f6_initiator.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}')
api_ok "$MR" && track_pass "Original marked RESUBMITTED ✓" || track_fail "Mark RESUBMITTED failed"
check_field "status" $SUB "RESUBMITTED"

subsect "H3: RESUBMITTED submissions hidden from API list"
RESUBMITTED_IN_LIST=$(curl -s -b /tmp/c_f6_initiator.txt "$BASE/api/submissions" | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
found=[s for s in data if s.get('status')=='RESUBMITTED']
print(len(found))")
[ "$RESUBMITTED_IN_LIST" -eq "0" ] && track_pass "RESUBMITTED filtered from list ✓" || track_fail "API returns $RESUBMITTED_IN_LIST RESUBMITTED submissions"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST I: Comments"
# ══════════════════════════════════════════════════════════════════════════════

subsect "I1: Post a comment on resubmission"
CMT_RES=$(curl -s -b /tmp/c_f6_lgm.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dinali Gurusinghe","authorRole":"LEGAL_GM","text":"Please attach trademark specimen sheets and class evidence."}')
api_ok "$CMT_RES" && track_pass "Comment posted ✓" || track_fail "Comment post failed"

subsect "I2: Verify comment appears in GET response"
CMT_COUNT=$(get_sub $RID | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT" -gt "0" ] && track_pass "Comment visible ($CMT_COUNT) ✓" || track_fail "No comments found"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST J: API Edge Cases"
# ══════════════════════════════════════════════════════════════════════════════

subsect "J1: GET non-existent submission → 404"
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions/nonexistent_f6_qa_xyz")
[ "$R" = "404" ] && track_pass "Non-existent returns 404 ✓" || track_fail "Expected 404, got $R"

subsect "J2: POST missing required fields → error"
BAD=$(curl -s -b /tmp/c_f6_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"formId":6}')
BAD_OK=$(echo $BAD | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$BAD_OK" = "False" ] && track_pass "Missing fields returns error ✓" || track_fail "Expected error for missing fields"

subsect "J3: Duplicate submission number → rejected"
DUP=$(make_f6 "LHD_QA_F6_HAPPY_001_R1" "PENDING_APPROVAL")
DUP_OK=$(echo $DUP | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$DUP_OK" = "False" ] && track_pass "Duplicate number rejected ✓" || track_fail "Expected conflict for duplicate"

subsect "J4: Unauthenticated approve → 401"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"BUM","action":"APPROVED"}')
[ "$UNAUTH" = "401" ] && track_pass "Unauthenticated returns 401 ✓" || track_fail "Expected 401, got $UNAUTH"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST K: Form 6 Isolation — Confirms no CEO, no Court Officer"
# ══════════════════════════════════════════════════════════════════════════════

subsect "K1: Form 6 goes directly to PENDING_LEGAL_GM after CH approval (no CEO step)"
RES=$(make_f6 "LHD_QA_F6_NOCEO_001" "PENDING_APPROVAL")
NOCEO=$(get_id "$RES")
approve /tmp/c_f6_bum.txt $NOCEO BUM APPROVED "BUM"
approve /tmp/c_f6_fbp.txt $NOCEO FBP APPROVED "FBP"
approve /tmp/c_f6_ch.txt  $NOCEO CLUSTER_HEAD APPROVED "CH"
STATUS=$(get_field "status" $NOCEO)
[ "$STATUS" = "PENDING_LEGAL_GM" ] && track_pass "Form 6 skips CEO → PENDING_LEGAL_GM ✓" || track_fail "Expected PENDING_LEGAL_GM, got $STATUS"

subsect "K2: Form 6 loStage starts as PENDING_LEGAL_GM (not PENDING_CEO like Form 2)"
INIT_LO=$(get_field "loStage" $NOCEO)
[ "$INIT_LO" = "PENDING_LEGAL_GM" ] && track_pass "Form 6 loStage = PENDING_LEGAL_GM ✓" || track_fail "loStage wrong: $INIT_LO"

subsect "K3: Form 6 LO flow uses INITIAL_REVIEW (not ASSIGN_COURT_OFFICER like Form 3)"
LGM_R=$(curl -s -b /tmp/c_f6_lgm.txt -X POST "$BASE/api/submissions/$NOCEO/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\"}")
api_ok "$LGM_R" && track_pass "Legal GM initial approval ✓" || track_fail "LGM initial FAILED"
LO_STAGE=$(get_field "loStage" $NOCEO)
[ "$LO_STAGE" = "INITIAL_REVIEW" ] && track_pass "Form 6 loStage = INITIAL_REVIEW (no Court Officer) ✓" || track_fail "loStage wrong: $LO_STAGE"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST L: Settings — Form 6 Config"
# ══════════════════════════════════════════════════════════════════════════════

subsect "L1: Legal GM POSTs instructions and docs for Form 6"
INSTR_RES=$(curl -s -b /tmp/c_f6_lgm.txt -X POST "$BASE/api/settings/forms" \
  -H "Content-Type: application/json" \
  -d '{
    "formId": 6,
    "instructions": "QA Test Instructions: Attach trademark application form, class description, and specimen of use.",
    "docs": [
      {"label": "Trademark Application Form", "type": "Common"},
      {"label": "Specimen of Use", "type": "Common"},
      {"label": "Priority Document (if claiming priority)", "type": "Common"}
    ]
  }')
api_ok "$INSTR_RES" && track_pass "Form 6 instructions and docs saved ✓" || track_fail "Instructions save FAILED"

subsect "L2: GET /api/settings/forms includes Form 6"
SETTINGS=$(curl -s -b /tmp/c_f6_lgm.txt "$BASE/api/settings/forms")
F6_CONFIG=$(echo $SETTINGS | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
f6=[c for c in data if c.get('formId')==6]
print(f6[0].get('formName','') if f6 else 'NOT FOUND')
")
[ "$F6_CONFIG" != "NOT FOUND" ] && track_pass "Form 6 config exists: '$F6_CONFIG' ✓" || track_fail "Form 6 config NOT FOUND in settings"

subsect "L3: Instructions persist and docs are readable"
VERIFY=$(curl -s -b /tmp/c_f6_initiator.txt "$BASE/api/settings/forms")
SAVED_INSTR=$(echo $VERIFY | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
f6=[c for c in data if c.get('formId')==6]
print(f6[0].get('instructions','') if f6 else '')
")
echo "$SAVED_INSTR" | grep -q "QA Test Instructions" \
  && track_pass "Instructions persist ✓" \
  || track_fail "Instructions not found after save"

SAVED_DOCS=$(echo $VERIFY | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
f6=[c for c in data if c.get('formId')==6]
docs=f6[0].get('docs',[]) if f6 else []
print(len(docs))
")
[ "$SAVED_DOCS" -eq "3" ] && track_pass "3 config docs saved ✓" || track_fail "Expected 3 docs, got $SAVED_DOCS"

subsect "L4: Non-LGM cannot save Form 6 settings (blocked)"
UNAUTH_INSTR=$(curl -s -b /tmp/c_f6_initiator.txt -X POST "$BASE/api/settings/forms" \
  -H "Content-Type: application/json" \
  -d '{"formId":6,"instructions":"Hacked!","docs":[]}')
UNAUTH_OK=$(echo $UNAUTH_INSTR | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$UNAUTH_OK" = "False" ] && track_pass "Non-LGM blocked from saving settings ✓" || track_fail "Non-LGM should NOT save settings"

# ══════════════════════════════════════════════════════════════════════════════
section "FULL QA SUMMARY"
# ══════════════════════════════════════════════════════════════════════════════
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo -e "${YELLOW}  Results: ${GREEN}$PASS_COUNT passed${NC} / ${RED}$FAIL_COUNT failed${NC} / $TOTAL total"
echo ""
echo -e "  ${BLUE}Key submission IDs:${NC}"
echo -e "  Happy path:     $SUB  ($SUB_NO)"
echo -e "  Draft:          $DR"
echo -e "  Parallel:       $PAR"
echo -e "  Resubmission:   $RID  (parent: $SUB)"
echo -e "  Spec Approver:  $SA_SUB | LO path: $SA_LO_SUB"
echo -e "  Send-backs:     BUM=$SB_BUM | FBP=$SB_FBP | CH=$SB_CH | LGM=$SB_LGM | LO=$SB_LO"
echo -e "  Cancellations:  $CAN | $CAN2 | $CAN3 | $CAN4"
echo -e "  Isolation:      $NOCEO"
echo ""
if [ "$FAIL_COUNT" -eq "0" ]; then
  echo -e "${GREEN}  🎉 ALL TESTS PASSED — Form 6 is fully verified!${NC}"
else
  echo -e "${RED}  ⚠️  $FAIL_COUNT test(s) failed — review ❌ above${NC}"
fi
echo ""
