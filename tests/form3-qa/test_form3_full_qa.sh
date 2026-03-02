#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# Form 3 Full QA Test Suite — Instruction For Litigation
# USAGE: bash tests/form3-qa/test_form3_full_qa.sh
# Run from project root. Dev server must be running: npm run dev
# ══════════════════════════════════════════════════════════════════════════════

BASE="http://localhost:3000"

if ! curl -s --max-time 3 "$BASE/api/auth/csrf" > /dev/null 2>&1; then
  echo -e "\033[0;31m❌ Dev server is not running. Start it with: npm run dev\033[0m"
  exit 1
fi

echo -e "\033[1;33m🧹 Cleaning up previous QA test data...\033[0m"
npx prisma db execute --stdin <<'SQL' 2>/dev/null
DELETE FROM "submission_parties"           WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F3_%');
DELETE FROM "submission_approvals"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F3_%');
DELETE FROM "submission_documents"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F3_%');
DELETE FROM "submission_comments"          WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F3_%');
DELETE FROM "submission_special_approvers" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F3_%');
DELETE FROM "submissions"                  WHERE "submissionNo" LIKE 'LHD_QA_F3_%';
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

make_sub() {
  local NO=$1 STATUS=$2 PARTY_TYPE=${3:-"Individual"}
  curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
    -H "Content-Type: application/json" \
    -d "{
      \"submissionNo\": \"$NO\",
      \"formId\": 3,
      \"formName\": \"Instruction For Litigation\",
      \"status\": \"$STATUS\",
      \"initiatorId\": \"$INITIATOR_ID\",
      \"initiatorName\": \"Test Initiator\",
      \"companyCode\": \"DM01\",
      \"title\": \"Instruction For Litigation\",
      \"sapCostCenter\": \"000003999\",
      \"scopeOfAgreement\": \"{\\\"demandDate\\\":\\\"2026-01-15\\\",\\\"initiatorName\\\":\\\"Test Initiator\\\",\\\"initiatorContact\\\":\\\"+94771234567\\\",\\\"managerInCharge\\\":\\\"Test Manager\\\",\\\"officerInCharge\\\":\\\"Test Officer\\\",\\\"clusterNo\\\":\\\"CLU001\\\",\\\"repName\\\":\\\"Ruwan Fernando\\\",\\\"repDesignation\\\":\\\"Legal Rep\\\",\\\"repNic\\\":\\\"901234567V\\\",\\\"repContact\\\":\\\"+94711234567\\\",\\\"repEmail\\\":\\\"rep@testdimo.com\\\",\\\"customerType\\\":\\\"$PARTY_TYPE\\\",\\\"customerData\\\":{\\\"customerName\\\":\\\"John Silva\\\",\\\"nic\\\":\\\"801234567V\\\",\\\"outstandingAmount\\\":\\\"250000\\\"},\\\"legalHistory\\\":[]}\",
      \"term\": \"2026-01-15\",
      \"lkrValue\": \"250000\",
      \"remarks\": \"Test Form 3 submission\",
      \"initiatorComments\": \"\",
      \"legalOfficerId\": \"\",
      \"bumId\": \"$BUM_ID\",
      \"fbpId\": \"$FBP_ID\",
      \"parties\": [{\"type\": \"$PARTY_TYPE\", \"name\": \"John Silva\"}]
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
LO_ID=$(uid "sandalie.gomes@testdimo.com")
CO_ID=$(uid "court.officer@testdimo.com")
SA_ID=$(uid "special.approver@testdimo.com")

[ -n "$INITIATOR_ID" ] && track_pass "Initiator ID: $INITIATOR_ID" || { track_fail "Initiator not found"; exit 1; }
[ -n "$BUM_ID" ]       && track_pass "BUM ID: $BUM_ID"             || { track_fail "BUM not found"; exit 1; }
[ -n "$FBP_ID" ]       && track_pass "FBP ID: $FBP_ID"             || { track_fail "FBP not found"; exit 1; }
[ -n "$LO_ID" ]        && track_pass "LO ID: $LO_ID"               || { track_fail "Legal Officer not found"; exit 1; }
[ -n "$CO_ID" ]        && track_pass "Court Officer ID: $CO_ID"    || { track_fail "Court Officer not found"; exit 1; }
[ -n "$SA_ID" ]        && track_pass "SA ID: $SA_ID"               || track_fail "Special Approver not found (non-fatal)"

subsect "Login all roles"
login "oliva.perera@testdimo.com"     /tmp/c_initiator.txt
login "grace.perera@testdimo.com"     /tmp/c_bum.txt
login "madurika.sama@testdimo.com"    /tmp/c_fbp.txt
login "mangala.wick@testdimo.com"     /tmp/c_ch.txt
login "dinali.guru@testdimo.com"      /tmp/c_lgm.txt
login "sandalie.gomes@testdimo.com"   /tmp/c_lo.txt
login "court.officer@testdimo.com"    /tmp/c_co.txt
login "special.approver@testdimo.com" /tmp/c_sa.txt

# ══════════════════════════════════════════════════════════════════════════════
section "TEST A: Full Happy Path — End to End with Court Officer"
# ══════════════════════════════════════════════════════════════════════════════

subsect "A1: Initiator creates Form 3 submission"
RES=$(make_sub "LHD_QA_F3_HAPPY_001" "PENDING_APPROVAL")
SUB=$(get_id "$RES")
SUB_NO=$(echo $RES | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('submissionNo','') or d.get('data',{}).get('submissionNo',''))")
[ -n "$SUB" ] && track_pass "Submission created — No: $SUB_NO | ID: $SUB" || { track_fail "Submission creation failed: $RES"; exit 1; }

subsect "A2: Verify initial field values"
SUB_DATA=$(get_sub $SUB)
chk() {
  V=$(echo $SUB_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1',''))" 2>/dev/null)
  [ "$V" = "$2" ] && track_pass "$1 = '$V' ✓" || track_fail "$1: expected '$2', got '$V'"
}
chk "formId"       "3"
chk "formName"     "Instruction For Litigation"
chk "status"       "PENDING_APPROVAL"
chk "loStage"      "PENDING_LEGAL_GM"
chk "legalGmStage" "INITIAL_REVIEW"

APPROVALS=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
[ "$APPROVALS" -eq "2" ] && track_pass "2 parallel approvals (BUM+FBP only) ✓" || track_fail "Expected 2 approvals for Form 3, got $APPROVALS"

CH_APPROVAL=$(echo $SUB_DATA | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='CLUSTER_HEAD']))")
[ "$CH_APPROVAL" -eq "0" ] && track_pass "No CLUSTER_HEAD approval row ✓" || track_fail "Form 3 should NOT have CLUSTER_HEAD, found $CH_APPROVAL"

CEO_APPROVAL=$(echo $SUB_DATA | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='CEO']))")
[ "$CEO_APPROVAL" -eq "0" ] && track_pass "No CEO approval row ✓" || track_fail "Form 3 should NOT have CEO, found $CEO_APPROVAL"

DOCS=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$DOCS" -gt "0" ] && track_pass "Documents auto-created: $DOCS docs ✓" || track_fail "No documents created"

subsect "A3: BUM approves"
approve /tmp/c_bum.txt $SUB BUM APPROVED "BUM approval"

subsect "A4: FBP approves — moves straight to PENDING_LEGAL_GM (no CEO)"
approve /tmp/c_fbp.txt $SUB FBP APPROVED "FBP approval"
check_status $SUB "PENDING_LEGAL_GM"

subsect "A5: Legal GM assigns officer + initial approval — PENDING_LEGAL_OFFICER + ASSIGN_COURT_OFFICER"
PATCH_R=$(curl -s -b /tmp/c_lgm.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d "{\"assignedLegalOfficer\": \"$LO_ID\"}")
api_ok "$PATCH_R" && track_pass "Legal GM assigned legal officer ✓" || track_fail "Officer assignment failed"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM initial approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "ASSIGN_COURT_OFFICER"
check_gm_stage $SUB "INITIAL_REVIEW"

subsect "A6: Legal Officer assigns Court Officer — PENDING_COURT_OFFICER"
CO_ASSIGN=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_OFFICER\",\"action\":\"ASSIGN_COURT_OFFICER\",\"courtOfficerId\":\"$CO_ID\",\"courtOfficerEmail\":\"court.officer@testdimo.com\",\"courtOfficerName\":\"Ruwan Fernando\"}")
api_ok "$CO_ASSIGN" && track_pass "Court Officer assigned ✓" || { track_fail "CO assignment failed"; echo "  $(echo $CO_ASSIGN | python3 -c 'import sys,json; print(json.load(sys.stdin).get("error",""))' 2>/dev/null)"; }
check_status   $SUB "PENDING_COURT_OFFICER"
check_lo_stage $SUB "PENDING_COURT_OFFICER"

subsect "A7: Verify courtOfficerId saved"
COURT_ID_SAVED=$(get_sub $SUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('courtOfficerId',''))")
[ "$COURT_ID_SAVED" = "$CO_ID" ] && track_pass "courtOfficerId saved correctly ✓" || track_fail "courtOfficerId wrong: $COURT_ID_SAVED"

subsect "A8: Court Officer submits to Legal Officer — PENDING_LEGAL_OFFICER + REVIEW_FOR_GM"
CO_SUBMIT=$(curl -s -b /tmp/c_co.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"SUBMIT_TO_LEGAL_OFFICER","comment":"Court work complete","approverName":"Ruwan Fernando"}')
api_ok "$CO_SUBMIT" && track_pass "Court Officer submitted to Legal Officer ✓" || track_fail "CO submit failed"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "REVIEW_FOR_GM"

subsect "A9: Legal Officer submits to Legal GM — PENDING_LEGAL_GM_FINAL"
approve /tmp/c_lo.txt $SUB LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "Legal Officer submit to GM"
check_status   $SUB "PENDING_LEGAL_GM_FINAL"
check_gm_stage $SUB "FINAL_APPROVAL"

subsect "A10: Legal GM final approval — Form 3 → PENDING_COURT_OFFICER (Form 2 would go to PENDING_LEGAL_OFFICER)"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM final approval"
check_status   $SUB "PENDING_COURT_OFFICER"
check_lo_stage $SUB "POST_GM_APPROVAL"

subsect "A11: Court Officer final submit — PENDING_LEGAL_OFFICER + FINALIZATION"
CO_FINAL=$(curl -s -b /tmp/c_co.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"SUBMIT_TO_LEGAL_OFFICER","comment":"Final complete","approverName":"Ruwan Fernando"}')
api_ok "$CO_FINAL" && track_pass "Court Officer final submit ✓" || track_fail "CO final submit failed"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "FINALIZATION"

subsect "A12: Legal Officer saves f3 finalization fields"
F3_RES=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{
    "f3GmcApprovalNo":   "GMC/2026/001",
    "f3CaseNo":          "CASE/2026/001",
    "f3CaseFillingDate": "2026-03-01",
    "f3Council":         "Counsel Name",
    "f3Court":           "District Court Colombo",
    "f3Remarks":         "Case filed successfully"
  }')
api_ok "$F3_RES" && track_pass "F3 finalization PATCH succeeded ✓" || track_fail "F3 finalization failed"

subsect "A13: Verify f3 fields persisted"
check_field "f3GmcApprovalNo"   $SUB "GMC/2026/001"
check_field "f3CaseNo"          $SUB "CASE/2026/001"
check_field "f3CaseFillingDate" $SUB "2026-03-01"
check_field "f3Council"         $SUB "Counsel Name"
check_field "f3Court"           $SUB "District Court Colombo"
check_field "f3Remarks"         $SUB "Case filed successfully"

subsect "A14: Legal Officer marks COMPLETED"
COMP_RES=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"COMPLETED","comment":"All done","approverName":"Sandalie Gomes"}')
api_ok "$COMP_RES" && track_pass "Legal Officer COMPLETED ✓" || track_fail "LO COMPLETED failed"
check_status $SUB "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST B: Draft Save & Edit"
# ══════════════════════════════════════════════════════════════════════════════

subsect "B1: Save as DRAFT"
RES=$(make_sub "LHD_QA_F3_DRAFT_001" "DRAFT")
DR=$(get_id "$RES")
[ -n "$DR" ] && track_pass "Draft created: $DR" || track_fail "Draft creation failed"
check_status $DR "DRAFT"

subsect "B2: Edit draft + promote to PENDING_APPROVAL"
PATCH_RES=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$DR" \
  -H "Content-Type: application/json" \
  -d '{"status":"PENDING_APPROVAL","scopeOfAgreement":"{\"demandDate\":\"2026-02-01\",\"customerType\":\"Company\",\"customerData\":{\"companyName\":\"ACME Ltd\",\"outstandingAmount\":\"500000\"}}"}')
api_ok "$PATCH_RES" && track_pass "Draft PATCH succeeded ✓" || track_fail "Draft edit failed"
check_status $DR "PENDING_APPROVAL"

subsect "B3: Verify updated scope saved"
UPDATED_SCOPE=$(get_sub $DR | python3 -c "import sys,json; d=json.load(sys.stdin); s=json.loads(d.get('data',{}).get('scopeOfAgreement','{}')); print(s.get('customerType',''))" 2>/dev/null)
[ "$UPDATED_SCOPE" = "Company" ] && track_pass "Updated scopeOfAgreement saved ✓" || track_fail "scopeOfAgreement not updated: $UPDATED_SCOPE"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST C: Send Back Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "C1: BUM sends back"
RES=$(make_sub "LHD_QA_F3_SB_BUM_001" "PENDING_APPROVAL")
SB_BUM=$(get_id "$RES")
approve /tmp/c_bum.txt $SB_BUM BUM SENT_BACK "BUM send-back"
check_status $SB_BUM "SENT_BACK"

subsect "C2: FBP sends back"
RES=$(make_sub "LHD_QA_F3_SB_FBP_001" "PENDING_APPROVAL")
SB_FBP=$(get_id "$RES")
approve /tmp/c_fbp.txt $SB_FBP FBP SENT_BACK "FBP send-back"
check_status $SB_FBP "SENT_BACK"

subsect "C3: Legal GM sends back"
RES=$(make_sub "LHD_QA_F3_SB_LGM_001" "PENDING_LEGAL_GM")
SB_LGM=$(get_id "$RES")
approve /tmp/c_lgm.txt $SB_LGM LEGAL_GM SENT_BACK "Legal GM send-back"
check_status $SB_LGM "SENT_BACK"

subsect "C4: Court Officer sends back"
RES=$(make_sub "LHD_QA_F3_SB_CO_001" "PENDING_COURT_OFFICER")
SB_CO=$(get_id "$RES")
R=$(curl -s -b /tmp/c_co.txt -X POST "$BASE/api/submissions/$SB_CO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"SENT_BACK","comment":"Missing documents","approverName":"Ruwan Fernando"}')
api_ok "$R" && track_pass "Court Officer send-back ✓" || track_fail "CO send-back failed"
check_status $SB_CO "SENT_BACK"

subsect "C5: Legal Officer returns to initiator"
RES=$(make_sub "LHD_QA_F3_SB_LO_001" "PENDING_LEGAL_OFFICER")
SB_LO=$(get_id "$RES")
R=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SB_LO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"RETURNED_TO_INITIATOR","comment":"Needs correction","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "Legal Officer return to initiator ✓" || track_fail "LO return failed"
check_status $SB_LO "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST D: Parallel Approval Logic — BUM + FBP only"
# ══════════════════════════════════════════════════════════════════════════════

subsect "D1: Only BUM approves — stays PENDING_APPROVAL"
RES=$(make_sub "LHD_QA_F3_PAR_001" "PENDING_APPROVAL")
PAR=$(get_id "$RES")
approve /tmp/c_bum.txt $PAR BUM APPROVED "BUM only"
check_status $PAR "PENDING_APPROVAL"

subsect "D2: FBP approves — 2 of 2, moves to PENDING_LEGAL_GM"
approve /tmp/c_fbp.txt $PAR FBP APPROVED "FBP triggers transition"
check_status $PAR "PENDING_LEGAL_GM"

subsect "D3: Cluster Head approval does not advance Form 3"
RES=$(make_sub "LHD_QA_F3_PAR_CH_001" "PENDING_APPROVAL")
PAR_CH=$(get_id "$RES")
approve /tmp/c_bum.txt $PAR_CH BUM APPROVED "BUM"
curl -s -b /tmp/c_ch.txt -X POST "$BASE/api/submissions/$PAR_CH/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"CLUSTER_HEAD","action":"APPROVED","comment":"Test","approverName":"Test CH"}' > /dev/null
STATUS_AFTER_CH=$(get_sub $PAR_CH | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('status',''))")
[ "$STATUS_AFTER_CH" != "PENDING_LEGAL_GM" ] && track_pass "CH alone does not advance Form 3 ✓" || track_fail "Form 3 should not advance on CH alone"
approve /tmp/c_fbp.txt $PAR_CH FBP APPROVED "FBP completes Form 3"
check_status $PAR_CH "PENDING_LEGAL_GM"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST E: Cancellation"
# ══════════════════════════════════════════════════════════════════════════════

subsect "E1: BUM cancels"
RES=$(make_sub "LHD_QA_F3_CANCEL_001" "PENDING_APPROVAL")
CAN=$(get_id "$RES")
approve /tmp/c_bum.txt $CAN BUM CANCELLED "BUM cancellation"
check_status $CAN "CANCELLED"

subsect "E2: Legal GM cancels"
RES=$(make_sub "LHD_QA_F3_CANCEL_002" "PENDING_LEGAL_GM")
CAN2=$(get_id "$RES")
approve /tmp/c_lgm.txt $CAN2 LEGAL_GM CANCELLED "Legal GM cancellation"
check_status $CAN2 "CANCELLED"

subsect "E3: Court Officer cancels"
RES=$(make_sub "LHD_QA_F3_CANCEL_003" "PENDING_COURT_OFFICER")
CAN3=$(get_id "$RES")
R=$(curl -s -b /tmp/c_co.txt -X POST "$BASE/api/submissions/$CAN3/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"CANCELLED","comment":"Cancelled","approverName":"Ruwan Fernando"}')
api_ok "$R" && track_pass "Court Officer cancellation ✓" || track_fail "CO cancellation failed"
check_status $CAN3 "CANCELLED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST F: Special Approver Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "F1: Legal GM assigns Special Approver during initial review"
RES=$(make_sub "LHD_QA_F3_SA_LGM_001" "PENDING_LEGAL_GM")
SA_LGM=$(get_id "$RES")
SA_RES=$(curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$SA_LGM/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"specialApprovers\":[{\"email\":\"special.approver@testdimo.com\",\"name\":\"Special Approver\",\"dept\":\"Legal\"}],\"assignedOfficer\":\"$LO_ID\"}")
api_ok "$SA_RES" && track_pass "Legal GM assigned special approver ✓" || track_fail "SA assignment failed"
check_status $SA_LGM "PENDING_SPECIAL_APPROVER"

subsect "F2: Special Approver approves (GM-assigned) — routes to Legal Officer INITIAL_REVIEW"
SA_APP=$(curl -s -b /tmp/c_sa.txt -X POST "$BASE/api/submissions/$SA_LGM/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_APP" && track_pass "Special Approver approved ✓" || track_fail "SA approval failed"
check_status   $SA_LGM "PENDING_LEGAL_OFFICER"
check_lo_stage $SA_LGM "INITIAL_REVIEW"

subsect "F3: Court Officer assigns Special Approver"
RES=$(make_sub "LHD_QA_F3_SA_CO_001" "PENDING_COURT_OFFICER")
SA_CO=$(get_id "$RES")
CO_SA_RES=$(curl -s -b /tmp/c_co.txt -X POST "$BASE/api/submissions/$SA_CO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"ASSIGN_SPECIAL_APPROVER","specialApproverEmail":"special.approver@testdimo.com","specialApproverName":"Special Approver"}')
api_ok "$CO_SA_RES" && track_pass "Court Officer assigned special approver ✓" || track_fail "CO SA assignment failed"
check_status $SA_CO "PENDING_SPECIAL_APPROVER"

subsect "F4: Special Approver approves (CO-assigned) — routes back to Court Officer"
SA_CO_APP=$(curl -s -b /tmp/c_sa.txt -X POST "$BASE/api/submissions/$SA_CO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_CO_APP" && track_pass "Special Approver approved (CO path) ✓" || track_fail "SA approval (CO path) failed"
check_status $SA_CO "PENDING_COURT_OFFICER"

subsect "F5: Special Approver sends back"
RES=$(make_sub "LHD_QA_F3_SA_SB_001" "PENDING_LEGAL_GM")
SA_SB=$(get_id "$RES")
curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$SA_SB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_GM","action":"APPROVED","specialApprovers":[{"email":"special.approver@testdimo.com","name":"Special Approver","dept":"Legal"}]}' > /dev/null
SA_SB_RES=$(curl -s -b /tmp/c_sa.txt -X POST "$BASE/api/submissions/$SA_SB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"SENT_BACK","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_SB_RES" && track_pass "Special Approver sent back ✓" || track_fail "SA send-back failed"
check_status $SA_SB "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST G: Document Verification — Form 3"
# ══════════════════════════════════════════════════════════════════════════════

subsect "G1: Individual — base docs + Individual-specific docs"
RES=$(make_sub "LHD_QA_F3_DOCS_IND_001" "PENDING_APPROVAL" "Individual")
DOCS_SUB=$(get_id "$RES")
DOC_DATA=$(get_sub $DOCS_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['label'])
")
DOC_COUNT=$(get_sub $DOCS_SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
info "Form 3 Individual doc count: $DOC_COUNT"
[ "$DOC_COUNT" -gt "0" ] && track_pass "Documents created: $DOC_COUNT ✓" || track_fail "No documents created"
echo "$DOC_DATA" | grep -q "Original Agreement"                        && track_pass "Base: Original Agreement ✓"          || track_fail "Missing: Original Agreement"
echo "$DOC_DATA" | grep -q "Original Credit Application"               && track_pass "Base: Original Credit Application ✓" || track_fail "Missing: Original Credit Application"
echo "$DOC_DATA" | grep -q "Copy of the Letter of Demand"              && track_pass "Base: Letter of Demand ✓"            || track_fail "Missing: Letter of Demand"
echo "$DOC_DATA" | grep -q "Original Postal Article receipt"           && track_pass "Base: Postal Receipt ✓"              || track_fail "Missing: Postal Receipt"
echo "$DOC_DATA" | grep -q "NIC"                                       && track_pass "Individual: NIC ✓"                   || track_fail "Missing: NIC"
echo "$DOC_DATA" | grep -q "Other (Individual)"                        && track_pass "Individual: Other ✓"                 || track_fail "Missing: Other (Individual)"
echo "$DOC_DATA" | grep -q "Incorporation Certificate"                 && track_fail "WRONG: Company doc in Individual sub" || track_pass "No Company doc contamination ✓"

subsect "G2: Company — base docs + Company-specific docs"
RES=$(make_sub "LHD_QA_F3_DOCS_CO_001" "PENDING_APPROVAL" "Company")
DOCS_CO=$(get_id "$RES")
CO_DOC_DATA=$(get_sub $DOCS_CO | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['label'])
")
CO_DOC_COUNT=$(get_sub $DOCS_CO | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
info "Form 3 Company doc count: $CO_DOC_COUNT"
[ "$CO_DOC_COUNT" -gt "0" ] && track_pass "Company docs created: $CO_DOC_COUNT ✓" || track_fail "No company docs created"
echo "$CO_DOC_DATA" | grep -q "Incorporation Certificate"              && track_pass "Company: Incorporation Certificate ✓" || track_fail "Missing: Incorporation Certificate"
echo "$CO_DOC_DATA" | grep -q "Form 1, 13"                            && track_pass "Company: Form 1/13 ✓"                 || track_fail "Missing: Form 1/13"
echo "$CO_DOC_DATA" | grep -q "NIC (Individual owner)"                && track_fail "WRONG: Individual doc in Company sub"  || track_pass "No Individual doc contamination ✓"

subsect "G3: Partnership — partnership-specific docs"
RES=$(make_sub "LHD_QA_F3_DOCS_PART_001" "PENDING_APPROVAL" "Partnership")
DOCS_PART=$(get_id "$RES")
PART_DOC_DATA=$(get_sub $DOCS_PART | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['label'])
")
echo "$PART_DOC_DATA" | grep -q "Partnership registration"             && track_pass "Partnership: Registration cert ✓"    || track_fail "Missing: Partnership registration"
echo "$PART_DOC_DATA" | grep -q "NIC/passport copies of every partner" && track_pass "Partnership: Partner NICs ✓"        || track_fail "Missing: Partner NICs"

subsect "G4: Sole-proprietorship — sole proprietor docs"
RES=$(make_sub "LHD_QA_F3_DOCS_SOLE_001" "PENDING_APPROVAL" "Sole-proprietorship")
DOCS_SOLE=$(get_id "$RES")
SOLE_DOC_DATA=$(get_sub $DOCS_SOLE | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['label'])
")
echo "$SOLE_DOC_DATA" | grep -q "NIC/passport of the sole proprietor"  && track_pass "Sole: NIC/passport ✓"               || track_fail "Missing: Sole proprietor NIC"
echo "$SOLE_DOC_DATA" | grep -q "Business registration"                && track_pass "Sole: Business registration ✓"      || track_fail "Missing: Business registration"

subsect "G5: Update document status"
DOC_ID=$(get_sub $DOCS_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[0]['id'] if docs else '')")
[ -n "$DOC_ID" ] && track_pass "Got document ID: $DOC_ID" || track_fail "No document ID"
DOC_UPD=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$DOCS_SUB" \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":\"$DOC_ID\",\"documentStatus\":\"APPROVED\",\"documentComment\":\"Verified\"}")
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
    \"submissionNo\": \"LHD_QA_F3_HAPPY_001_R1\",
    \"formId\": 3, \"formName\": \"Instruction For Litigation\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"DM01\", \"title\": \"Instruction For Litigation\",
    \"sapCostCenter\": \"000003999\",
    \"scopeOfAgreement\": \"{\\\"demandDate\\\":\\\"2026-02-01\\\",\\\"customerType\\\":\\\"Individual\\\",\\\"customerData\\\":{\\\"customerName\\\":\\\"John Silva Updated\\\",\\\"outstandingAmount\\\":\\\"300000\\\"}}\",
    \"term\": \"2026-02-01\", \"lkrValue\": \"300000\",
    \"remarks\": \"Resubmission\", \"initiatorComments\": \"\",
    \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\",
    \"parties\": [{\"type\": \"Individual\", \"name\": \"John Silva\"}],
    \"parentId\": \"$SUB\", \"isResubmission\": true
  }")
RID=$(get_id "$RESUB")
RPARENT=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('parentId',''))")
RFLAG=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isResubmission',''))")
[ -n "$RID" ]           && track_pass "Resubmission created: $RID ✓" || track_fail "Resubmission failed"
[ "$RPARENT" = "$SUB" ] && track_pass "parentId linked ✓"             || track_fail "parentId wrong: $RPARENT"
[ "$RFLAG" = "True" ]   && track_pass "isResubmission = True ✓"       || track_fail "isResubmission flag wrong: $RFLAG"

subsect "H2: Mark original as RESUBMITTED"
MR=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}')
api_ok "$MR" && track_pass "Original marked RESUBMITTED ✓" || track_fail "Mark resubmitted failed"

subsect "H3: RESUBMITTED submissions filtered from API list"
RESUB_IN_LIST=$(curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions" | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
found=[s for s in data if s.get('status')=='RESUBMITTED']
print(len(found))")
[ "$RESUB_IN_LIST" -eq "0" ] && track_pass "RESUBMITTED filtered from list ✓" || track_fail "API returns $RESUB_IN_LIST RESUBMITTED submissions"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST I: Comments"
# ══════════════════════════════════════════════════════════════════════════════

subsect "I1: Legal GM posts comment"
CMT_RES=$(curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dinali Gurusinghe","authorRole":"LEGAL_GM","text":"Please ensure all originals are submitted."}')
api_ok "$CMT_RES" && track_pass "GM comment posted ✓" || track_fail "GM comment failed"

subsect "I2: Court Officer posts comment"
CMT_CO=$(curl -s -b /tmp/c_co.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Ruwan Fernando","authorRole":"COURT_OFFICER","text":"Case number assigned."}')
api_ok "$CMT_CO" && track_pass "Court Officer comment posted ✓" || track_fail "CO comment failed"

subsect "I3: Verify both comments appear"
CMT_COUNT=$(get_sub $RID | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT" -ge "2" ] && track_pass "Comments visible ($CMT_COUNT) ✓" || track_fail "Expected 2+ comments, got $CMT_COUNT"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST J: API Edge Cases"
# ══════════════════════════════════════════════════════════════════════════════

subsect "J1: GET non-existent → 404"
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions/nonexistent_xyz_003")
[ "$R" = "404" ] && track_pass "Non-existent returns 404 ✓" || track_fail "Expected 404, got $R"

subsect "J2: POST missing required fields → error"
BAD=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"formId":3}')
BAD_OK=$(echo $BAD | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$BAD_OK" = "False" ] && track_pass "Missing fields returns error ✓" || track_fail "Expected error for missing fields"

subsect "J3: Unauthenticated approve → 401"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"BUM","action":"APPROVED"}')
[ "$UNAUTH" = "401" ] && track_pass "Unauthenticated returns 401 ✓" || track_fail "Expected 401, got $UNAUTH"

subsect "J4: Duplicate submission number → conflict"
DUP=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F3_HAPPY_001\",
    \"formId\": 3, \"formName\": \"Instruction For Litigation\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test\",
    \"companyCode\": \"DM01\", \"title\": \"X\", \"sapCostCenter\": \"X\",
    \"scopeOfAgreement\": \"{}\", \"term\": \"\", \"lkrValue\": \"\",
    \"remarks\": \"\", \"initiatorComments\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\",
    \"parties\": []
  }")
DUP_OK=$(echo $DUP | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$DUP_OK" = "False" ] && track_pass "Duplicate rejected ✓" || track_fail "Expected conflict for duplicate"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST K: Form 3 Workflow Isolation Checks"
# ══════════════════════════════════════════════════════════════════════════════

subsect "K1: Exactly 2 approvals (BUM+FBP), not 3 or 4"
RES=$(make_sub "LHD_QA_F3_ISO_001" "PENDING_APPROVAL")
ISO=$(get_id "$RES")
APP_COUNT=$(get_sub $ISO | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
[ "$APP_COUNT" -eq "2" ] && track_pass "Form 3 has exactly 2 approvals ✓" || track_fail "Expected 2, got $APP_COUNT"

subsect "K2: loStage initialises as PENDING_LEGAL_GM (not PENDING_GM like Form 1)"
INIT_LO=$(get_sub $ISO | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('loStage',''))")
[ "$INIT_LO" = "PENDING_LEGAL_GM" ] && track_pass "loStage = PENDING_LEGAL_GM ✓" || track_fail "Expected PENDING_LEGAL_GM, got $INIT_LO"

subsect "K3: BUM+FBP → PENDING_LEGAL_GM (no CEO step)"
approve /tmp/c_bum.txt $ISO BUM APPROVED "BUM"
approve /tmp/c_fbp.txt $ISO FBP APPROVED "FBP"
check_status $ISO "PENDING_LEGAL_GM"

subsect "K4: GM initial approval → loStage = ASSIGN_COURT_OFFICER (unique to Form 3)"
approve /tmp/c_lgm.txt $ISO LEGAL_GM APPROVED "Legal GM initial approval"
check_lo_stage $ISO "ASSIGN_COURT_OFFICER"

subsect "K5: GM final approval → PENDING_COURT_OFFICER (Form 2 goes to PENDING_LEGAL_OFFICER)"
RES=$(make_sub "LHD_QA_F3_ISO_002" "PENDING_LEGAL_GM_FINAL")
ISO2=$(get_id "$RES")
curl -s -b /tmp/c_lgm.txt -X PATCH "$BASE/api/submissions/$ISO2" \
  -H "Content-Type: application/json" \
  -d '{"legalGmStage":"FINAL_APPROVAL"}' > /dev/null
approve /tmp/c_lgm.txt $ISO2 LEGAL_GM APPROVED "Legal GM final approval"
check_status $ISO2 "PENDING_COURT_OFFICER"

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
echo -e "  Parallel:      $PAR | $PAR_CH"
echo -e "  Resubmission:  $RID"
echo -e "  Spec Approver: $SA_LGM | CO path: $SA_CO"
echo -e "  Send-backs:    BUM=$SB_BUM | FBP=$SB_FBP | LGM=$SB_LGM | CO=$SB_CO | LO=$SB_LO"
echo -e "  Cancelled:     $CAN | $CAN2 | $CAN3"
echo -e "  Isolation:     $ISO | $ISO2"
echo ""
if [ "$FAIL_COUNT" -eq "0" ]; then
  echo -e "${GREEN}  🎉 ALL TESTS PASSED — Form 3 is fully verified!${NC}"
else
  echo -e "${RED}  ⚠️  $FAIL_COUNT test(s) failed — review ❌ above${NC}"
fi
echo ""