#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# Form 1 Full QA Test Suite — Contract Review Form
# USAGE: bash tests/test_form1_full_qa.sh
# Run from project root. Dev server must be running: npm run dev
# ══════════════════════════════════════════════════════════════════════════════

BASE="http://localhost:3000"

if ! curl -s --max-time 3 "$BASE/api/auth/csrf" > /dev/null 2>&1; then
  echo -e "\033[0;31m❌ Dev server is not running. Start it with: npm run dev\033[0m"
  exit 1
fi

echo -e "\033[1;33m🧹 Cleaning up previous QA test data...\033[0m"
npx prisma db execute --stdin <<'SQL' 2>/dev/null
DELETE FROM "submission_parties"           WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F1_%');
DELETE FROM "submission_approvals"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F1_%');
DELETE FROM "submission_documents"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F1_%');
DELETE FROM "submission_comments"          WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F1_%');
DELETE FROM "submission_special_approvers" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F1_%');
DELETE FROM "submissions"                  WHERE "submissionNo" LIKE 'LHD_QA_F1_%';
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

# ─── Helpers ───────────────────────────────────────────────────────────────────
get_sub() { curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions/$1"; }

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
  ACTUAL=$(get_sub $2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1',''))" 2>/dev/null)
  [ "$ACTUAL" = "$3" ] && track_pass "$1 = '$ACTUAL' ✓" || track_fail "$1: expected '$3', got '$ACTUAL'"
}
api_ok() {
  echo $1 | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null
  return $?
}
approve() {
  local COOKIE=$1 SUB=$2 ROLE=$3 ACTION=$4 LABEL=$5
  R=$(curl -s -b $COOKIE -X POST "$BASE/api/submissions/$SUB/approve" \
    -H "Content-Type: application/json" \
    -d "{\"role\":\"$ROLE\",\"action\":\"$ACTION\",\"comment\":\"Test comment\",\"approverName\":\"Test $ROLE\"}")
  api_ok "$R" && track_pass "$LABEL ✓" || { track_fail "$LABEL failed"; echo "    Response: $(echo $R | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("error","unknown"))')"; }
}

# ─── Submission factory ─────────────────────────────────────────────────────────
make_sub() {
  local NO=$1 STATUS=$2 PARTY_TYPE=${3:-"Company"}
  curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
    -H "Content-Type: application/json" \
    -d "{
      \"submissionNo\": \"$NO\",
      \"formId\": 1,
      \"formName\": \"Contract Review Form\",
      \"status\": \"$STATUS\",
      \"initiatorId\": \"$INITIATOR_ID\",
      \"initiatorName\": \"Test Initiator\",
      \"companyCode\": \"DM01\",
      \"title\": \"Contract Review Form\",
      \"sapCostCenter\": \"000003999\",
      \"scopeOfAgreement\": \"Supply of IT equipment and maintenance services for 2 years\",
      \"term\": \"2026-03-01 to 2028-03-01\",
      \"lkrValue\": \"500000\",
      \"remarks\": \"Test Form 1 submission\",
      \"initiatorComments\": \"\",
      \"legalOfficerId\": \"\",
      \"bumId\": \"$BUM_ID\",
      \"fbpId\": \"$FBP_ID\",
      \"clusterHeadId\": \"$CH_ID\",
      \"parties\": [{\"type\": \"$PARTY_TYPE\", \"name\": \"Test Company Ltd\"}]
    }"
}
get_id() { echo $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))"; }

# ══════════════════════════════════════════════════════════════════════════════
section "STEP 0: Environment Setup"
# ══════════════════════════════════════════════════════════════════════════════

# Pre-login required — /api/users is auth-gated
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
FBP_ID=$(uid "madurika.sama@testdimo.com")
CH_ID=$(uid "mangala.wick@testdimo.com")
LO_ID=$(uid "sandalie.gomes@testdimo.com")
SA_ID=$(uid "special.approver@testdimo.com")

[ -n "$INITIATOR_ID" ] && track_pass "Initiator ID: $INITIATOR_ID" || { track_fail "Initiator not found"; exit 1; }
[ -n "$BUM_ID" ]       && track_pass "BUM ID: $BUM_ID"             || { track_fail "BUM not found"; exit 1; }
[ -n "$FBP_ID" ]       && track_pass "FBP ID: $FBP_ID"             || { track_fail "FBP not found"; exit 1; }
[ -n "$CH_ID" ]        && track_pass "CH ID: $CH_ID"               || { track_fail "Cluster Head not found"; exit 1; }
[ -n "$LO_ID" ]        && track_pass "LO ID: $LO_ID"               || { track_fail "Legal Officer not found"; exit 1; }
[ -n "$SA_ID" ]        && track_pass "SA ID: $SA_ID"               || { track_fail "Special Approver not found (non-fatal)"; }

subsect "Login all roles"
login "oliva.perera@testdimo.com"    /tmp/c_initiator.txt
login "grace.perera@testdimo.com"    /tmp/c_bum.txt
login "madurika.sama@testdimo.com"   /tmp/c_fbp.txt
login "mangala.wick@testdimo.com"    /tmp/c_ch.txt
login "dinali.guru@testdimo.com"     /tmp/c_lgm.txt
login "sandalie.gomes@testdimo.com"  /tmp/c_lo.txt
login "special.approver@testdimo.com" /tmp/c_sa.txt

# ══════════════════════════════════════════════════════════════════════════════
section "TEST A: Full Happy Path — End to End"
# ══════════════════════════════════════════════════════════════════════════════

subsect "A1: Initiator creates submission"
RES=$(make_sub "LHD_QA_F1_HAPPY_001" "PENDING_APPROVAL")
SUB=$(get_id "$RES")
SUB_NO=$(echo $RES | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('submissionNo','') or d.get('data',{}).get('submissionNo',''))")
[ -n "$SUB" ] && track_pass "Submission created — No: $SUB_NO | ID: $SUB" || { track_fail "Submission creation failed: $RES"; exit 1; }

subsect "A2: Verify initial field values"
SUB_DATA=$(get_sub $SUB)
chk() {
  V=$(echo $SUB_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1',''))" 2>/dev/null)
  [ "$V" = "$2" ] && track_pass "$1 = '$V' ✓" || track_fail "$1: expected '$2', got '$V'"
}
chk "formId"       "1"
chk "formName"     "Contract Review Form"
chk "status"       "PENDING_APPROVAL"
chk "loStage"      "PENDING_GM"
chk "legalGmStage" "INITIAL_REVIEW"

APPROVALS=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
# Form 1: BUM + FBP + CLUSTER_HEAD = 3 (no CEO)
[ "$APPROVALS" -eq "3" ] && track_pass "3 parallel approvals created (BUM+FBP+CH) ✓" || track_fail "Expected 3 approvals, got $APPROVALS"

DOCS=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$DOCS" -gt "0" ] && track_pass "Documents auto-created: $DOCS docs ✓" || track_fail "No documents created"

# Verify NO CEO approval for Form 1
CEO_APPROVAL=$(echo $SUB_DATA | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); ceo=[a for a in approvals if a.get('role')=='CEO']; print(len(ceo))")
[ "$CEO_APPROVAL" -eq "0" ] && track_pass "No CEO approval row (Form 1 has no CEO step) ✓" || track_fail "Form 1 should NOT have CEO approval, found $CEO_APPROVAL"

subsect "A3: BUM approves"
approve /tmp/c_bum.txt $SUB BUM APPROVED "BUM approval"

subsect "A4: FBP approves"
approve /tmp/c_fbp.txt $SUB FBP APPROVED "FBP approval"

subsect "A5: Cluster Head approves — expect PENDING_LEGAL_GM (no CEO step)"
approve /tmp/c_ch.txt $SUB CLUSTER_HEAD APPROVED "Cluster Head approval"
check_status $SUB "PENDING_LEGAL_GM"

subsect "A6: Legal GM assigns officer + initial approval — expect PENDING_LEGAL_OFFICER"
PATCH_R=$(curl -s -b /tmp/c_lgm.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d "{\"assignedLegalOfficer\": \"$LO_ID\"}")
api_ok "$PATCH_R" && track_pass "Legal GM assigned officer ✓" || track_fail "Officer assignment failed"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM initial approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "INITIAL_REVIEW"
check_gm_stage $SUB "INITIAL_REVIEW"

subsect "A7: Legal Officer submits to GM — expect PENDING_LEGAL_GM_FINAL"
approve /tmp/c_lo.txt $SUB LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "Legal Officer submit to GM"
check_status   $SUB "PENDING_LEGAL_GM_FINAL"
check_gm_stage $SUB "FINAL_APPROVAL"

subsect "A8: Legal GM final approval — expect PENDING_LEGAL_OFFICER + FINALIZATION"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM final approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "FINALIZATION"

subsect "A9: Legal Officer marks COMPLETED"
COMP_RES=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"COMPLETED","comment":"All done","approverName":"Sandalie Gomes"}')
api_ok "$COMP_RES" && track_pass "Legal Officer COMPLETED ✓" || track_fail "LO COMPLETED failed"
check_status $SUB "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST B: Draft Save & Edit"
# ══════════════════════════════════════════════════════════════════════════════

subsect "B1: Save as DRAFT"
RES=$(make_sub "LHD_QA_F1_DRAFT_001" "DRAFT")
DR=$(get_id "$RES")
[ -n "$DR" ] && track_pass "Draft created: $DR" || track_fail "Draft creation failed"
check_status $DR "DRAFT"

subsect "B2: Edit draft — update scope and promote to PENDING_APPROVAL"
PATCH_RES=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$DR" \
  -H "Content-Type: application/json" \
  -d '{"status":"PENDING_APPROVAL","scopeOfAgreement":"Updated scope of contract for IT procurement"}')
api_ok "$PATCH_RES" && track_pass "Draft PATCH succeeded ✓" || track_fail "Draft edit failed"
check_status $DR "PENDING_APPROVAL"

subsect "B3: Verify updated scope saved"
UPDATED=$(get_sub $DR | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('scopeOfAgreement',''))")
[ "$UPDATED" = "Updated scope of contract for IT procurement" ] && track_pass "scopeOfAgreement updated ✓" || track_fail "scopeOfAgreement not updated: $UPDATED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST C: Send Back Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "C1: BUM sends back"
RES=$(make_sub "LHD_QA_F1_SB_BUM_001" "PENDING_APPROVAL")
SB_BUM=$(get_id "$RES")
approve /tmp/c_bum.txt $SB_BUM BUM SENT_BACK "BUM send-back"
check_status $SB_BUM "SENT_BACK"

subsect "C2: FBP sends back"
RES=$(make_sub "LHD_QA_F1_SB_FBP_001" "PENDING_APPROVAL")
SB_FBP=$(get_id "$RES")
approve /tmp/c_fbp.txt $SB_FBP FBP SENT_BACK "FBP send-back"
check_status $SB_FBP "SENT_BACK"

subsect "C3: Cluster Head sends back"
RES=$(make_sub "LHD_QA_F1_SB_CH_001" "PENDING_APPROVAL")
SB_CH=$(get_id "$RES")
approve /tmp/c_ch.txt $SB_CH CLUSTER_HEAD SENT_BACK "Cluster Head send-back"
check_status $SB_CH "SENT_BACK"

subsect "C4: Legal GM sends back (initial review)"
RES=$(make_sub "LHD_QA_F1_SB_LGM_001" "PENDING_LEGAL_GM")
SB_LGM=$(get_id "$RES")
approve /tmp/c_lgm.txt $SB_LGM LEGAL_GM SENT_BACK "Legal GM send-back"
check_status $SB_LGM "SENT_BACK"

subsect "C5: Legal Officer returns to initiator"
RES=$(make_sub "LHD_QA_F1_SB_LO_001" "PENDING_LEGAL_OFFICER")
SB_LO=$(get_id "$RES")
R=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SB_LO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"RETURNED_TO_INITIATOR","comment":"Missing documents","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "Legal Officer return to initiator ✓" || track_fail "LO return failed"
check_status $SB_LO "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST D: Parallel Approval Logic"
# ══════════════════════════════════════════════════════════════════════════════

subsect "D1: Only BUM approves — stays PENDING_APPROVAL"
RES=$(make_sub "LHD_QA_F1_PAR_001" "PENDING_APPROVAL")
PAR=$(get_id "$RES")
approve /tmp/c_bum.txt $PAR BUM APPROVED "BUM only approval"
check_status $PAR "PENDING_APPROVAL"

subsect "D2: FBP also approves — still PENDING_APPROVAL"
approve /tmp/c_fbp.txt $PAR FBP APPROVED "FBP approval (2 of 3)"
check_status $PAR "PENDING_APPROVAL"

subsect "D3: Cluster Head approves — moves to PENDING_LEGAL_GM (not PENDING_CEO)"
approve /tmp/c_ch.txt $PAR CLUSTER_HEAD APPROVED "CH approval — triggers transition"
check_status $PAR "PENDING_LEGAL_GM"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST E: Cancellation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "E1: BUM cancels"
RES=$(make_sub "LHD_QA_F1_CANCEL_001" "PENDING_APPROVAL")
CAN=$(get_id "$RES")
approve /tmp/c_bum.txt $CAN BUM CANCELLED "BUM cancellation"
check_status $CAN "CANCELLED"

subsect "E2: Legal GM cancels"
RES=$(make_sub "LHD_QA_F1_CANCEL_002" "PENDING_LEGAL_GM")
CAN2=$(get_id "$RES")
approve /tmp/c_lgm.txt $CAN2 LEGAL_GM CANCELLED "Legal GM cancellation"
check_status $CAN2 "CANCELLED"

subsect "E3: Legal Officer cancels"
RES=$(make_sub "LHD_QA_F1_CANCEL_003" "PENDING_LEGAL_OFFICER")
CAN3=$(get_id "$RES")
R=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$CAN3/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"CANCELLED","comment":"Cancelled by LO","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "LO cancellation ✓" || track_fail "LO cancellation failed"
check_status $CAN3 "CANCELLED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST F: Special Approver Flow"
# ══════════════════════════════════════════════════════════════════════════════

subsect "F1: Legal GM assigns Special Approver during initial review"
RES=$(make_sub "LHD_QA_F1_SA_001" "PENDING_LEGAL_GM")
SA_SUB=$(get_id "$RES")
SA_RES=$(curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$SA_SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"specialApprovers\":[{\"email\":\"special.approver@testdimo.com\",\"name\":\"Special Approver\",\"dept\":\"Legal\"}],\"assignedOfficer\":\"$LO_ID\"}")
api_ok "$SA_RES" && track_pass "Legal GM assigned special approver ✓" || track_fail "Special approver assignment failed"
check_status $SA_SUB "PENDING_SPECIAL_APPROVER"

subsect "F2: Special Approver approves — routes to Legal Officer"
SA_APPROVE=$(curl -s -b /tmp/c_sa.txt -X POST "$BASE/api/submissions/$SA_SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_APPROVE" && track_pass "Special Approver approved ✓" || track_fail "Special Approver approval failed"
check_status   $SA_SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SA_SUB "INITIAL_REVIEW"

subsect "F3: Legal Officer assigns Special Approver"
RES=$(make_sub "LHD_QA_F1_SA_LO_001" "PENDING_LEGAL_OFFICER")
SA_LO_SUB=$(get_id "$RES")
SA_LO_RES=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SA_LO_SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"ASSIGN_SPECIAL_APPROVER","specialApproverEmail":"special.approver@testdimo.com","specialApproverName":"Special Approver"}')
api_ok "$SA_LO_RES" && track_pass "Legal Officer assigned special approver ✓" || track_fail "LO special approver assignment failed"
check_status $SA_LO_SUB "PENDING_SPECIAL_APPROVER"

subsect "F4: Special Approver approves — routes back to Legal Officer (REVIEW_FOR_GM)"
SA_LO_APP=$(curl -s -b /tmp/c_sa.txt -X POST "$BASE/api/submissions/$SA_LO_SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_LO_APP" && track_pass "Special Approver approved (LO path) ✓" || track_fail "Special Approver approval failed"
check_status   $SA_LO_SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SA_LO_SUB "REVIEW_FOR_GM"

subsect "F5: Special Approver sends back"
RES=$(make_sub "LHD_QA_F1_SA_SB_001" "PENDING_SPECIAL_APPROVER")
SA_SB=$(get_id "$RES")
# Manually create special approver record first
curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$SA_SB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_GM","action":"APPROVED","specialApprovers":[{"email":"special.approver@testdimo.com","name":"Special Approver","dept":"Legal"}]}' > /dev/null
SA_SB_RES=$(curl -s -b /tmp/c_sa.txt -X POST "$BASE/api/submissions/$SA_SB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"SENT_BACK","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_SB_RES" && track_pass "Special Approver sent back ✓" || track_fail "SA send-back failed"
check_status $SA_SB "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST G: Document Verification — Form 1"
# ══════════════════════════════════════════════════════════════════════════════

subsect "G1: Company party type — gets company-specific docs"
RES=$(make_sub "LHD_QA_F1_DOCS_CO_001" "PENDING_APPROVAL" "Company")
DOCS_SUB=$(get_id "$RES")
DOC_LABELS=$(get_sub $DOCS_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print('\n'.join(d['label'] for d in docs))")
DOC_COUNT=$(get_sub $DOCS_SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
info "Form 1 Company doc count: $DOC_COUNT"
[ "$DOC_COUNT" -gt "0" ] && track_pass "Documents created: $DOC_COUNT ✓" || track_fail "No documents created"

subsect "G2: Update document status"
DOC_ID=$(get_sub $DOCS_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[0]['id'] if docs else '')")
[ -n "$DOC_ID" ] && track_pass "Got document ID: $DOC_ID" || track_fail "No document ID"
DOC_UPD=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$DOCS_SUB" \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":\"$DOC_ID\",\"documentStatus\":\"APPROVED\",\"documentComment\":\"Looks good\"}")
api_ok "$DOC_UPD" && track_pass "Document status updated ✓" || track_fail "Document update failed"
DOC_STATUS=$(get_sub $DOCS_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
d=[x for x in docs if x['id']=='$DOC_ID']
print(d[0]['status'] if d else 'NOT FOUND')
")
[ "$DOC_STATUS" = "APPROVED" ] && track_pass "Document status = APPROVED ✓" || track_fail "Document status wrong: $DOC_STATUS"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST H: Resubmission"
# ══════════════════════════════════════════════════════════════════════════════

subsect "H1: Create resubmission linked to original"
RESUB=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F1_HAPPY_001_R1\",
    \"formId\": 1, \"formName\": \"Contract Review Form\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"DM01\", \"title\": \"Contract Review Form\",
    \"sapCostCenter\": \"000003999\",
    \"scopeOfAgreement\": \"Corrected scope for IT services\",
    \"term\": \"2026-03-01 to 2028-03-01\", \"lkrValue\": \"550000\",
    \"remarks\": \"Resubmission\", \"initiatorComments\": \"\",
    \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": [{\"type\": \"Company\", \"name\": \"Test Company Ltd\"}],
    \"parentId\": \"$SUB\", \"isResubmission\": true
  }")
RID=$(get_id "$RESUB")
RPARENT=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('parentId',''))")
RFLAG=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isResubmission',''))")
[ -n "$RID" ]           && track_pass "Resubmission created: $RID ✓" || track_fail "Resubmission failed"
[ "$RPARENT" = "$SUB" ] && track_pass "parentId linked correctly ✓"  || track_fail "parentId wrong: $RPARENT"
[ "$RFLAG" = "True" ]   && track_pass "isResubmission = True ✓"       || track_fail "isResubmission flag wrong: $RFLAG"

subsect "H2: Mark original as RESUBMITTED"
MR=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}')
api_ok "$MR" && track_pass "Original marked RESUBMITTED ✓" || track_fail "Mark resubmitted failed"
check_field "status" $SUB "RESUBMITTED"

subsect "H3: RESUBMITTED submissions hidden from API list"
RESUBMITTED_IN_LIST=$(curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions" | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
found=[s for s in data if s.get('status')=='RESUBMITTED']
print(len(found))")
[ "$RESUBMITTED_IN_LIST" -eq "0" ] && track_pass "RESUBMITTED submissions filtered from list ✓" || track_fail "API returns $RESUBMITTED_IN_LIST RESUBMITTED submissions"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST I: Comments"
# ══════════════════════════════════════════════════════════════════════════════

subsect "I1: Post a comment"
CMT_RES=$(curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dinali Gurusinghe","authorRole":"LEGAL_GM","text":"Please verify all party documents before proceeding."}')
api_ok "$CMT_RES" && track_pass "Comment posted ✓" || track_fail "Comment post failed"

subsect "I2: Verify comment appears"
CMT_COUNT=$(get_sub $RID | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT" -gt "0" ] && track_pass "Comment visible ($CMT_COUNT) ✓" || track_fail "No comments found"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST J: API Edge Cases"
# ══════════════════════════════════════════════════════════════════════════════

subsect "J1: GET non-existent submission → 404"
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions/nonexistent_xyz_001")
[ "$R" = "404" ] && track_pass "Non-existent returns 404 ✓" || track_fail "Expected 404, got $R"

subsect "J2: POST missing required fields → error"
BAD=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"formId":1}')
BAD_OK=$(echo $BAD | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$BAD_OK" = "False" ] && track_pass "Missing fields returns error ✓" || track_fail "Expected error for missing fields"

subsect "J3: Duplicate submission number → conflict"
DUP=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F1_HAPPY_001\",
    \"formId\": 1, \"formName\": \"Contract Review Form\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test\",
    \"companyCode\": \"DM01\", \"title\": \"X\", \"sapCostCenter\": \"X\",
    \"scopeOfAgreement\": \"X\", \"term\": \"\", \"lkrValue\": \"\",
    \"remarks\": \"\", \"initiatorComments\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": []
  }")
DUP_OK=$(echo $DUP | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$DUP_OK" = "False" ] && track_pass "Duplicate submission number rejected ✓" || track_fail "Expected conflict error for duplicate"

subsect "J4: Unauthenticated request → 401"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"BUM","action":"APPROVED"}')
[ "$UNAUTH" = "401" ] && track_pass "Unauthenticated approve returns 401 ✓" || track_fail "Expected 401, got $UNAUTH"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST K: Form 1 vs Form 2 Workflow Isolation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "K1: Form 1 does NOT route through CEO after CH approval"
RES=$(make_sub "LHD_QA_F1_NOCEO_001" "PENDING_APPROVAL")
NOCEO=$(get_id "$RES")
approve /tmp/c_bum.txt $NOCEO BUM APPROVED "BUM"
approve /tmp/c_fbp.txt $NOCEO FBP APPROVED "FBP"
approve /tmp/c_ch.txt  $NOCEO CLUSTER_HEAD APPROVED "CH"
STATUS=$(get_sub $NOCEO | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('status',''))")
[ "$STATUS" = "PENDING_LEGAL_GM" ] && track_pass "Form 1 skips CEO → goes straight to PENDING_LEGAL_GM ✓" || track_fail "Expected PENDING_LEGAL_GM, got $STATUS"

subsect "K2: Form 1 loStage starts as PENDING_GM (not PENDING_CEO like Form 2)"
INIT_LO=$(echo $(get_sub $NOCEO) | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('loStage',''))")
[ "$INIT_LO" != "PENDING_CEO" ] && track_pass "Form 1 loStage is not PENDING_CEO ✓ (got: $INIT_LO)" || track_fail "Form 1 loStage should not be PENDING_CEO"

# ══════════════════════════════════════════════════════════════════════════════
section "FULL QA SUMMARY"
# ══════════════════════════════════════════════════════════════════════════════
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo -e "${YELLOW}  Results: ${GREEN}$PASS_COUNT passed${NC} / ${RED}$FAIL_COUNT failed${NC} / $TOTAL total"
echo ""
echo -e "  ${BLUE}Submission IDs tested:${NC}"
echo -e "  Happy path:    $SUB ($SUB_NO)"
echo -e "  Draft:         $DR"
echo -e "  Parallel:      $PAR"
echo -e "  Resubmission:  $RID"
echo -e "  Spec Approver: $SA_SUB | LO path: $SA_LO_SUB"
echo -e "  Send-backs:    BUM=$SB_BUM | FBP=$SB_FBP | CH=$SB_CH | LGM=$SB_LGM | LO=$SB_LO"
echo -e "  Cancelled:     $CAN | $CAN2 | $CAN3"
echo ""
if [ "$FAIL_COUNT" -eq "0" ]; then
  echo -e "${GREEN}  🎉 ALL TESTS PASSED — Form 1 is fully verified!${NC}"
else
  echo -e "${RED}  ⚠️  $FAIL_COUNT test(s) failed — review ❌ above${NC}"
fi
echo ""