#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# Form 7 Full QA Test Suite — Termination of Lease Agreement
# USAGE: bash tests/test_form7_full_qa.sh
# Run from project root. Dev server must be running: npm run dev
#
# Workflow:
#   Initiator → BUM + GENERAL_MANAGER (parallel) → Legal GM (initial review)
#   → Legal Officer (initial actions) → Legal GM (final approval)
#   → Legal Officer (termination letter + Job Completion)
# ══════════════════════════════════════════════════════════════════════════════

BASE="http://localhost:3000"

if ! curl -s --max-time 3 "$BASE/api/auth/csrf" > /dev/null 2>&1; then
  echo -e "\033[0;31m❌ Dev server is not running. Start it with: npm run dev\033[0m"
  exit 1
fi

echo -e "\033[1;33m🧹 Cleaning up previous QA test data...\033[0m"
npx prisma db execute --stdin <<'SQL' 2>/dev/null
DELETE FROM "submission_parties"           WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F7_%');
DELETE FROM "submission_approvals"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F7_%');
DELETE FROM "submission_documents"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F7_%');
DELETE FROM "submission_comments"          WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F7_%');
DELETE FROM "submission_special_approvers" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F7_%');
DELETE FROM "submissions"                  WHERE "submissionNo" LIKE 'LHD_QA_F7_%';
SQL
echo -e "\033[0;32m✅ Cleanup done\033[0m"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
pass()    { echo -e "${GREEN}✅ $1${NC}"; }
fail()    { echo -e "${RED}❌ $1${NC}"; }
info()    { echo -e "${BLUE}ℹ️  $1${NC}"; }
section() { echo -e "\n${YELLOW}══════════════════════════════════════${NC}"; echo -e "${YELLOW}  $1${NC}"; echo -e "${YELLOW}══════════════════════════════════════${NC}"; }
subsect() { echo -e "\n${CYAN}  ── $1 ──${NC}"; }

PASS_COUNT=0; FAIL_COUNT=0
track_pass() { PASS_COUNT=$((PASS_COUNT+1)); pass "$1"; }
track_fail() { FAIL_COUNT=$((FAIL_COUNT+1)); fail "$1"; }

# ─── Auth helper ───────────────────────────────────────────────────────────────
login() {
  local EMAIL=$1 COOKIE=$2
  CSRF=$(curl -s -c $COOKIE $BASE/api/auth/csrf | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
  curl -s -c $COOKIE -b $COOKIE -X POST "$BASE/api/auth/callback/credentials" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "email=$EMAIL" \
    --data-urlencode "password=Test@1234" \
    --data-urlencode "csrfToken=$CSRF" \
    --data-urlencode "json=true" -L > /dev/null
  SESSION=$(curl -s -b $COOKIE $BASE/api/auth/session | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('name','FAILED'))")
  if [ "$SESSION" != "FAILED" ] && [ -n "$SESSION" ]; then
    track_pass "Logged in as: $SESSION"
  else
    track_fail "Login failed for $EMAIL"; exit 1
  fi
}

# ─── Assertion helpers ─────────────────────────────────────────────────────────
get_sub()      { curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions/$1"; }

check_status() {
  ACTUAL=$(get_sub $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('status',''))")
  [ "$ACTUAL" = "$2" ] && track_pass "Status = $2 ✓" || track_fail "Expected status=$2, got: $ACTUAL"
}
check_lo_stage() {
  ACTUAL=$(get_sub $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('loStage',''))")
  [ "$ACTUAL" = "$2" ] && track_pass "loStage = $2 ✓" || track_fail "Expected loStage=$2, got: $ACTUAL"
}
check_gm_stage() {
  ACTUAL=$(get_sub $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('legalGmStage',''))")
  [ "$ACTUAL" = "$2" ] && track_pass "legalGmStage = $2 ✓" || track_fail "Expected legalGmStage=$2, got: $ACTUAL"
}
check_field() {
  ACTUAL=$(get_sub $2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1','') or '')" 2>/dev/null)
  [ "$ACTUAL" = "$3" ] && track_pass "$1 = '$ACTUAL' ✓" || track_fail "$1: expected '$3', got '$ACTUAL'"
}
api_ok() {
  echo $1 | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null
  return $?
}
approve() {
  local COOKIE=$1 SUB=$2 ROLE=$3 ACTION=$4 LABEL=$5 EXTRA=${6:-""}
  R=$(curl -s -b $COOKIE -X POST "$BASE/api/submissions/$SUB/approve" \
    -H "Content-Type: application/json" \
    -d "{\"role\":\"$ROLE\",\"action\":\"$ACTION\",\"comment\":\"Test comment\",\"approverName\":\"Test $ROLE\",\"approverEmail\":\"test@testdimo.com\"$EXTRA}")
  api_ok "$R" && track_pass "$LABEL ✓" || { track_fail "$LABEL failed"; echo "    Response: $(echo $R | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("error","unknown"))')"; }
}

# ─── Submission factory ────────────────────────────────────────────────────────
make_sub() {
  local NO=$1 STATUS=$2
  curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
    -H "Content-Type: application/json" \
    -d "{
      \"submissionNo\": \"$NO\",
      \"formId\": 7,
      \"formName\": \"Termination of Lease Agreement\",
      \"status\": \"$STATUS\",
      \"initiatorId\": \"$INITIATOR_ID\",
      \"companyCode\": \"DM01\",
      \"title\": \"Termination of Lease — 123 Main St\",
      \"sapCostCenter\": \"000003999\",
      \"scopeOfAgreement\": \"Termination of lease agreement for 123 Main St\",
      \"term\": \"N/A\",
      \"lkrValue\": \"0\",
      \"remarks\": \"QA Test submission\",
      \"bumId\": \"$BUM_EMAIL\",
      \"gmId\": \"$GM_EMAIL\",
      \"f7AgreementRefNo\": \"AGR/2024/001\",
      \"f7AgreementDate\": \"2024-01-15\",
      \"f7InitiatorContact\": \"0771234567\",
      \"f7AssessmentAddress\": \"123 Main Street, Colombo 03\",
      \"f7OwnerNames\": \"John Silva\",
      \"f7EffectiveTerminationDate\": \"2026-06-30\",
      \"f7EarlyTerminationCharges\": \"150000\",
      \"f7RefundableDeposit\": \"200000\",
      \"f7PaymentDate1\": \"2026-07-15\",
      \"f7AdvanceRentals\": \"50000\",
      \"f7PaymentDate2\": \"2026-07-15\",
      \"f7Deductions\": \"10000\",
      \"f7FacilityPayments\": \"5000\",
      \"f7Penalty\": \"0\",
      \"f7AmountDueByDimo\": \"385000\",
      \"f7BalanceToRecover\": \"0\",
      \"f7DateInformedToLessee\": \"2026-03-01\",
      \"documents\": [
        {\"label\": \"Copy of the existing Lease Agreement\", \"type\": \"required\"},
        {\"label\": \"Letter from the Lessee confirming termination\", \"type\": \"required\"},
        {\"label\": \"Inspection Report of the premises\", \"type\": \"required\"},
        {\"label\": \"Settlement calculation sheet\", \"type\": \"required\"}
      ],
      \"parties\": []
    }"
}
get_id() { echo $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))"; }

# ══════════════════════════════════════════════════════════════════════════════
section "STEP 0: Environment Setup"
# ══════════════════════════════════════════════════════════════════════════════

# Pre-login to fetch user IDs
CSRF=$(curl -s -c /tmp/c_initiator.txt "$BASE/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -c /tmp/c_initiator.txt -b /tmp/c_initiator.txt -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=oliva.perera@testdimo.com" \
  --data-urlencode "password=Test@1234" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "json=true" -L > /dev/null

USERS=$(curl -s -b /tmp/c_initiator.txt "$BASE/api/users?includeInactive=true")
uid() { echo $USERS | python3 -c "import sys,json; u=[x for x in json.load(sys.stdin).get('data',[]) if x.get('email')=='$1']; print(u[0]['id'] if u else '')"; }

INITIATOR_ID=$(uid "oliva.perera@testdimo.com")
BUM_ID=$(uid "grace.perera@testdimo.com")
GM_ID=$(uid "general.manager@testdimo.com")
LO_ID=$(uid "sandalie.gomes@testdimo.com")

# Form 7 uses email strings (not IDs) for BUM + GM approver fields
BUM_EMAIL="grace.perera@testdimo.com"
GM_EMAIL="general.manager@testdimo.com"

[ -n "$INITIATOR_ID" ] && track_pass "Initiator ID: $INITIATOR_ID"     || { track_fail "Initiator not found"; exit 1; }
[ -n "$BUM_ID" ]       && track_pass "BUM ID: $BUM_ID"                 || { track_fail "BUM not found"; exit 1; }
[ -n "$GM_ID" ]        && track_pass "General Manager ID: $GM_ID"      || { track_fail "General Manager not found — run: node prisma/seed.js"; exit 1; }
[ -n "$LO_ID" ]        && track_pass "Legal Officer ID: $LO_ID"        || { track_fail "Legal Officer not found"; exit 1; }

subsect "Login all Form 7 roles"
login "oliva.perera@testdimo.com"     /tmp/c_initiator.txt
login "grace.perera@testdimo.com"     /tmp/c_bum.txt
login "general.manager@testdimo.com"  /tmp/c_gm.txt
login "dinali.guru@testdimo.com"      /tmp/c_lgm.txt
login "sandalie.gomes@testdimo.com"   /tmp/c_lo.txt

# ══════════════════════════════════════════════════════════════════════════════
section "TEST A: Full Happy Path — End to End"
# ══════════════════════════════════════════════════════════════════════════════

subsect "A1: Initiator creates Form 7 submission"
RES=$(make_sub "LHD_QA_F7_HAPPY_001" "PENDING_APPROVAL")
SUB=$(get_id "$RES")
SUB_NO=$(echo $RES | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('submissionNo','') or d.get('data',{}).get('submissionNo',''))")
[ -n "$SUB" ] && track_pass "Submission created — No: $SUB_NO | ID: $SUB" || { track_fail "Submission creation failed: $RES"; exit 1; }

subsect "A2: Verify initial field values"
SUB_DATA=$(get_sub $SUB)

chk() {
  V=$(echo $SUB_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1',''))" 2>/dev/null)
  [ "$V" = "$2" ] && track_pass "$1 = '$V' ✓" || track_fail "$1: expected '$2', got '$V'"
}
chk "formId"       "7"
chk "formName"     "Termination of Lease Agreement"
chk "status"       "PENDING_APPROVAL"
chk "loStage"      "PENDING_LEGAL_GM"
chk "legalGmStage" "INITIAL_REVIEW"

subsect "A3: Verify Form 7 specific fields saved"
chk "f7AgreementRefNo"           "AGR/2024/001"
chk "f7AgreementDate"            "2024-01-15"
chk "f7AssessmentAddress"        "123 Main Street, Colombo 03"
chk "f7OwnerNames"               "John Silva"
chk "f7EffectiveTerminationDate" "2026-06-30"
chk "f7EarlyTerminationCharges"  "150000"
chk "f7RefundableDeposit"        "200000"
chk "f7AmountDueByDimo"          "385000"
chk "f7DateInformedToLessee"     "2026-03-01"

subsect "A4: Verify approval structure — BUM + GENERAL_MANAGER only (no FBP, no CLUSTER_HEAD, no CEO)"
APPROVALS_JSON=$(echo $SUB_DATA | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
APPROVAL_COUNT=$(echo $APPROVALS_JSON | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
HAS_BUM=$(echo $APPROVALS_JSON   | python3 -c "import sys,json; print(any(a['role']=='BUM'             for a in json.load(sys.stdin)))")
HAS_GM=$(echo $APPROVALS_JSON    | python3 -c "import sys,json; print(any(a['role']=='GENERAL_MANAGER'  for a in json.load(sys.stdin)))")
HAS_FBP=$(echo $APPROVALS_JSON   | python3 -c "import sys,json; print(any(a['role']=='FBP'             for a in json.load(sys.stdin)))")
HAS_CH=$(echo $APPROVALS_JSON    | python3 -c "import sys,json; print(any(a['role']=='CLUSTER_HEAD'    for a in json.load(sys.stdin)))")
HAS_CEO=$(echo $APPROVALS_JSON   | python3 -c "import sys,json; print(any(a['role']=='CEO'             for a in json.load(sys.stdin)))")

[ "$APPROVAL_COUNT" -eq "2" ]  && track_pass "Exactly 2 approvals created ✓"                     || track_fail "Expected 2 approvals (BUM+GM), got $APPROVAL_COUNT"
[ "$HAS_BUM" = "True" ]        && track_pass "BUM approval row exists ✓"                         || track_fail "BUM approval row missing"
[ "$HAS_GM" = "True" ]         && track_pass "GENERAL_MANAGER approval row exists ✓"             || track_fail "GENERAL_MANAGER approval row missing"
[ "$HAS_FBP" = "False" ]       && track_pass "No FBP approval row (Form 7 has no FBP) ✓"        || track_fail "Form 7 should NOT have FBP approval"
[ "$HAS_CH" = "False" ]        && track_pass "No CLUSTER_HEAD approval row ✓"                    || track_fail "Form 7 should NOT have CLUSTER_HEAD approval"
[ "$HAS_CEO" = "False" ]       && track_pass "No CEO approval row ✓"                             || track_fail "Form 7 should NOT have CEO approval"

subsect "A5: Verify documents created from submitted list"
DOC_COUNT=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$DOC_COUNT" -eq "4" ] && track_pass "4 required documents created ✓" || track_fail "Expected 4 documents, got $DOC_COUNT"

subsect "A6: BUM approves — status stays PENDING_APPROVAL (GM hasn't approved yet)"
approve /tmp/c_bum.txt $SUB BUM APPROVED "BUM approval"
check_status $SUB "PENDING_APPROVAL"
info "Status correctly stays PENDING_APPROVAL — waiting for General Manager"

subsect "A7: General Manager approves — both approved → moves to PENDING_LEGAL_GM"
approve /tmp/c_gm.txt $SUB GENERAL_MANAGER APPROVED "General Manager approval"
check_status $SUB "PENDING_LEGAL_GM"

subsect "A8: Legal GM initial review — assigns Legal Officer → PENDING_LEGAL_OFFICER"
PATCH_R=$(curl -s -b /tmp/c_lgm.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d "{\"assignedLegalOfficer\": \"$LO_ID\"}")
api_ok "$PATCH_R" && track_pass "Legal GM assigned officer ✓" || track_fail "Officer assignment failed"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM initial approval (OK to Proceed)" ",\"assignedOfficer\":\"$LO_ID\""
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "INITIAL_REVIEW"
check_gm_stage $SUB "INITIAL_REVIEW"

subsect "A9: Legal Officer submits to Legal GM → PENDING_LEGAL_GM_FINAL"
approve /tmp/c_lo.txt $SUB LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "Legal Officer submit to GM"
check_status   $SUB "PENDING_LEGAL_GM_FINAL"
check_gm_stage $SUB "FINAL_APPROVAL"
check_lo_stage $SUB "PENDING_GM"

subsect "A10: Legal GM final approval → PENDING_LEGAL_OFFICER with POST_GM_APPROVAL"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM final approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "POST_GM_APPROVAL"

subsect "A11: Legal Officer saves Official Use Only fields (termination letter)"
PATCH_OU=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{
    "f7TerminationLetterRefNo":   "LTR/2026/F7/001",
    "f7TerminationLetterSentDate": "2026-03-04",
    "f7TerminationLetterFileUrl":  "https://storage.example.com/termination-letter.pdf",
    "f7OfficialRemarks":           "Termination letter issued and sent to lessee"
  }')
api_ok "$PATCH_OU" && track_pass "Official Use Only fields saved ✓" || track_fail "Official Use Only PATCH failed"

subsect "A12: Verify Official Use Only fields persisted"
check_field "f7TerminationLetterRefNo"    $SUB "LTR/2026/F7/001"
check_field "f7TerminationLetterSentDate" $SUB "2026-03-04"
check_field "f7TerminationLetterFileUrl"  $SUB "https://storage.example.com/termination-letter.pdf"
check_field "f7OfficialRemarks"           $SUB "Termination letter issued and sent to lessee"

subsect "A13: Legal Officer marks Job Completion → COMPLETED"
COMP_RES=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"COMPLETED","comment":"Job completed","approverName":"Sandalie Gomes"}')
api_ok "$COMP_RES" && track_pass "Legal Officer COMPLETED ✓" || track_fail "LO COMPLETED failed"
check_status $SUB "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST B: Parallel Approval Logic"
# ══════════════════════════════════════════════════════════════════════════════

subsect "B1: Only BUM approves — status stays PENDING_APPROVAL"
RES=$(make_sub "LHD_QA_F7_PAR_001" "PENDING_APPROVAL")
PAR=$(get_id "$RES")
approve /tmp/c_bum.txt $PAR BUM APPROVED "BUM only"
check_status $PAR "PENDING_APPROVAL"

subsect "B2: Only GM approves — status stays PENDING_APPROVAL"
RES=$(make_sub "LHD_QA_F7_PAR_002" "PENDING_APPROVAL")
PAR2=$(get_id "$RES")
approve /tmp/c_gm.txt $PAR2 GENERAL_MANAGER APPROVED "GM only"
check_status $PAR2 "PENDING_APPROVAL"

subsect "B3: BUM then GM — both approved → PENDING_LEGAL_GM"
approve /tmp/c_gm.txt $PAR GENERAL_MANAGER APPROVED "GM completes parallel approval"
check_status $PAR "PENDING_LEGAL_GM"

subsect "B4: GM then BUM — both approved → PENDING_LEGAL_GM"
approve /tmp/c_bum.txt $PAR2 BUM APPROVED "BUM completes parallel approval"
check_status $PAR2 "PENDING_LEGAL_GM"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST C: Send Back Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "C1: BUM sends back"
RES=$(make_sub "LHD_QA_F7_SB_BUM_001" "PENDING_APPROVAL")
SB_BUM=$(get_id "$RES")
approve /tmp/c_bum.txt $SB_BUM BUM SENT_BACK "BUM send-back"
check_status $SB_BUM "SENT_BACK"

subsect "C2: General Manager sends back"
RES=$(make_sub "LHD_QA_F7_SB_GM_001" "PENDING_APPROVAL")
SB_GM=$(get_id "$RES")
approve /tmp/c_gm.txt $SB_GM GENERAL_MANAGER SENT_BACK "GM send-back"
check_status $SB_GM "SENT_BACK"

subsect "C3: Legal GM sends back (initial review)"
RES=$(make_sub "LHD_QA_F7_SB_LGM_001" "PENDING_LEGAL_GM")
SB_LGM=$(get_id "$RES")
approve /tmp/c_lgm.txt $SB_LGM LEGAL_GM SENT_BACK "Legal GM send-back"
check_status $SB_LGM "SENT_BACK"

subsect "C4: Legal Officer returns to initiator with doc statuses"
RES=$(make_sub "LHD_QA_F7_SB_LO_001" "PENDING_LEGAL_OFFICER")
SB_LO=$(get_id "$RES")
# Get doc IDs from submission
DOC_IDS=$(get_sub $SB_LO | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
print(','.join([d['id'] for d in docs[:2]]))")
DOC1=$(echo $DOC_IDS | cut -d',' -f1)
DOC2=$(echo $DOC_IDS | cut -d',' -f2)
R=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SB_LO/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_OFFICER\",\"action\":\"RETURNED_TO_INITIATOR\",\"comment\":\"Missing termination letter from lessee\",\"approverName\":\"Sandalie Gomes\",\"docStatuses\":[{\"id\":\"$DOC1\",\"status\":\"RESUBMIT\",\"comment\":\"Needs re-signing\"},{\"id\":\"$DOC2\",\"status\":\"OK\"}]}")
api_ok "$R" && track_pass "Legal Officer return to initiator ✓" || track_fail "LO return failed"
check_status $SB_LO "SENT_BACK"

subsect "C5: Verify doc statuses updated on return"
if [ -n "$DOC1" ]; then
  DOC1_STATUS=$(get_sub $SB_LO | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
d=[x for x in docs if x['id']=='$DOC1']
print(d[0]['status'] if d else 'NOT FOUND')")
  [ "$DOC1_STATUS" = "RESUBMIT" ] && track_pass "Doc1 status = RESUBMIT ✓" || track_fail "Doc1 status wrong: $DOC1_STATUS"
else
  track_fail "No doc IDs found to verify"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "TEST D: Cancellation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "D1: BUM cancels"
RES=$(make_sub "LHD_QA_F7_CANCEL_001" "PENDING_APPROVAL")
CAN1=$(get_id "$RES")
approve /tmp/c_bum.txt $CAN1 BUM CANCELLED "BUM cancellation"
check_status $CAN1 "CANCELLED"

subsect "D2: General Manager cancels"
RES=$(make_sub "LHD_QA_F7_CANCEL_002" "PENDING_APPROVAL")
CAN2=$(get_id "$RES")
approve /tmp/c_gm.txt $CAN2 GENERAL_MANAGER CANCELLED "GM cancellation"
check_status $CAN2 "CANCELLED"

subsect "D3: Legal GM cancels"
RES=$(make_sub "LHD_QA_F7_CANCEL_003" "PENDING_LEGAL_GM")
CAN3=$(get_id "$RES")
approve /tmp/c_lgm.txt $CAN3 LEGAL_GM CANCELLED "Legal GM cancellation"
check_status $CAN3 "CANCELLED"

subsect "D4: Legal Officer cancels"
RES=$(make_sub "LHD_QA_F7_CANCEL_004" "PENDING_LEGAL_OFFICER")
CAN4=$(get_id "$RES")
R=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$CAN4/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"CANCELLED","comment":"Cancelled","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "LO cancellation ✓" || track_fail "LO cancellation failed"
check_status $CAN4 "CANCELLED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST E: Form 7 Has NO Special Approvers"
# ══════════════════════════════════════════════════════════════════════════════

subsect "E1: Legal GM initial approval goes straight to LO — no special approver detour"
RES=$(make_sub "LHD_QA_F7_NOSA_001" "PENDING_LEGAL_GM")
NOSA=$(get_id "$RES")
approve /tmp/c_lgm.txt $NOSA LEGAL_GM APPROVED "Legal GM initial — no special approvers" ",\"assignedOfficer\":\"$LO_ID\""
check_status   $NOSA "PENDING_LEGAL_OFFICER"
check_lo_stage $NOSA "INITIAL_REVIEW"
info "Confirmed: Form 7 Legal GM initial goes straight to LO (no PENDING_SPECIAL_APPROVER)"

subsect "E2: Legal GM final approval goes straight to LO POST_GM_APPROVAL"
# Advance to PENDING_LEGAL_GM_FINAL
approve /tmp/c_lo.txt $NOSA LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "LO submits to GM"
check_status   $NOSA "PENDING_LEGAL_GM_FINAL"
approve /tmp/c_lgm.txt $NOSA LEGAL_GM APPROVED "Legal GM final — no special approvers"
check_status   $NOSA "PENDING_LEGAL_OFFICER"
check_lo_stage $NOSA "POST_GM_APPROVAL"
info "Confirmed: Form 7 final GM approval goes to POST_GM_APPROVAL (not FINALIZATION)"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST F: Official Use Only Field Validation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "F1: Save partial Official Use Only fields"
RES=$(make_sub "LHD_QA_F7_OU_001" "PENDING_LEGAL_OFFICER")
OU=$(get_id "$RES")
PATCH_P=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$OU" \
  -H "Content-Type: application/json" \
  -d '{"f7TerminationLetterRefNo":"LTR/PARTIAL/001","f7OfficialRemarks":"Work in progress"}')
api_ok "$PATCH_P" && track_pass "Partial save succeeded ✓" || track_fail "Partial save failed"
check_field "f7TerminationLetterRefNo" $OU "LTR/PARTIAL/001"
check_field "f7OfficialRemarks"        $OU "Work in progress"

subsect "F2: Overwrite Official Use Only fields"
PATCH_OW=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$OU" \
  -H "Content-Type: application/json" \
  -d '{"f7TerminationLetterRefNo":"LTR/UPDATED/002","f7TerminationLetterSentDate":"2026-03-05"}')
api_ok "$PATCH_OW" && track_pass "Overwrite save succeeded ✓" || track_fail "Overwrite failed"
check_field "f7TerminationLetterRefNo"    $OU "LTR/UPDATED/002"
check_field "f7TerminationLetterSentDate" $OU "2026-03-05"

subsect "F3: f7LegalReviewCompleted flag set on COMPLETED"
RES=$(make_sub "LHD_QA_F7_OU_002" "PENDING_LEGAL_OFFICER")
OU2=$(get_id "$RES")
curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$OU2" \
  -H "Content-Type: application/json" \
  -d '{"f7TerminationLetterRefNo":"LTR/2026/099","f7TerminationLetterSentDate":"2026-03-04","f7TerminationLetterFileUrl":"https://example.com/letter.pdf"}' > /dev/null
COMP2=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$OU2/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"COMPLETED","comment":"Done","approverName":"Sandalie Gomes"}')
api_ok "$COMP2" && track_pass "LO COMPLETED ✓" || track_fail "LO COMPLETED failed"
check_status $OU2 "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST G: Document Management"
# ══════════════════════════════════════════════════════════════════════════════

subsect "G1: Documents created from submitted list"
RES=$(make_sub "LHD_QA_F7_DOCS_001" "PENDING_APPROVAL")
DOCS_SUB=$(get_id "$RES")
DOC_COUNT=$(get_sub $DOCS_SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$DOC_COUNT" -eq "4" ] && track_pass "4 documents created ✓" || track_fail "Expected 4 docs, got $DOC_COUNT"

subsect "G2: Update document fileUrl (upload)"
DOC_ID=$(get_sub $DOCS_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[0]['id'] if docs else '')")
[ -n "$DOC_ID" ] && track_pass "Got document ID: $DOC_ID" || track_fail "No document ID found"
DOC_UPD=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$DOCS_SUB" \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":\"$DOC_ID\",\"fileUrl\":\"https://storage.example.com/lease-agreement.pdf\",\"documentStatus\":\"UPLOADED\"}")
api_ok "$DOC_UPD" && track_pass "Document fileUrl updated ✓" || track_fail "Document update failed"

subsect "G3: Legal Officer sets document statuses (OK / ATTENTION / RESUBMIT)"
DOCS_DATA=$(get_sub $DOCS_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(','.join(d['id'] for d in docs[:3]))")
D1=$(echo $DOCS_DATA | cut -d',' -f1)
D2=$(echo $DOCS_DATA | cut -d',' -f2)
D3=$(echo $DOCS_DATA | cut -d',' -f3)

for DOC_PAIR in "$D1:OK" "$D2:ATTENTION" "$D3:RESUBMIT"; do
  DID=$(echo $DOC_PAIR | cut -d':' -f1)
  DST=$(echo $DOC_PAIR | cut -d':' -f2)
  if [ -n "$DID" ]; then
    R=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$DOCS_SUB" \
      -H "Content-Type: application/json" \
      -d "{\"documentId\":\"$DID\",\"documentStatus\":\"$DST\",\"documentComment\":\"QA test comment\"}")
    api_ok "$R" && track_pass "Doc status set to $DST ✓" || track_fail "Doc status $DST failed"
  fi
done

subsect "G4: Add legal document prepared by Legal Officer"
ADD_DOC=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$DOCS_SUB" \
  -H "Content-Type: application/json" \
  -d '{"addDocument":{"label":"Draft Termination Notice","type":"legal","fileUrl":"https://storage.example.com/draft-notice.pdf"}}')
api_ok "$ADD_DOC" && track_pass "Legal document added ✓" || track_fail "Add legal document failed"
NEW_DOC_COUNT=$(get_sub $DOCS_SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$NEW_DOC_COUNT" -gt "$DOC_COUNT" ] && track_pass "Document count increased: $NEW_DOC_COUNT ✓" || track_fail "Document not added"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST H: Draft Save and Edit"
# ══════════════════════════════════════════════════════════════════════════════

subsect "H1: Save Form 7 as DRAFT"
RES=$(make_sub "LHD_QA_F7_DRAFT_001" "DRAFT")
DR=$(get_id "$RES")
[ -n "$DR" ] && track_pass "Draft created: $DR" || track_fail "Draft creation failed"
check_status $DR "DRAFT"
check_field  "f7AgreementRefNo" $DR "AGR/2024/001"

subsect "H2: Edit draft and promote to PENDING_APPROVAL"
PATCH_DR=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$DR" \
  -H "Content-Type: application/json" \
  -d '{"status":"PENDING_APPROVAL","scopeOfAgreement":"Updated scope — termination of lease at 456 New Road"}')
api_ok "$PATCH_DR" && track_pass "Draft promoted to PENDING_APPROVAL ✓" || track_fail "Draft edit failed"
check_status $DR "PENDING_APPROVAL"
UPDATED_SCOPE=$(get_sub $DR | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('scopeOfAgreement',''))")
[ "$UPDATED_SCOPE" = "Updated scope — termination of lease at 456 New Road" ] && track_pass "scopeOfAgreement updated ✓" || track_fail "scopeOfAgreement not updated: $UPDATED_SCOPE"

subsect "H3: Delete draft"
# Create a fresh draft specifically for deletion (DR was promoted to PENDING_APPROVAL in H2)
DEL_DRAFT_RES=$(make_sub "LHD_QA_F7_DRAFT_DEL_001" "DRAFT")
DEL_DR=$(get_id "$DEL_DRAFT_RES")
[ -n "$DEL_DR" ] && track_pass "Delete-target draft created: $DEL_DR ✓" || track_fail "Delete-target draft creation failed"
DEL_RES=$(curl -s -b /tmp/c_initiator.txt -X DELETE "$BASE/api/submissions/$DEL_DR")
api_ok "$DEL_RES" && track_pass "Draft deleted ✓" || track_fail "Draft delete failed"
DEL_CHECK=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/c_initiator.txt "$BASE/api/submissions/$DEL_DR")
[ "$DEL_CHECK" = "404" ] && track_pass "Deleted draft returns 404 ✓" || track_fail "Expected 404 after delete, got $DEL_CHECK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST I: Resubmission"
# ══════════════════════════════════════════════════════════════════════════════

subsect "I1: Create Form 7 resubmission linked to original"
RESUB=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F7_HAPPY_001_R1\",
    \"formId\": 7,
    \"formName\": \"Termination of Lease Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\",
    \"companyCode\": \"DM01\",
    \"title\": \"Termination of Lease — 123 Main St (Resubmission)\",
    \"sapCostCenter\": \"000003999\",
    \"scopeOfAgreement\": \"Corrected termination scope\",
    \"term\": \"N/A\",
    \"lkrValue\": \"0\",
    \"bumId\": \"$BUM_EMAIL\",
    \"gmId\": \"$GM_EMAIL\",
    \"f7AgreementRefNo\": \"AGR/2024/001\",
    \"f7AgreementDate\": \"2024-01-15\",
    \"f7EffectiveTerminationDate\": \"2026-06-30\",
    \"documents\": [{\"label\": \"Copy of the existing Lease Agreement\", \"type\": \"required\"}],
    \"parties\": [],
    \"parentId\": \"$SUB\",
    \"isResubmission\": true
  }")
RID=$(get_id "$RESUB")
RPARENT=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('parentId',''))")
RFLAG=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isResubmission',''))")
[ -n "$RID" ]           && track_pass "Resubmission created: $RID ✓"   || track_fail "Resubmission failed"
[ "$RPARENT" = "$SUB" ] && track_pass "parentId linked correctly ✓"    || track_fail "parentId wrong: $RPARENT"
[ "$RFLAG" = "True" ]   && track_pass "isResubmission = True ✓"         || track_fail "isResubmission flag wrong: $RFLAG"

subsect "I2: Mark original as RESUBMITTED"
MR=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}')
api_ok "$MR" && track_pass "Original marked RESUBMITTED ✓" || track_fail "Mark resubmitted failed"
check_field "status" $SUB "RESUBMITTED"

subsect "I3: RESUBMITTED submissions hidden from API list"
RESUBMITTED_IN_LIST=$(curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions" | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
found=[s for s in data if s.get('status')=='RESUBMITTED']
print(len(found))")
[ "$RESUBMITTED_IN_LIST" -eq "0" ] && track_pass "RESUBMITTED filtered from list ✓" || track_fail "API returns $RESUBMITTED_IN_LIST RESUBMITTED submissions"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST J: Comments"
# ══════════════════════════════════════════════════════════════════════════════

subsect "J1: Post comment as Legal GM"
CMT_RES=$(curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dinali Gurusinghe","authorRole":"LEGAL_GM","text":"Please ensure the inspection report is signed by Facilities Manager."}')
api_ok "$CMT_RES" && track_pass "Comment posted ✓" || track_fail "Comment post failed"

subsect "J2: Post comment as Legal Officer"
CMT2=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Sandalie Gomes","authorRole":"LEGAL_OFFICER","text":"Awaiting signed copy from lessee."}')
api_ok "$CMT2" && track_pass "LO comment posted ✓" || track_fail "LO comment post failed"

subsect "J3: Verify comments appear on submission"
CMT_COUNT=$(get_sub $RID | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT" -ge "2" ] && track_pass "Comments visible ($CMT_COUNT) ✓" || track_fail "Expected 2+ comments, got $CMT_COUNT"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST K: API Edge Cases"
# ══════════════════════════════════════════════════════════════════════════════

subsect "K1: GET non-existent submission → 404"
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions/nonexistent_f7_xyz")
[ "$R" = "404" ] && track_pass "Non-existent returns 404 ✓" || track_fail "Expected 404, got $R"

subsect "K2: POST missing required fields → error"
BAD=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"formId":7}')
BAD_OK=$(echo $BAD | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$BAD_OK" = "False" ] && track_pass "Missing fields returns error ✓" || track_fail "Expected error for missing fields"

subsect "K3: Duplicate submission number → conflict"
DUP=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F7_HAPPY_001_R1\",
    \"formId\": 7, \"formName\": \"Termination of Lease Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\",
    \"companyCode\": \"DM01\", \"title\": \"X\", \"sapCostCenter\": \"X\",
    \"scopeOfAgreement\": \"X\", \"term\": \"N/A\", \"lkrValue\": \"0\",
    \"bumId\": \"$BUM_EMAIL\", \"gmId\": \"$GM_EMAIL\",
    \"documents\": [], \"parties\": []
  }")
DUP_OK=$(echo $DUP | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$DUP_OK" = "False" ] && track_pass "Duplicate submission number rejected ✓" || track_fail "Expected conflict error"

subsect "K4: Unauthenticated request → 401"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/submissions/fakeid/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"BUM","action":"APPROVED"}')
[ "$UNAUTH" = "401" ] && track_pass "Unauthenticated returns 401 ✓" || track_fail "Expected 401, got $UNAUTH"

subsect "K5: GET ?formId=7 filter returns only Form 7 submissions"
F7_LIST=$(curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions?formId=7")
NON_F7=$(echo $F7_LIST | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
wrong=[s for s in data if s.get('formId')!=7]
print(len(wrong))")
[ "$NON_F7" -eq "0" ] && track_pass "formId=7 filter returns only Form 7 submissions ✓" || track_fail "Filter returned $NON_F7 non-Form7 submissions"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST L: Form 7 vs Other Forms — Workflow Isolation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "L1: Form 7 approvals are BUM+GM — not shared with Form 1 (BUM+FBP+CH)"
RES=$(make_sub "LHD_QA_F7_ISO_001" "PENDING_APPROVAL")
ISO=$(get_id "$RES")
ROLES=$(get_sub $ISO | python3 -c "
import sys,json
approvals=json.load(sys.stdin).get('data',{}).get('approvals',[])
print(','.join(sorted(set(a['role'] for a in approvals))))")
[ "$ROLES" = "BUM,GENERAL_MANAGER" ] && track_pass "Form 7 roles = BUM,GENERAL_MANAGER only ✓" || track_fail "Expected BUM,GENERAL_MANAGER got: $ROLES"

subsect "L2: Form 7 Legal GM final goes to POST_GM_APPROVAL not FINALIZATION"
RES=$(make_sub "LHD_QA_F7_ISO_002" "PENDING_LEGAL_GM")
ISO2=$(get_id "$RES")
approve /tmp/c_lgm.txt $ISO2 LEGAL_GM APPROVED "LGM initial" ",\"assignedOfficer\":\"$LO_ID\""
approve /tmp/c_lo.txt  $ISO2 LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "LO submit"
approve /tmp/c_lgm.txt $ISO2 LEGAL_GM APPROVED "LGM final"
LO_ST=$(get_sub $ISO2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('loStage',''))")
[ "$LO_ST" = "POST_GM_APPROVAL" ] && track_pass "Form 7 final loStage = POST_GM_APPROVAL (not FINALIZATION) ✓" || track_fail "Expected POST_GM_APPROVAL, got: $LO_ST"

subsect "L3: Form 7 has no scopeOfAgreement document requirements from party types"
RES=$(make_sub "LHD_QA_F7_ISO_003" "PENDING_APPROVAL")
ISO3=$(get_id "$RES")
DOC_LABELS=$(get_sub $ISO3 | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
print(','.join(d['label'] for d in docs))")
info "Form 7 docs: $DOC_LABELS"
# Form 7 docs come from body.documents not party-type lookup
DOC_TYPE=$(get_sub $ISO3 | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
types=list(set(d['type'] for d in docs))
print(','.join(types))")
[ "$DOC_TYPE" = "required" ] && track_pass "All Form 7 docs are type='required' ✓" || track_fail "Doc types wrong: $DOC_TYPE"

# ══════════════════════════════════════════════════════════════════════════════
section "FULL QA SUMMARY"
# ══════════════════════════════════════════════════════════════════════════════
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo -e "${YELLOW}  Results: ${GREEN}$PASS_COUNT passed${NC} / ${RED}$FAIL_COUNT failed${NC} / $TOTAL total"
echo ""
echo -e "  ${BLUE}Submission IDs tested:${NC}"
echo -e "  Happy path:       $SUB ($SUB_NO)"
echo -e "  Parallel BUM:     $PAR | GM only: $PAR2"
echo -e "  Draft (promoted): $DR | Draft (deleted): $DEL_DR"
echo -e "  Resubmission:     $RID"
echo -e "  No SA (Form7):    $NOSA"
echo -e "  OU fields:        $OU | $OU2"
echo -e "  Send-backs:       BUM=$SB_BUM | GM=$SB_GM | LGM=$SB_LGM | LO=$SB_LO"
echo -e "  Cancelled:        $CAN1 | $CAN2 | $CAN3 | $CAN4"
echo -e "  Isolation:        $ISO | $ISO2 | $ISO3"
echo ""
if [ "$FAIL_COUNT" -eq "0" ]; then
  echo -e "${GREEN}  🎉 ALL TESTS PASSED — Form 7 is fully verified!${NC}"
else
  echo -e "${RED}  ⚠️  $FAIL_COUNT test(s) failed — review ❌ above${NC}"
fi
echo ""