#!/bin/bash

#bash tests/form2-qa/test_form2_full_qa.sh  
#Paste above in the terminal 

# ══════════════════════════════════════════════════════════════════════════════
# Form 2 Full QA Test Suite
#
# HOW TO RUN:
#   From the project root (dimo-legal-helpdesk/), run:
#     bash tests/form2-qa/test_form2_full_qa.sh
#
# PREREQUISITES:
#   - Dev server must be running:  npm run dev
#   - Run from project root directory
#
# TO CLEAN UP TEST DATA BEFORE RUNNING:
#   npx prisma db execute --stdin <<'SQL'
#   DELETE FROM "submission_parties" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_%');
#   DELETE FROM "submission_approvals" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_%');
#   DELETE FROM "submission_documents" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_%');
#   DELETE FROM "submission_comments" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_%');
#   DELETE FROM "submission_special_approvers" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_%');
#   DELETE FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_%';
#   SQL
# ══════════════════════════════════════════════════════════════════════════════

BASE="http://localhost:3000"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
pass()    { echo -e "${GREEN}✅ $1${NC}"; }
fail()    { echo -e "${RED}❌ $1${NC}"; }
info()    { echo -e "${BLUE}ℹ️  $1${NC}"; }
section() { echo -e "\n${YELLOW}══════════════════════════════════════${NC}"; echo -e "${YELLOW}  $1${NC}"; echo -e "${YELLOW}══════════════════════════════════════${NC}"; }
subsect() { echo -e "\n${CYAN}  ── $1 ──${NC}"; }

PASS_COUNT=0
FAIL_COUNT=0
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

# ─── Assertion helpers ──────────────────────────────────────────────────────────
get_sub() {
  curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions/$1"
}
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

# ─── Approve helper ─────────────────────────────────────────────────────────────
approve() {
  local COOKIE=$1 SUB=$2 ROLE=$3 ACTION=$4 LABEL=$5
  R=$(curl -s -b $COOKIE -X POST "$BASE/api/submissions/$SUB/approve" \
    -H "Content-Type: application/json" \
    -d "{\"role\":\"$ROLE\",\"action\":\"$ACTION\",\"comment\":\"Test comment\",\"approverName\":\"Test $ROLE\"}")
  api_ok "$R" && track_pass "$LABEL ✓" || { track_fail "$LABEL failed"; echo "    Response: $(echo $R | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("error","unknown"))')"; }
}

# ─── Submission factory ─────────────────────────────────────────────────────────
make_sub() {
  local NO=$1 STATUS=$2
  curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
    -H "Content-Type: application/json" \
    -d "{
      \"submissionNo\": \"$NO\",
      \"formId\": 2,
      \"formName\": \"Lease Agreement\",
      \"status\": \"$STATUS\",
      \"initiatorId\": \"$INITIATOR_ID\",
      \"initiatorName\": \"Test Initiator\",
      \"companyCode\": \"000003999\",
      \"title\": \"Lease Agreement\",
      \"sapCostCenter\": \"000003999\",
      \"scopeOfAgreement\": \"{\\\"contactPerson\\\":\\\"Test Initiator\\\",\\\"contactNo\\\":\\\"+94771234567\\\",\\\"deptSapCode\\\":\\\"000003999\\\",\\\"purposeOfLease\\\":\\\"Office space for IT dept\\\",\\\"lessorParties\\\":[{\\\"type\\\":\\\"Individual\\\",\\\"name\\\":\\\"John Silva\\\"}],\\\"nicNo\\\":\\\"901234567V\\\",\\\"vatRegNo\\\":\\\"\\\",\\\"lessorContact\\\":\\\"+94711234567\\\",\\\"leaseName\\\":\\\"John Silva Lease\\\",\\\"premisesAssetNo\\\":\\\"AST001\\\",\\\"periodOfLease\\\":\\\"2 years\\\",\\\"assetHouse\\\":false,\\\"assetLand\\\":false,\\\"assetBuilding\\\":true,\\\"assetExtent\\\":\\\"2000 sqft\\\",\\\"commencingFrom\\\":\\\"2026-03-01\\\",\\\"endingOn\\\":\\\"2028-03-01\\\",\\\"monthlyRental\\\":\\\"150000\\\",\\\"advancePayment\\\":\\\"300000\\\",\\\"deductibleRate\\\":\\\"10\\\",\\\"deductiblePeriod\\\":\\\"2 months\\\",\\\"refundableDeposit\\\":\\\"150000\\\",\\\"electricityWaterPhone\\\":\\\"Tenant\\\",\\\"previousAgreementNo\\\":\\\"\\\",\\\"dateOfPrincipalAgreement\\\":\\\"\\\",\\\"buildingsConstructed\\\":\\\"None\\\",\\\"intendToConstruct\\\":\\\"None\\\",\\\"remarks\\\":\\\"Test submission\\\"}\",
      \"term\": \"2026-03-01 to 2028-03-01\",
      \"lkrValue\": \"150000\",
      \"remarks\": \"Test submission\",
      \"initiatorComments\": \"\",
      \"legalOfficerId\": \"\",
      \"bumId\": \"$BUM_ID\",
      \"fbpId\": \"$FBP_ID\",
      \"clusterHeadId\": \"$CH_ID\",
      \"parties\": [{\"type\": \"Individual\", \"name\": \"John Silva\"}]
    }"
}

get_id() {
  echo $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))"
}

# ══════════════════════════════════════════════════════════════════════════════
section "STEP 0: Environment Setup — Fetch User IDs & Login All Roles"
# ══════════════════════════════════════════════════════════════════════════════
USERS=$(curl -s $BASE/api/users)
uid() { echo $USERS | python3 -c "import sys,json; u=[x for x in json.load(sys.stdin).get('data',[]) if x.get('email')=='$1']; print(u[0]['id'] if u else '')"; }

INITIATOR_ID=$(uid "initiator@testdimo.com")
BUM_ID=$(uid "grace.perera@testdimo.com")
FBP_ID=$(uid "fbp@testdimo.com")
CH_ID=$(uid "cluster.head@testdimo.com")
LO_ID=$(uid "sandalie.gomes@testdimo.com")

[ -n "$INITIATOR_ID" ] && track_pass "Initiator ID: $INITIATOR_ID" || { track_fail "Initiator not found"; exit 1; }
[ -n "$BUM_ID" ]       && track_pass "BUM ID:       $BUM_ID"       || { track_fail "BUM not found"; exit 1; }
[ -n "$FBP_ID" ]       && track_pass "FBP ID:       $FBP_ID"       || { track_fail "FBP not found"; exit 1; }
[ -n "$CH_ID" ]        && track_pass "CH ID:        $CH_ID"        || { track_fail "Cluster Head not found"; exit 1; }
[ -n "$LO_ID" ]        && track_pass "LO ID:        $LO_ID"        || { track_fail "Legal Officer not found"; exit 1; }

subsect "Logging in all roles"
login "initiator@testdimo.com"      /tmp/c_initiator.txt
login "grace.perera@testdimo.com"   /tmp/c_bum.txt
login "fbp@testdimo.com"            /tmp/c_fbp.txt
login "cluster.head@testdimo.com"   /tmp/c_ch.txt
login "ceo@testdimo.com"            /tmp/c_ceo.txt
login "legal.gm@testdimo.com"       /tmp/c_lgm.txt
login "sandalie.gomes@testdimo.com" /tmp/c_lo.txt

# ══════════════════════════════════════════════════════════════════════════════
section "TEST A: Full Happy Path — End to End"
# ══════════════════════════════════════════════════════════════════════════════

subsect "A1: Initiator creates submission"
RES=$(make_sub "LHD_QA_F2_HAPPY_001" "PENDING_APPROVAL")
SUB=$(get_id "$RES")
SUB_NO=$(echo $RES | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('submissionNo','') or d.get('data',{}).get('submissionNo',''))")
[ -n "$SUB" ] && track_pass "Submission created — No: $SUB_NO | ID: $SUB" || { track_fail "Submission creation failed: $RES"; exit 1; }

subsect "A2: Verify initial field values"
SUB_DATA=$(get_sub $SUB)
chk_init() {
  V=$(echo $SUB_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1',''))" 2>/dev/null)
  [ "$V" = "$2" ] && track_pass "$1 = '$V' ✓" || track_fail "$1: expected '$2', got '$V'"
}
chk_init "formId"        "2"
chk_init "formName"      "Lease Agreement"
chk_init "status"        "PENDING_APPROVAL"
chk_init "loStage"       "PENDING_GM"
chk_init "legalGmStage"  "INITIAL_REVIEW"

DOCS=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
APPROVALS=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
[ "$APPROVALS" -eq "3" ] && track_pass "3 parallel approvals created (BUM+FBP+CH) ✓" || track_fail "Expected 3 approvals, got $APPROVALS"
[ "$DOCS" -gt "0" ]      && track_pass "Documents auto-created: $DOCS docs ✓"         || track_fail "No documents created"

subsect "A3: Verify scopeOfAgreement fields"
SCOPE=$(echo $SUB_DATA | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('scopeOfAgreement','{}'))")
chk_scope() {
  V=$(echo $SCOPE | python3 -c "import sys,json; s=json.loads(sys.stdin.read()); print(s.get('$1','MISSING'))" 2>/dev/null)
  [ "$V" != "MISSING" ] && [ -n "$V" ] && track_pass "scope.$1 = '$V' ✓" || track_fail "scope.$1 missing or empty"
}
chk_scope "contactPerson"
chk_scope "contactNo"
chk_scope "deptSapCode"
chk_scope "purposeOfLease"
chk_scope "lessorParties"
chk_scope "nicNo"
chk_scope "leaseName"
chk_scope "premisesAssetNo"
chk_scope "periodOfLease"
chk_scope "monthlyRental"
chk_scope "commencingFrom"
chk_scope "endingOn"
chk_scope "advancePayment"
chk_scope "deductibleRate"
chk_scope "refundableDeposit"
chk_scope "electricityWaterPhone"

subsect "A4: BUM approves"
approve /tmp/c_bum.txt $SUB BUM APPROVED "BUM approval"
subsect "A5: FBP approves"
approve /tmp/c_fbp.txt $SUB FBP APPROVED "FBP approval"
subsect "A6: Cluster Head approves — expect PENDING_CEO"
approve /tmp/c_ch.txt $SUB CLUSTER_HEAD APPROVED "Cluster Head approval"
check_status $SUB "PENDING_CEO"

subsect "A7: CEO approves — expect PENDING_LEGAL_GM"
approve /tmp/c_ceo.txt $SUB CEO APPROVED "CEO approval"
check_status $SUB "PENDING_LEGAL_GM"

subsect "A8: Legal GM assigns officer + initial approve — expect PENDING_LEGAL_OFFICER"
PATCH_R=$(curl -s -b /tmp/c_lgm.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d "{\"assignedLegalOfficer\": \"$LO_ID\"}")
api_ok "$PATCH_R" && track_pass "Legal GM assigned officer ✓" || track_fail "Officer assignment failed"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM initial approval"
check_status  $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "ACTIVE"
check_gm_stage $SUB "INITIAL_REVIEW"

subsect "A9: Legal Officer submits to GM — expect PENDING_LEGAL_GM_FINAL"
approve /tmp/c_lo.txt $SUB LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "Legal Officer submit to GM"
check_status  $SUB "PENDING_LEGAL_GM_FINAL"
check_gm_stage $SUB "FINAL_APPROVAL"

subsect "A10: Legal GM final approve — expect PENDING_LEGAL_OFFICER + POST_GM_APPROVAL"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM final approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "POST_GM_APPROVAL"

subsect "A11: Legal Officer — Form 2 finalization (f2 fields)"
F2_RES=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{
    "f2StampDuty":    "25000",
    "f2LegalFees":    "15000",
    "f2ReferenceNo":  "REF/2026/001",
    "f2BoardApproval": true,
    "f2Remarks":      "All documents verified. Stamp duty paid.",
    "status":         "COMPLETED"
  }')
api_ok "$F2_RES" && track_pass "F2 finalization PATCH succeeded ✓" || { track_fail "F2 finalization failed"; echo "    $(echo $F2_RES | python3 -m json.tool)"; }

subsect "A12: Verify f2 fields persisted"
check_field "f2StampDuty"    $SUB "25000"
check_field "f2LegalFees"    $SUB "15000"
check_field "f2ReferenceNo"  $SUB "REF/2026/001"
check_field "f2BoardApproval" $SUB "True"
check_field "f2Remarks"      $SUB "All documents verified. Stamp duty paid."
check_field "status"         $SUB "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST B: Draft Save & Edit"
# ══════════════════════════════════════════════════════════════════════════════

subsect "B1: Save as DRAFT"
RES=$(make_sub "LHD_QA_F2_DRAFT_001" "DRAFT")
DR=$(get_id "$RES")
[ -n "$DR" ] && track_pass "Draft created: $DR" || track_fail "Draft creation failed"
check_status $DR "DRAFT"

subsect "B2: Edit draft — update scope + promote to PENDING_APPROVAL"
PATCH_RES=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$DR" \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"PENDING_APPROVAL\",\"scopeOfAgreement\":\"{\\\"purposeOfLease\\\":\\\"Updated office space\\\",\\\"monthlyRental\\\":\\\"175000\\\"}\"}")
api_ok "$PATCH_RES" && track_pass "Draft PATCH succeeded ✓" || track_fail "Draft edit failed"
check_status $DR "PENDING_APPROVAL"

subsect "B3: Verify updated scope saved"
UPDATED_SCOPE=$(get_sub $DR | python3 -c "import sys,json; d=json.load(sys.stdin); s=json.loads(d.get('data',{}).get('scopeOfAgreement','{}')); print(s.get('purposeOfLease',''))" 2>/dev/null)
[ "$UPDATED_SCOPE" = "Updated office space" ] && track_pass "Updated scopeOfAgreement saved ✓" || track_fail "scopeOfAgreement not updated: $UPDATED_SCOPE"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST C: Send Back Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "C1: BUM sends back"
RES=$(make_sub "LHD_QA_F2_SB_BUM_001" "PENDING_APPROVAL")
SB_BUM=$(get_id "$RES")
approve /tmp/c_bum.txt $SB_BUM BUM SENT_BACK "BUM send-back"
check_status $SB_BUM "SENT_BACK"

subsect "C2: FBP sends back"
RES=$(make_sub "LHD_QA_F2_SB_FBP_001" "PENDING_APPROVAL")
SB_FBP=$(get_id "$RES")
approve /tmp/c_fbp.txt $SB_FBP FBP SENT_BACK "FBP send-back"
check_status $SB_FBP "SENT_BACK"

subsect "C3: Cluster Head sends back"
RES=$(make_sub "LHD_QA_F2_SB_CH_001" "PENDING_APPROVAL")
SB_CH=$(get_id "$RES")
approve /tmp/c_ch.txt $SB_CH CLUSTER_HEAD SENT_BACK "Cluster Head send-back"
check_status $SB_CH "SENT_BACK"

subsect "C4: CEO sends back"
RES=$(make_sub "LHD_QA_F2_SB_CEO_001" "PENDING_CEO")
SB_CEO=$(get_id "$RES")
approve /tmp/c_ceo.txt $SB_CEO CEO SENT_BACK "CEO send-back"
check_status $SB_CEO "SENT_BACK"

subsect "C5: Legal GM sends back (initial review)"
RES=$(make_sub "LHD_QA_F2_SB_LGM_001" "PENDING_LEGAL_GM")
SB_LGM=$(get_id "$RES")
approve /tmp/c_lgm.txt $SB_LGM LEGAL_GM SENT_BACK "Legal GM send-back"
check_status $SB_LGM "SENT_BACK"

subsect "C6: Legal Officer returns to initiator"
RES=$(make_sub "LHD_QA_F2_SB_LO_001" "PENDING_LEGAL_OFFICER")
SB_LO=$(get_id "$RES")
R=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SB_LO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"RETURNED_TO_INITIATOR","comment":"Missing documents","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "Legal Officer return to initiator ✓" || track_fail "LO return failed: $(echo $R | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"error\",\"unknown\"))')"
check_status $SB_LO "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST D: Parallel Approval Logic"
# ══════════════════════════════════════════════════════════════════════════════

subsect "D1: Only BUM approves — should stay PENDING_APPROVAL"
RES=$(make_sub "LHD_QA_F2_PAR_001" "PENDING_APPROVAL")
PAR=$(get_id "$RES")
approve /tmp/c_bum.txt $PAR BUM APPROVED "BUM only approval"
check_status $PAR "PENDING_APPROVAL"  # not yet — FBP and CH still pending

subsect "D2: FBP also approves — should still stay PENDING_APPROVAL"
approve /tmp/c_fbp.txt $PAR FBP APPROVED "FBP approval (2 of 3)"
check_status $PAR "PENDING_APPROVAL"  # still waiting for CH

subsect "D3: Cluster Head approves — NOW should move to PENDING_CEO"
approve /tmp/c_ch.txt $PAR CLUSTER_HEAD APPROVED "CH approval (3 of 3 — triggers transition)"
check_status $PAR "PENDING_CEO"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST E: Resubmission"
# ══════════════════════════════════════════════════════════════════════════════

subsect "E1: Create resubmission linked to original"
RESUB=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F2_HAPPY_001_R1\",
    \"formId\": 2, \"formName\": \"Lease Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"000003999\", \"title\": \"Lease Agreement\",
    \"sapCostCenter\": \"000003999\",
    \"scopeOfAgreement\": \"{\\\"purposeOfLease\\\":\\\"Corrected rental amount\\\",\\\"monthlyRental\\\":\\\"175000\\\"}\",
    \"term\": \"2026-03-01 to 2028-03-01\", \"lkrValue\": \"175000\",
    \"remarks\": \"Resubmission — corrected rental\",
    \"initiatorComments\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": [{\"type\": \"Individual\", \"name\": \"John Silva\"}],
    \"parentId\": \"$SUB\",
    \"isResubmission\": true
  }")
RID=$(get_id "$RESUB")
RPARENT=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('parentId',''))")
RFLAG=$(echo $RESUB  | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isResubmission',''))")
RVALUE=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('value',''))")

[ -n "$RID" ]           && track_pass "Resubmission created: $RID ✓"    || track_fail "Resubmission failed"
[ "$RPARENT" = "$SUB" ] && track_pass "parentId linked correctly ✓"      || track_fail "parentId wrong: $RPARENT"
[ "$RFLAG" = "True" ]   && track_pass "isResubmission = True ✓"          || track_fail "isResubmission flag wrong: $RFLAG"
[ "$RVALUE" = "175000" ] && track_pass "Updated lkrValue = 175000 ✓"     || track_fail "lkrValue wrong: $RVALUE"

subsect "E2: Mark original as RESUBMITTED"
MR=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}')
api_ok "$MR" && track_pass "Original marked RESUBMITTED ✓" || track_fail "Mark resubmitted failed"
check_field "status" $SUB "RESUBMITTED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST F: Cancellation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "F1: BUM cancels"
RES=$(make_sub "LHD_QA_F2_CANCEL_001" "PENDING_APPROVAL")
CAN=$(get_id "$RES")
approve /tmp/c_bum.txt $CAN BUM CANCELLED "BUM cancellation"
check_status $CAN "CANCELLED"

subsect "F2: Legal GM cancels"
RES=$(make_sub "LHD_QA_F2_CANCEL_002" "PENDING_LEGAL_GM")
CAN2=$(get_id "$RES")
approve /tmp/c_lgm.txt $CAN2 LEGAL_GM CANCELLED "Legal GM cancellation"
check_status $CAN2 "CANCELLED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST G: Document Verification"
# ══════════════════════════════════════════════════════════════════════════════

subsect "G1: Documents created with correct types for Individual lessor"
# Re-login initiator to ensure fresh session for document tests
login "initiator@testdimo.com" /tmp/c_initiator.txt
RES=$(make_sub "LHD_QA_F2_DOCS_001" "PENDING_APPROVAL")
info "G1 raw response: $(echo $RES | cut -c1-200)"
DOCS_SUB=$(get_id "$RES")
info "G1 DOCS_SUB=$DOCS_SUB"
DOC_DATA=$(get_sub $DOCS_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['type']+'|'+d['label'])
")
info "Documents for Individual lessor:"
echo "$DOC_DATA" | while IFS='|' read TYPE LABEL; do echo "    [$TYPE] $LABEL"; done
DOC_COUNT=$(echo "$DOC_DATA" | grep -c "|")
[ "$DOC_COUNT" -eq "25" ] && track_pass "Doc count = 25 (23 common + 2 individual) ✓" || track_fail "Expected 25 docs, got $DOC_COUNT"
echo "$DOC_DATA" | grep -q "Offer Letter from the landowner" && track_pass "Mandatory: Offer Letter ✓" || track_fail "Missing: Offer Letter"
echo "$DOC_DATA" | grep -q "Copy of the Title Deed" && track_pass "Mandatory: Title Deed ✓" || track_fail "Missing: Title Deed"
echo "$DOC_DATA" | grep -q "Copy of the Approved Survey Plan" && track_pass "Mandatory: Survey Plan ✓" || track_fail "Missing: Survey Plan"
echo "$DOC_DATA" | grep -q "Certificate of Conformity" && track_pass "Mandatory: Certificate of Conformity ✓" || track_fail "Missing: Certificate of Conformity"
echo "$DOC_DATA" | grep -q "Extracts from Land Registry" && track_pass "Mandatory: Land Registry Extracts ✓" || track_fail "Missing: Land Registry Extracts"
echo "$DOC_DATA" | grep -q "NIC (Individual owner)" && track_pass "Individual: NIC present ✓" || track_fail "Missing: NIC (Individual owner)"
echo "$DOC_DATA" | grep -q "Other (Individual)" && track_pass "Individual: Other present ✓" || track_fail "Missing: Other (Individual)"
echo "$DOC_DATA" | grep -q "Certificate of Incorporation" && track_fail "WRONG: Certificate of Incorporation (Form 1 doc!) found" || track_pass "No Form 1 doc contamination ✓"
echo "$DOC_DATA" | grep -q "Form 1 (Company Registration)" && track_fail "WRONG: Form 1 Company Registration found" || track_pass "No legacy Form 1 labels ✓"

subsect "G1e: Company lessor gets 28 docs (23 common + 5 company)"
RES_CO=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{\"submissionNo\":\"LHD_QA_F2_DOCS_CO_001\",\"formId\":2,\"formName\":\"Lease Agreement\",\"status\":\"PENDING_APPROVAL\",\"initiatorId\":\"$INITIATOR_ID\",\"initiatorName\":\"Test Initiator\",\"companyCode\":\"000003999\",\"title\":\"Lease Agreement\",\"sapCostCenter\":\"000003999\",\"scopeOfAgreement\":\"{}\",\"term\":\"\",\"lkrValue\":\"\",\"remarks\":\"\",\"initiatorComments\":\"\",\"legalOfficerId\":\"\",\"bumId\":\"$BUM_ID\",\"fbpId\":\"$FBP_ID\",\"clusterHeadId\":\"$CH_ID\",\"parties\":[{\"type\":\"Company\",\"name\":\"Test Co\"}]}")
CO_SUB=$(get_id "$RES_CO")
CO_DOCS=$(get_sub $CO_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(len(docs)); [print(d['label']) for d in docs]")
CO_COUNT=$(echo "$CO_DOCS" | head -1)
[ "$CO_COUNT" -eq "28" ] && track_pass "Company: 28 docs ✓" || track_fail "Company: expected 28, got $CO_COUNT"
echo "$CO_DOCS" | grep -q "Board Resolution" && track_pass "Company: Board Resolution ✓" || track_fail "Missing: Board Resolution"
echo "$CO_DOCS" | grep -q "Memorandum and Article" && track_pass "Company: Memorandum ✓" || track_fail "Missing: Memorandum"
echo "$CO_DOCS" | grep -q "Form 20" && track_pass "Company: Form 20 ✓" || track_fail "Missing: Form 20"

subsect "G2: Update document status (Legal Officer marks doc)"
DOC_ID=$(get_sub $DOCS_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[0]['id'] if docs else '')")
[ -n "$DOC_ID" ] && track_pass "Got document ID: $DOC_ID" || track_fail "No document ID"

DOC_UPD=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$DOCS_SUB" \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":\"$DOC_ID\",\"documentStatus\":\"APPROVED\",\"documentComment\":\"Document looks good\"}")
api_ok "$DOC_UPD" && track_pass "Document status updated ✓" || track_fail "Document update failed"

DOC_STATUS=$(get_sub $DOCS_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
d=[x for x in docs if x['id']=='$DOC_ID']
print(d[0]['status'] if d else 'NOT FOUND')
")
[ "$DOC_STATUS" = "APPROVED" ] && track_pass "Document status = APPROVED ✓" || track_fail "Document status wrong: $DOC_STATUS"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST H: Comments"
# ══════════════════════════════════════════════════════════════════════════════

subsect "H1: Post a comment"
CMT_RES=$(curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$SUB/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Test Legal GM","authorRole":"LEGAL_GM","text":"Please ensure all documents are certified copies."}')
api_ok "$CMT_RES" && track_pass "Comment posted ✓" || track_fail "Comment post failed"

subsect "H2: Verify comment appears on submission"
CMT_COUNT=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT" -gt "0" ] && track_pass "Comment visible on submission ($CMT_COUNT comments) ✓" || track_fail "No comments found"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST I: API Edge Cases"
# ══════════════════════════════════════════════════════════════════════════════

subsect "I1: GET non-existent submission → 404"
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions/non_existent_id_xyz")
[ "$R" = "404" ] && track_pass "Non-existent submission returns 404 ✓" || track_fail "Expected 404, got $R"

subsect "I2: POST submission missing required fields → error"
BAD=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"formId":2}')
BAD_OK=$(echo $BAD | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$BAD_OK" = "False" ] && track_pass "Missing fields returns error ✓" || track_fail "Expected error for missing fields"

subsect "I3: Duplicate submission number → conflict"
DUP=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F2_HAPPY_001\",
    \"formId\": 2, \"formName\": \"Lease Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test\",
    \"companyCode\": \"X\", \"title\": \"X\", \"sapCostCenter\": \"X\",
    \"scopeOfAgreement\": \"{}\", \"term\": \"\", \"lkrValue\": \"\",
    \"remarks\": \"\", \"initiatorComments\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": []
  }")
DUP_OK=$(echo $DUP | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$DUP_OK" = "False" ] && track_pass "Duplicate submission number rejected ✓" || track_fail "Expected conflict error for duplicate"

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
echo -e "  Parallel test: $PAR"
echo -e "  Resubmission:  $RID"
echo -e "  Send-backs:    BUM=$SB_BUM | FBP=$SB_FBP | CH=$SB_CH | CEO=$SB_CEO | LGM=$SB_LGM | LO=$SB_LO"
echo -e "  Cancelled:     $CAN | $CAN2"
echo ""
if [ "$FAIL_COUNT" -eq "0" ]; then
  echo -e "${GREEN}  🎉 ALL TESTS PASSED — Form 2 is fully verified!${NC}"
else
  echo -e "${RED}  ⚠️  $FAIL_COUNT test(s) failed — review ❌ above${NC}"
fi
echo ""

# ══════════════════════════════════════════════════════════════════════════════
section "TEST J: CEO Actions"
# ══════════════════════════════════════════════════════════════════════════════

subsect "J1: CEO cancels a submission"
RES=$(make_sub "LHD_QA_F2_CEO_CANCEL_001" "PENDING_CEO")
CEO_CAN=$(get_id "$RES")
approve /tmp/c_ceo.txt $CEO_CAN CEO CANCELLED "CEO cancellation"
check_status $CEO_CAN "CANCELLED"

subsect "J2: CEO sends back"
RES=$(make_sub "LHD_QA_F2_CEO_SB_001" "PENDING_CEO")
CEO_SB=$(get_id "$RES")
approve /tmp/c_ceo.txt $CEO_SB CEO SENT_BACK "CEO send-back"
check_status $CEO_SB "SENT_BACK"

subsect "J3: CEO-cancelled cannot be resubmitted (status check)"
CEO_CAN_STATUS=$(get_sub $CEO_CAN | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('status',''))")
[ "$CEO_CAN_STATUS" = "CANCELLED" ] && track_pass "CEO-cancelled stays CANCELLED (not resubmittable) ✓" || track_fail "Unexpected status: $CEO_CAN_STATUS"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST K: Resubmission Numbering & RESUBMITTED Filtering"
# ══════════════════════════════════════════════════════════════════════════════

subsect "K1: Resubmission gets _R1 suffix"
RES=$(make_sub "LHD_QA_F2_RESUB_BASE_001" "SENT_BACK")
BASE_SUB=$(get_id "$RES")

R1=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F2_RESUB_BASE_001_R1\",
    \"formId\": 2, \"formName\": \"Lease Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"000003999\", \"title\": \"Lease Agreement\",
    \"sapCostCenter\": \"000003999\",
    \"scopeOfAgreement\": \"{\\\"purposeOfLease\\\":\\\"Resubmitted\\\",\\\"monthlyRental\\\":\\\"150000\\\"}\",
    \"term\": \"\", \"lkrValue\": \"150000\", \"remarks\": \"\",
    \"initiatorComments\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": [{\"type\": \"Individual\", \"name\": \"John Silva\"}],
    \"parentId\": \"$BASE_SUB\", \"isResubmission\": true
  }")
R1_ID=$(get_id "$R1")
R1_NO=$(echo $R1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('submissionNo',''))")
[ "$R1_NO" = "LHD_QA_F2_RESUB_BASE_001_R1" ] && track_pass "R1 submissionNo = $R1_NO ✓" || track_fail "R1 submissionNo wrong: $R1_NO"

subsect "K2: Mark base as RESUBMITTED, verify hidden from list"
curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$BASE_SUB" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}' > /dev/null

RESUBMITTED_IN_LIST=$(curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions" | python3 -c "
import sys, json
data = json.load(sys.stdin).get('data', [])
found = [s for s in data if s.get('status') == 'RESUBMITTED']
print(len(found))
")
[ "$RESUBMITTED_IN_LIST" -eq "0" ] && track_pass "RESUBMITTED submissions not returned by API ✓" || track_fail "API still returns $RESUBMITTED_IN_LIST RESUBMITTED submissions"

subsect "K3: R2 suffix on second resubmission"
R2=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F2_RESUB_BASE_001_R2\",
    \"formId\": 2, \"formName\": \"Lease Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"000003999\", \"title\": \"Lease Agreement\",
    \"sapCostCenter\": \"000003999\",
    \"scopeOfAgreement\": \"{\\\"purposeOfLease\\\":\\\"Second resubmission\\\",\\\"monthlyRental\\\":\\\"150000\\\"}\",
    \"term\": \"\", \"lkrValue\": \"150000\", \"remarks\": \"\",
    \"initiatorComments\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": [{\"type\": \"Individual\", \"name\": \"John Silva\"}],
    \"parentId\": \"$R1_ID\", \"isResubmission\": true
  }")
R2_NO=$(echo $R2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('submissionNo',''))")
[ "$R2_NO" = "LHD_QA_F2_RESUB_BASE_001_R2" ] && track_pass "R2 submissionNo = $R2_NO ✓" || track_fail "R2 submissionNo wrong: $R2_NO"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST L: Document Count Validation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "L1: Individual lessor — expect exactly 25 documents"
RES=$(make_sub "LHD_QA_F2_DOCC_IND_001" "PENDING_APPROVAL")
DOCC_IND=$(get_id "$RES")
IND_COUNT=$(get_sub $DOCC_IND | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$IND_COUNT" -eq "25" ] && track_pass "Individual lessor doc count = 25 ✓" || track_fail "Individual doc count wrong: $IND_COUNT (expected 25)"

# Check mandatory docs present
IND_LABELS=$(get_sub $DOCC_IND | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print('\n'.join(d['label'] for d in docs))")
for MANDATORY in "Offer Letter from the landowner" "Copy of the Title Deed" "Survey Plan" "NIC (Individual owner)"; do
  echo "$IND_LABELS" | grep -q "$MANDATORY" \
    && track_pass "Mandatory doc present: '$MANDATORY' ✓" \
    || track_fail "Mandatory doc MISSING: '$MANDATORY'"
done

# Check no Form 1 contamination
for F1_DOC in "Certificate of Incorporation" "Form 1 Company Registration"; do
  echo "$IND_LABELS" | grep -q "$F1_DOC" \
    && track_fail "Form 1 doc contamination: '$F1_DOC'" \
    || track_pass "No Form 1 contamination: '$F1_DOC' absent ✓"
done

subsect "L2: Company lessor — expect exactly 28 documents"
COMP_RES=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F2_DOCC_COMP_001\",
    \"formId\": 2, \"formName\": \"Lease Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"000003999\", \"title\": \"Lease Agreement\",
    \"sapCostCenter\": \"000003999\",
    \"scopeOfAgreement\": \"{\\\"contactPerson\\\":\\\"Test\\\",\\\"contactNo\\\":\\\"+94771234567\\\",\\\"deptSapCode\\\":\\\"000003999\\\",\\\"purposeOfLease\\\":\\\"Office\\\",\\\"lessorParties\\\":[{\\\"type\\\":\\\"Company\\\",\\\"name\\\":\\\"ACME Ltd\\\"}],\\\"nicNo\\\":\\\"\\\",\\\"vatRegNo\\\":\\\"VAT123\\\",\\\"lessorContact\\\":\\\"+94711234567\\\",\\\"leaseName\\\":\\\"ACME Lease\\\",\\\"premisesAssetNo\\\":\\\"AST002\\\",\\\"periodOfLease\\\":\\\"3 years\\\",\\\"assetHouse\\\":false,\\\"assetLand\\\":false,\\\"assetBuilding\\\":true,\\\"assetExtent\\\":\\\"3000 sqft\\\",\\\"commencingFrom\\\":\\\"2026-03-01\\\",\\\"endingOn\\\":\\\"2029-03-01\\\",\\\"monthlyRental\\\":\\\"200000\\\",\\\"advancePayment\\\":\\\"400000\\\",\\\"deductibleRate\\\":\\\"10\\\",\\\"deductiblePeriod\\\":\\\"2 months\\\",\\\"refundableDeposit\\\":\\\"200000\\\",\\\"electricityWaterPhone\\\":\\\"Tenant\\\",\\\"previousAgreementNo\\\":\\\"\\\",\\\"dateOfPrincipalAgreement\\\":\\\"\\\",\\\"buildingsConstructed\\\":\\\"None\\\",\\\"intendToConstruct\\\":\\\"None\\\",\\\"remarks\\\":\\\"Company test\\\"}\",
    \"term\": \"2026-03-01 to 2029-03-01\", \"lkrValue\": \"200000\",
    \"remarks\": \"Company lessor test\",
    \"initiatorComments\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": [{\"type\": \"Company\", \"name\": \"ACME Ltd\"}]
  }")
DOCC_COMP=$(get_id "$COMP_RES")
COMP_COUNT=$(get_sub $DOCC_COMP | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$COMP_COUNT" -eq "28" ] && track_pass "Company lessor doc count = 28 ✓" || track_fail "Company doc count wrong: $COMP_COUNT (expected 28)"

COMP_LABELS=$(get_sub $DOCC_COMP | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print('\n'.join(d['label'] for d in docs))")
for COMP_DOC in "Board Resolution" "Memorandum and Article of Association" "Form 20"; do
  echo "$COMP_LABELS" | grep -q "$COMP_DOC" \
    && track_pass "Company doc present: '$COMP_DOC' ✓" \
    || track_fail "Company doc MISSING: '$COMP_DOC'"
done

