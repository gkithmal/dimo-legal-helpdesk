#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# Form 10 Full QA Test Suite — Instruction to Issue Letter of Demand
# USAGE: bash tests/form10-qa/test_form10_full_qa.sh
# Run from project root. Dev server must be running: npm run dev
#
# Workflow (identical to Form 3 — isForm3 = true):
#   Initiator → BUM + FBP (parallel, NO Cluster Head, NO CEO)
#   → Legal GM (initial) → Legal Officer (ASSIGN_COURT_OFFICER)
#   → Court Officer (work) → Legal Officer (REVIEW_FOR_GM)
#   → Legal Officer (SUBMIT_TO_LEGAL_GM) → Legal GM (final)
#   → Court Officer (POST_GM_APPROVAL) → Legal Officer (FINALIZATION) → COMPLETED
# ══════════════════════════════════════════════════════════════════════════════

BASE="http://localhost:3000"

if ! curl -s --max-time 3 "$BASE/api/auth/csrf" > /dev/null 2>&1; then
  echo -e "\033[0;31m❌ Dev server is not running. Start it with: npm run dev\033[0m"
  exit 1
fi

# ─── Cleanup ──────────────────────────────────────────────────────────────────
echo -e "\n\033[1;33m🧹 Cleaning up previous QA test data...\033[0m"
npx prisma db execute --stdin <<'SQL' 2>/dev/null
DELETE FROM "submission_parties"           WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F10_%');
DELETE FROM "submission_approvals"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F10_%');
DELETE FROM "submission_documents"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F10_%');
DELETE FROM "submission_comments"          WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F10_%');
DELETE FROM "submission_special_approvers" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F10_%');
DELETE FROM "submissions"                  WHERE "submissionNo" LIKE 'LHD_QA_F10_%';
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
get_sub()   { curl -s -b /tmp/c_f10_initiator.txt "$BASE/api/submissions/$1"; }
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

# ─── Form 10 submission factory ───────────────────────────────────────────────
# scopeOfAgreement holds JSON meta: customerType, customerData, legalHistory, etc.
make_f10() {
  local NO=$1 STATUS=$2 CTYPE=${3:-"Individual"}
  local CNAME="John Silva"
  [ "$CTYPE" = "Company" ] && CNAME="ACME Holdings Ltd"
  [ "$CTYPE" = "Sole-proprietorship" ] && CNAME="John Silva"
  [ "$CTYPE" = "Partnership" ] && CNAME="Silva & Partners"

  curl -s -b /tmp/c_f10_initiator.txt -X POST "$BASE/api/submissions" \
    -H "Content-Type: application/json" \
    -d "{
      \"submissionNo\": \"$NO\",
      \"formId\": 10,
      \"formName\": \"Instruction to Issue Letter of Demand\",
      \"status\": \"$STATUS\",
      \"initiatorId\": \"$INITIATOR_ID\",
      \"initiatorName\": \"Test Initiator\",
      \"companyCode\": \"DM01\",
      \"sapCostCenter\": \"000003999\",
      \"title\": \"Instruction to Issue Letter of Demand\",
      \"scopeOfAgreement\": \"{\\\"initiatorName\\\":\\\"Test Initiator\\\",\\\"initiatorContact\\\":\\\"+94771234567\\\",\\\"managerInCharge\\\":\\\"Test Manager\\\",\\\"officerInCharge\\\":\\\"Test Officer\\\",\\\"clusterNo\\\":\\\"CLU001\\\",\\\"customerType\\\":\\\"$CTYPE\\\",\\\"customerData\\\":{\\\"customerName\\\":\\\"$CNAME\\\",\\\"nicNo\\\":\\\"801234567V\\\",\\\"residentialAddress\\\":\\\"123 Main St, Colombo\\\",\\\"ownerName\\\":\\\"$CNAME\\\",\\\"contactNo\\\":\\\"+94771234567\\\",\\\"emailAddress\\\":\\\"customer@test.com\\\",\\\"outstandingAmount\\\":\\\"350000\\\"},\\\"legalHistory\\\":[]}\",
      \"term\": \"\",
      \"value\": \"350000\",
      \"remarks\": \"QA Test Submission\",
      \"legalOfficerId\": \"\",
      \"bumId\": \"$BUM_ID\",
      \"fbpId\": \"$FBP_ID\",
      \"parties\": [{\"type\": \"$CTYPE\", \"name\": \"$CNAME\"}]
    }"
}

# ══════════════════════════════════════════════════════════════════════════════
section "STEP 0: Environment Setup"
# ══════════════════════════════════════════════════════════════════════════════

# Bootstrap login to fetch user IDs
CSRF=$(curl -s -c /tmp/c_f10_initiator.txt "$BASE/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -c /tmp/c_f10_initiator.txt -b /tmp/c_f10_initiator.txt -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=oliva.perera@testdimo.com" \
  --data-urlencode "password=Test@1234" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "json=true" -L > /dev/null

USERS=$(curl -s -b /tmp/c_f10_initiator.txt "$BASE/api/users?includeInactive=true")
uid() { echo $USERS | python3 -c "import sys,json; u=[x for x in json.load(sys.stdin).get('data',[]) if x.get('email')=='$1']; print(u[0]['id'] if u else '')"; }

INITIATOR_ID=$(uid "oliva.perera@testdimo.com")
BUM_ID=$(uid "grace.perera@testdimo.com")
FBP_ID=$(uid "madurika.sama@testdimo.com")
LO_ID=$(uid "sandalie.gomes@testdimo.com")
LGM_ID=$(uid "dinali.guru@testdimo.com")
CO_ID=$(uid "court.officer@testdimo.com")
SA_ID=$(uid "special.approver@testdimo.com")

[ -n "$INITIATOR_ID" ] && track_pass "Initiator ID:     $INITIATOR_ID" || { track_fail "Initiator not found"; exit 1; }
[ -n "$BUM_ID"  ]      && track_pass "BUM ID:           $BUM_ID"       || { track_fail "BUM not found"; exit 1; }
[ -n "$FBP_ID"  ]      && track_pass "FBP ID:           $FBP_ID"       || { track_fail "FBP not found"; exit 1; }
[ -n "$LO_ID"   ]      && track_pass "Legal Officer:    $LO_ID"        || { track_fail "Legal Officer not found"; exit 1; }
[ -n "$LGM_ID"  ]      && track_pass "Legal GM:         $LGM_ID"       || { track_fail "Legal GM not found"; exit 1; }
[ -n "$CO_ID"   ]      && track_pass "Court Officer:    $CO_ID"        || { track_fail "Court Officer not found"; exit 1; }
[ -n "$SA_ID"   ]      && track_pass "Special Approver: $SA_ID"        || track_fail "Special Approver not found (non-fatal)"

subsect "Login all roles"
login "oliva.perera@testdimo.com"     /tmp/c_f10_initiator.txt
login "grace.perera@testdimo.com"     /tmp/c_f10_bum.txt
login "madurika.sama@testdimo.com"    /tmp/c_f10_fbp.txt
login "dinali.guru@testdimo.com"      /tmp/c_f10_lgm.txt
login "sandalie.gomes@testdimo.com"   /tmp/c_f10_lo.txt
login "court.officer@testdimo.com"    /tmp/c_f10_co.txt
login "special.approver@testdimo.com" /tmp/c_f10_sa.txt

# ══════════════════════════════════════════════════════════════════════════════
section "TEST A: Full Happy Path — End to End (Individual customer)"
# ══════════════════════════════════════════════════════════════════════════════

subsect "A1: Initiator creates Form 10 submission"
RES=$(make_f10 "LHD_QA_F10_HAPPY_001" "PENDING_APPROVAL" "Individual")
SUB=$(get_id "$RES")
SUB_NO=$(echo $RES | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('submissionNo','') or d.get('data',{}).get('submissionNo',''))")
[ -n "$SUB" ] && track_pass "Submission created — No: $SUB_NO | ID: $SUB" || { track_fail "Submission creation failed: $RES"; exit 1; }

subsect "A2: Verify initial field values"
check_field "formId"       $SUB "10"
check_field "formName"     $SUB "Instruction to Issue Letter of Demand"
check_field "status"       $SUB "PENDING_APPROVAL"
check_field "loStage"      $SUB "PENDING_LEGAL_GM"
check_field "legalGmStage" $SUB "INITIAL_REVIEW"

# Form 10 has BUM + FBP only (NO CLUSTER_HEAD, NO CEO)
APPROVALS=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
[ "$APPROVALS" -eq "2" ] && track_pass "2 parallel approvals (BUM+FBP only) ✓" || track_fail "Expected 2 approvals for Form 10, got $APPROVALS"

CH_APPROVAL=$(get_sub $SUB | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='CLUSTER_HEAD']))")
[ "$CH_APPROVAL" -eq "0" ] && track_pass "No CLUSTER_HEAD approval row ✓" || track_fail "Form 10 should NOT have CLUSTER_HEAD, got $CH_APPROVAL"

CEO_APPROVAL=$(get_sub $SUB | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='CEO']))")
[ "$CEO_APPROVAL" -eq "0" ] && track_pass "No CEO approval row ✓" || track_fail "Form 10 should NOT have CEO, got $CEO_APPROVAL"

# Verify documents created for Individual customer type
DOCS=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$DOCS" -gt "0" ] && track_pass "Documents auto-created: $DOCS docs ✓" || track_fail "No documents created"

# Verify NIC doc for Individual
NIC_DOC=$(get_sub $SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'NIC' in d.get('label','')]; print(found[0]['label'] if found else '')")
[ -n "$NIC_DOC" ] && track_pass "Individual-specific doc present: '$NIC_DOC' ✓" || track_fail "NIC doc not found for Individual"

subsect "A3: BUM approves"
approve /tmp/c_f10_bum.txt $SUB BUM APPROVED "BUM approval"
check_status $SUB "PENDING_APPROVAL"

subsect "A4: FBP approves — moves straight to PENDING_LEGAL_GM (no CEO, no CH)"
approve /tmp/c_f10_fbp.txt $SUB FBP APPROVED "FBP approval"
check_status $SUB "PENDING_LEGAL_GM"

subsect "A5: Legal GM assigns LO + initial approval — PENDING_LEGAL_OFFICER (ASSIGN_COURT_OFFICER)"
PATCH_R=$(curl -s -b /tmp/c_f10_lgm.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d "{\"assignedLegalOfficer\": \"$LO_ID\"}")
api_ok "$PATCH_R" && track_pass "Legal GM assigned legal officer ✓" || track_fail "Officer assignment failed"
approve /tmp/c_f10_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM initial approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "ASSIGN_COURT_OFFICER"
check_gm_stage $SUB "INITIAL_REVIEW"
check_field "assignedLegalOfficer" $SUB "$LO_ID"

subsect "A6: Legal Officer assigns Court Officer — PENDING_COURT_OFFICER"
CO_ASSIGN=$(curl -s -b /tmp/c_f10_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_OFFICER\",\"action\":\"ASSIGN_COURT_OFFICER\",\"courtOfficerId\":\"$CO_ID\",\"courtOfficerEmail\":\"court.officer@testdimo.com\",\"courtOfficerName\":\"QA Court Officer\"}")
api_ok "$CO_ASSIGN" && track_pass "Court Officer assigned ✓" || { track_fail "CO assignment failed"; echo "  $(echo $CO_ASSIGN | python3 -c 'import sys,json; print(json.load(sys.stdin).get("error",""))' 2>/dev/null)"; }
check_status   $SUB "PENDING_COURT_OFFICER"
check_lo_stage $SUB "PENDING_COURT_OFFICER"

subsect "A7: Verify courtOfficerId saved"
COURT_ID_SAVED=$(get_field "courtOfficerId" $SUB)
[ "$COURT_ID_SAVED" = "$CO_ID" ] && track_pass "courtOfficerId saved correctly ✓" || track_fail "courtOfficerId wrong: $COURT_ID_SAVED"

subsect "A8: Court Officer submits to Legal Officer — PENDING_LEGAL_OFFICER (REVIEW_FOR_GM)"
CO_SUBMIT=$(curl -s -b /tmp/c_f10_co.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"SUBMIT_TO_LEGAL_OFFICER","comment":"LOD draft prepared","approverName":"QA Court Officer"}')
api_ok "$CO_SUBMIT" && track_pass "Court Officer submitted to Legal Officer ✓" || track_fail "CO submit failed"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "REVIEW_FOR_GM"

subsect "A9: Legal Officer submits to Legal GM — PENDING_LEGAL_GM_FINAL"
approve /tmp/c_f10_lo.txt $SUB LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "Legal Officer submit to GM"
check_status   $SUB "PENDING_LEGAL_GM_FINAL"
check_gm_stage $SUB "FINAL_APPROVAL"

subsect "A10: Legal GM final approval — Form 10 (isForm3) → PENDING_COURT_OFFICER (POST_GM_APPROVAL)"
approve /tmp/c_f10_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM final approval"
check_status   $SUB "PENDING_COURT_OFFICER"
check_lo_stage $SUB "POST_GM_APPROVAL"

subsect "A11: Court Officer final submit — PENDING_LEGAL_OFFICER (FINALIZATION)"
CO_FINAL=$(curl -s -b /tmp/c_f10_co.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"SUBMIT_TO_LEGAL_OFFICER","comment":"LOD issued and sent","approverName":"QA Court Officer"}')
api_ok "$CO_FINAL" && track_pass "Court Officer final submit ✓" || track_fail "CO final submit failed"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "FINALIZATION"

subsect "A12: Legal Officer marks COMPLETED"
COMP_RES=$(curl -s -b /tmp/c_f10_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"COMPLETED","comment":"LOD finalization complete","approverName":"Sandalie Gomes"}')
api_ok "$COMP_RES" && track_pass "Legal Officer COMPLETED ✓" || track_fail "LO COMPLETED failed"
check_status $SUB "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST B: Customer Type — Company (different docs)"
# ══════════════════════════════════════════════════════════════════════════════

subsect "B1: Submit Form 10 with Company customer"
RES=$(make_f10 "LHD_QA_F10_CO_001" "PENDING_APPROVAL" "Company")
CO_SUB=$(get_id "$RES")
[ -n "$CO_SUB" ] && track_pass "Company submission: $CO_SUB" || track_fail "Company submission failed"
check_status $CO_SUB "PENDING_APPROVAL"

# Verify company-specific docs
INC_DOC=$(get_sub $CO_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'Incorporation' in d.get('label','')]; print(found[0]['label'] if found else '')")
[ -n "$INC_DOC" ] && track_pass "Company doc 'Incorporation Certificate' present ✓" || track_fail "Incorporation Certificate doc not found"

subsect "B2: Submit Form 10 with Partnership customer"
RES=$(make_f10 "LHD_QA_F10_PT_001" "PENDING_APPROVAL" "Partnership")
PT_SUB=$(get_id "$RES")
[ -n "$PT_SUB" ] && track_pass "Partnership submission: $PT_SUB" || track_fail "Partnership submission failed"
PART_DOC=$(get_sub $PT_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'Partnership registration certificate' in d.get('label','')]; print(found[0]['label'] if found else '')")
[ -n "$PART_DOC" ] && track_pass "Partnership doc present ✓" || track_fail "Partnership registration doc not found"

subsect "B3: Submit Form 10 with Sole-proprietorship customer"
RES=$(make_f10 "LHD_QA_F10_SP_001" "PENDING_APPROVAL" "Sole-proprietorship")
SP_SUB=$(get_id "$RES")
[ -n "$SP_SUB" ] && track_pass "Sole-proprietorship submission: $SP_SUB" || track_fail "Sole-proprietorship submission failed"
SP_DOC=$(get_sub $SP_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'sole proprietor' in d.get('label','').lower()]; print(found[0]['label'] if found else '')")
[ -n "$SP_DOC" ] && track_pass "Sole-proprietorship doc present ✓" || track_fail "Sole-proprietorship doc not found"

# Verify base docs are present for all types
subsect "B4: Verify base docs present for all customer types"
for CHECK_SUB in $CO_SUB $PT_SUB $SP_SUB; do
  BASE_DOC=$(get_sub $CHECK_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'Original Agreement' in d.get('label','')]; print(found[0]['label'] if found else '')")
  [ -n "$BASE_DOC" ] && track_pass "Base doc 'Original Agreement' present for $CHECK_SUB ✓" || track_fail "Base doc 'Original Agreement' missing for $CHECK_SUB"
done

# ══════════════════════════════════════════════════════════════════════════════
section "TEST C: Draft Save & Edit"
# ══════════════════════════════════════════════════════════════════════════════

subsect "C1: Save as DRAFT"
RES=$(make_f10 "LHD_QA_F10_DRAFT_001" "DRAFT" "Individual")
DR=$(get_id "$RES")
[ -n "$DR" ] && track_pass "Draft created: $DR" || track_fail "Draft creation failed"
check_status $DR "DRAFT"

subsect "C2: Edit draft — update customerType to Company and promote"
PATCH_RES=$(curl -s -b /tmp/c_f10_initiator.txt -X PATCH "$BASE/api/submissions/$DR" \
  -H "Content-Type: application/json" \
  -d '{"status":"PENDING_APPROVAL","scopeOfAgreement":"{\"initiatorName\":\"Test Initiator\",\"customerType\":\"Company\",\"customerData\":{\"companyName\":\"New Company Ltd\",\"outstandingAmount\":\"750000\"}}","value":"750000"}')
api_ok "$PATCH_RES" && track_pass "Draft PATCH succeeded ✓" || track_fail "Draft edit failed"
check_status $DR "PENDING_APPROVAL"

subsect "C3: Verify updated meta saved"
UPDATED_SCOPE=$(get_sub $DR | python3 -c "
import sys,json
d=json.load(sys.stdin)
try:
  s=json.loads(d.get('data',{}).get('scopeOfAgreement','{}'))
  print(s.get('customerType',''))
except:
  print('')
" 2>/dev/null)
[ "$UPDATED_SCOPE" = "Company" ] && track_pass "Updated customerType saved ✓" || track_fail "customerType not updated: $UPDATED_SCOPE"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST D: Send Back Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "D1: BUM sends back"
RES=$(make_f10 "LHD_QA_F10_SB_BUM_001" "PENDING_APPROVAL")
SB_BUM=$(get_id "$RES")
approve /tmp/c_f10_bum.txt $SB_BUM BUM SENT_BACK "BUM send-back"
check_status $SB_BUM "SENT_BACK"

subsect "D2: FBP sends back"
RES=$(make_f10 "LHD_QA_F10_SB_FBP_001" "PENDING_APPROVAL")
SB_FBP=$(get_id "$RES")
approve /tmp/c_f10_fbp.txt $SB_FBP FBP SENT_BACK "FBP send-back"
check_status $SB_FBP "SENT_BACK"

subsect "D3: Legal GM sends back at initial review"
RES=$(make_f10 "LHD_QA_F10_SB_LGM_001" "PENDING_LEGAL_GM")
SB_LGM=$(get_id "$RES")
approve /tmp/c_f10_lgm.txt $SB_LGM LEGAL_GM SENT_BACK "Legal GM send-back"
check_status $SB_LGM "SENT_BACK"

subsect "D4: Legal Officer returns to initiator (RETURNED_TO_INITIATOR)"
RES=$(make_f10 "LHD_QA_F10_SB_LO_001" "PENDING_LEGAL_OFFICER")
SB_LO=$(get_id "$RES")
R=$(curl -s -b /tmp/c_f10_lo.txt -X POST "$BASE/api/submissions/$SB_LO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"RETURNED_TO_INITIATOR","comment":"Outstanding amount unclear","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "Legal Officer return to initiator ✓" || track_fail "LO return failed"
check_status $SB_LO "SENT_BACK"

subsect "D5: Court Officer sends back"
RES=$(make_f10 "LHD_QA_F10_SB_CO_001" "PENDING_COURT_OFFICER")
SB_CO=$(get_id "$RES")
# Patch courtOfficerId so CO role is recognized
curl -s -b /tmp/c_f10_lgm.txt -X PATCH "$BASE/api/submissions/$SB_CO" \
  -H "Content-Type: application/json" \
  -d "{\"courtOfficerId\":\"$CO_ID\"}" > /dev/null
CO_SB=$(curl -s -b /tmp/c_f10_co.txt -X POST "$BASE/api/submissions/$SB_CO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"SENT_BACK","comment":"Insufficient evidence","approverName":"QA Court Officer"}')
api_ok "$CO_SB" && track_pass "Court Officer sent back ✓" || track_fail "CO send-back failed"
check_status $SB_CO "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST E: Cancellation Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "E1: BUM cancels"
RES=$(make_f10 "LHD_QA_F10_CANCEL_001" "PENDING_APPROVAL")
CAN=$(get_id "$RES")
approve /tmp/c_f10_bum.txt $CAN BUM CANCELLED "BUM cancellation"
check_status $CAN "CANCELLED"

subsect "E2: FBP cancels"
RES=$(make_f10 "LHD_QA_F10_CANCEL_002" "PENDING_APPROVAL")
CAN2=$(get_id "$RES")
approve /tmp/c_f10_fbp.txt $CAN2 FBP CANCELLED "FBP cancellation"
check_status $CAN2 "CANCELLED"

subsect "E3: Legal GM cancels at initial review"
RES=$(make_f10 "LHD_QA_F10_CANCEL_003" "PENDING_LEGAL_GM")
CAN3=$(get_id "$RES")
approve /tmp/c_f10_lgm.txt $CAN3 LEGAL_GM CANCELLED "Legal GM cancellation"
check_status $CAN3 "CANCELLED"

subsect "E4: Legal Officer cancels"
RES=$(make_f10 "LHD_QA_F10_CANCEL_004" "PENDING_LEGAL_OFFICER")
CAN4=$(get_id "$RES")
R=$(curl -s -b /tmp/c_f10_lo.txt -X POST "$BASE/api/submissions/$CAN4/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"CANCELLED","comment":"Cancelled by LO","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "LO cancellation ✓" || track_fail "LO cancellation failed"
check_status $CAN4 "CANCELLED"

subsect "E5: Court Officer cancels"
RES=$(make_f10 "LHD_QA_F10_CANCEL_005" "PENDING_COURT_OFFICER")
CAN5=$(get_id "$RES")
curl -s -b /tmp/c_f10_lgm.txt -X PATCH "$BASE/api/submissions/$CAN5" \
  -H "Content-Type: application/json" \
  -d "{\"courtOfficerId\":\"$CO_ID\"}" > /dev/null
CO_CANCEL=$(curl -s -b /tmp/c_f10_co.txt -X POST "$BASE/api/submissions/$CAN5/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"CANCELLED","comment":"Case withdrawn","approverName":"QA Court Officer"}')
api_ok "$CO_CANCEL" && track_pass "Court Officer cancellation ✓" || track_fail "CO cancellation failed"
check_status $CAN5 "CANCELLED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST F: Special Approver — Court Officer Path"
# ══════════════════════════════════════════════════════════════════════════════

subsect "F1: Court Officer assigns Special Approver"
RES=$(make_f10 "LHD_QA_F10_SA_001" "PENDING_COURT_OFFICER")
SA_SUB=$(get_id "$RES")
curl -s -b /tmp/c_f10_lgm.txt -X PATCH "$BASE/api/submissions/$SA_SUB" \
  -H "Content-Type: application/json" \
  -d "{\"courtOfficerId\":\"$CO_ID\"}" > /dev/null
CO_SA_RES=$(curl -s -b /tmp/c_f10_co.txt -X POST "$BASE/api/submissions/$SA_SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"ASSIGN_SPECIAL_APPROVER","specialApproverEmail":"special.approver@testdimo.com","specialApproverName":"Special Approver","approverName":"QA Court Officer"}')
api_ok "$CO_SA_RES" && track_pass "Court Officer assigned special approver ✓" || track_fail "CO special approver assignment failed"
check_status   $SA_SUB "PENDING_SPECIAL_APPROVER"
check_lo_stage $SA_SUB "PENDING_COURT_OFFICER"

subsect "F2: Special Approver approves — returns to Court Officer"
SA_APP=$(curl -s -b /tmp/c_f10_sa.txt -X POST "$BASE/api/submissions/$SA_SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_APP" && track_pass "Special Approver approved ✓" || track_fail "Special Approver approval failed"
check_status $SA_SUB "PENDING_COURT_OFFICER"

subsect "F3: Special Approver sends back"
RES=$(make_f10 "LHD_QA_F10_SA_SB_001" "PENDING_COURT_OFFICER")
SA_SB=$(get_id "$RES")
curl -s -b /tmp/c_f10_lgm.txt -X PATCH "$BASE/api/submissions/$SA_SB" \
  -H "Content-Type: application/json" \
  -d "{\"courtOfficerId\":\"$CO_ID\"}" > /dev/null
curl -s -b /tmp/c_f10_co.txt -X POST "$BASE/api/submissions/$SA_SB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"ASSIGN_SPECIAL_APPROVER","specialApproverEmail":"special.approver@testdimo.com","specialApproverName":"Special Approver","approverName":"QA Court Officer"}' > /dev/null
SA_SB_RES=$(curl -s -b /tmp/c_f10_sa.txt -X POST "$BASE/api/submissions/$SA_SB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"SENT_BACK","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_SB_RES" && track_pass "Special Approver sent back ✓" || track_fail "SA send-back failed"
check_status $SA_SB "SENT_BACK"

# ═══════════════════════════════════════════��══════════════════════════════════
section "TEST G: Parallel Approval Logic (BUM+FBP only)"
# ══════════════════════════════════════════════════════════════════════════════

subsect "G1: Only BUM approves — stays PENDING_APPROVAL"
RES=$(make_f10 "LHD_QA_F10_PAR_001" "PENDING_APPROVAL")
PAR=$(get_id "$RES")
approve /tmp/c_f10_bum.txt $PAR BUM APPROVED "BUM only approval"
check_status $PAR "PENDING_APPROVAL"

subsect "G2: FBP approves — now both approved → moves to PENDING_LEGAL_GM (not PENDING_CEO)"
approve /tmp/c_f10_fbp.txt $PAR FBP APPROVED "FBP approval — triggers transition"
check_status $PAR "PENDING_LEGAL_GM"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST H: Document Management"
# ══════════════════════════════════════════════════════════════════════════════

subsect "H1: Upload document fileUrl"
RES=$(make_f10 "LHD_QA_F10_DOCS_001" "PENDING_APPROVAL")
DOCS_SUB=$(get_id "$RES")
DOC_ID=$(get_sub $DOCS_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[0]['id'] if docs else '')")
[ -n "$DOC_ID" ] && track_pass "Got document ID: $DOC_ID" || track_fail "No document ID found"
DOC_UPD=$(curl -s -b /tmp/c_f10_initiator.txt -X PATCH "$BASE/api/submissions/$DOCS_SUB" \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":\"$DOC_ID\",\"fileUrl\":\"https://test.example.com/original-agreement.pdf\"}")
api_ok "$DOC_UPD" && track_pass "Document fileUrl updated ✓" || track_fail "Document update FAILED"
DOC_URL=$(get_sub $DOCS_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
d=[x for x in docs if x['id']=='$DOC_ID']
print(d[0].get('fileUrl','') if d else '')
")
[ "$DOC_URL" = "https://test.example.com/original-agreement.pdf" ] && track_pass "fileUrl persisted ✓" || track_fail "fileUrl wrong: $DOC_URL"

subsect "H2: Verify all base required doc labels present"
DOC_LABELS=$(get_sub $DOCS_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
print('|'.join(d['label'] for d in docs))
")
for EXPECTED in "Original Agreement (if any)" "Original Credit Application" "Copies of Letters Sent to the Customer" "Original Letters Sent by the Customer" "Originals Documents referred to in the Account statement"; do
  echo "$DOC_LABELS" | grep -q "$EXPECTED" \
    && track_pass "Base doc '$EXPECTED' present ✓" \
    || track_fail "Base doc '$EXPECTED' MISSING"
done

# ══════════════════════════════════════════════════════════════════════════════
section "TEST I: Resubmission"
# ══════════════════════════════════════════════════════════════════════════════

subsect "I1: Mark original as SENT_BACK then create resubmission"
RES=$(make_f10 "LHD_QA_F10_ORIG_001" "PENDING_APPROVAL")
ORIG=$(get_id "$RES")
approve /tmp/c_f10_bum.txt $ORIG BUM SENT_BACK "BUM sends back original"
check_status $ORIG "SENT_BACK"

RESUB=$(curl -s -b /tmp/c_f10_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F10_ORIG_001_R1\",
    \"formId\": 10,
    \"formName\": \"Instruction to Issue Letter of Demand\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\",
    \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"DM01\",
    \"sapCostCenter\": \"000003999\",
    \"title\": \"Instruction to Issue Letter of Demand\",
    \"scopeOfAgreement\": \"{\\\"customerType\\\":\\\"Individual\\\",\\\"customerData\\\":{\\\"customerName\\\":\\\"John Silva\\\",\\\"outstandingAmount\\\":\\\"400000\\\"}}\",
    \"term\": \"\", \"value\": \"400000\", \"remarks\": \"\", \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\",
    \"parties\": [{\"type\": \"Individual\", \"name\": \"John Silva\"}],
    \"parentId\": \"$ORIG\", \"isResubmission\": true
  }")
RSUB_ID=$(get_id "$RESUB")
RPARENT=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('parentId',''))")
RFLAG=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isResubmission',''))")
[ -n "$RSUB_ID" ]        && track_pass "Resubmission created: $RSUB_ID ✓"  || track_fail "Resubmission FAILED"
[ "$RPARENT" = "$ORIG" ] && track_pass "parentId linked correctly ✓"         || track_fail "parentId wrong: $RPARENT"
[ "$RFLAG" = "True" ]    && track_pass "isResubmission = True ✓"              || track_fail "isResubmission flag wrong: $RFLAG"

subsect "I2: Mark original as RESUBMITTED"
MR=$(curl -s -b /tmp/c_f10_initiator.txt -X PATCH "$BASE/api/submissions/$ORIG" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}')
api_ok "$MR" && track_pass "Original marked RESUBMITTED ✓" || track_fail "Mark RESUBMITTED FAILED"
check_field "status" $ORIG "RESUBMITTED"

subsect "I3: RESUBMITTED not visible in list API"
RESUBMITTED_COUNT=$(curl -s -b /tmp/c_f10_initiator.txt "$BASE/api/submissions" | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
found=[s for s in data if s.get('status')=='RESUBMITTED']
print(len(found))")
[ "$RESUBMITTED_COUNT" -eq "0" ] && track_pass "RESUBMITTED filtered from list ✓" || track_fail "API returns $RESUBMITTED_COUNT RESUBMITTED submissions"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST J: Comments"
# ══════════════════════════════════════════════════════════════════════════════

subsect "J1: Post comment from Legal GM"
CMT=$(curl -s -b /tmp/c_f10_lgm.txt -X POST "$BASE/api/submissions/$SUB/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dinali Gurusinghe","authorRole":"LEGAL_GM","text":"Please attach the original demand letter and all payment records."}')
api_ok "$CMT" && track_pass "Comment posted ✓" || track_fail "Comment post FAILED"

subsect "J2: Comment visible in GET response"
CMT_COUNT=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT" -gt "0" ] && track_pass "Comment visible ($CMT_COUNT) ✓" || track_fail "No comments found"

subsect "J3: Post comment from Court Officer"
CMT2=$(curl -s -b /tmp/c_f10_co.txt -X POST "$BASE/api/submissions/$SUB/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"QA Court Officer","authorRole":"COURT_OFFICER","text":"LOD served to debtor at registered address."}')
api_ok "$CMT2" && track_pass "Court Officer comment posted ✓" || track_fail "CO comment post FAILED"
CMT_COUNT2=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT2" -ge "2" ] && track_pass "Multiple comments visible: $CMT_COUNT2 ✓" || track_fail "Expected ≥2 comments, got $CMT_COUNT2"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST K: API Edge Cases"
# ══════════════════════════════════════════════════════════════════════════════

subsect "K1: GET non-existent submission → 404"
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions/nonexistent_f10_qa_xyz")
[ "$R" = "404" ] && track_pass "Non-existent returns 404 ✓" || track_fail "Expected 404, got $R"

subsect "K2: POST with missing required fields → error"
BAD=$(curl -s -b /tmp/c_f10_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"formId":10}')
BAD_OK=$(echo $BAD | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$BAD_OK" = "False" ] && track_pass "Missing fields returns error ✓" || track_fail "Expected error for missing fields"

subsect "K3: Duplicate submission number → rejected"
DUP=$(make_f10 "LHD_QA_F10_HAPPY_001" "PENDING_APPROVAL")
DUP_OK=$(echo $DUP | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$DUP_OK" = "False" ] && track_pass "Duplicate number rejected ✓" || track_fail "Expected conflict for duplicate"

subsect "K4: Unauthenticated approve → 401"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"BUM","action":"APPROVED"}')
[ "$UNAUTH" = "401" ] && track_pass "Unauthenticated returns 401 ✓" || track_fail "Expected 401, got $UNAUTH"

subsect "K5: GET all submissions — Form 10 entries visible"
ALL=$(curl -s -b /tmp/c_f10_initiator.txt "$BASE/api/submissions")
F10_COUNT=$(echo $ALL | python3 -c "import sys,json; data=json.load(sys.stdin).get('data',[]); print(len([s for s in data if s.get('formId')==10]))")
[ "$F10_COUNT" -gt "0" ] && track_pass "Form 10 submissions visible in list: $F10_COUNT ✓" || track_fail "No Form 10 submissions in list"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST L: Form 10 Isolation — Shares isForm3 path, but separate from Form 3"
# ══════════════════════════════════════════════════════════════════════════════

subsect "L1: Form 10 has no CLUSTER_HEAD approval (unlike Forms 1/2/4/6)"
RES=$(make_f10 "LHD_QA_F10_ISOLATE_001" "PENDING_APPROVAL")
ISO=$(get_id "$RES")
ISO_CH=$(get_sub $ISO | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='CLUSTER_HEAD']))")
[ "$ISO_CH" -eq "0" ] && track_pass "Form 10 has no CLUSTER_HEAD approval ✓" || track_fail "Expected 0 CH approvals, got $ISO_CH"

subsect "L2: Form 10 LGM initial → loStage = ASSIGN_COURT_OFFICER (isForm3 path)"
approve /tmp/c_f10_bum.txt $ISO BUM APPROVED "BUM"
approve /tmp/c_f10_fbp.txt $ISO FBP APPROVED "FBP"
check_status $ISO "PENDING_LEGAL_GM"
LGM_R=$(curl -s -b /tmp/c_f10_lgm.txt -X POST "$BASE/api/submissions/$ISO/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\"}")
api_ok "$LGM_R" && track_pass "Legal GM initial approval ✓" || track_fail "LGM initial FAILED"
LO_STAGE=$(get_field "loStage" $ISO)
[ "$LO_STAGE" = "ASSIGN_COURT_OFFICER" ] && track_pass "Form 10 loStage = ASSIGN_COURT_OFFICER (isForm3 path) ✓" || track_fail "loStage wrong: $LO_STAGE"

subsect "L3: Form 10 LGM final → PENDING_COURT_OFFICER (not PENDING_LEGAL_OFFICER like Form 1)"
# First advance to final approval stage — assign CO with required courtOfficerId
CO_ASSIGN2=$(curl -s -b /tmp/c_f10_lo.txt -X POST "$BASE/api/submissions/$ISO/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_OFFICER\",\"action\":\"ASSIGN_COURT_OFFICER\",\"courtOfficerId\":\"$CO_ID\"}")
api_ok "$CO_ASSIGN2" && true || true
CO_SUBMIT2=$(curl -s -b /tmp/c_f10_co.txt -X POST "$BASE/api/submissions/$ISO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"COURT_OFFICER","action":"SUBMIT_TO_LEGAL_OFFICER","approverName":"QA Court Officer"}')
api_ok "$CO_SUBMIT2" && true || true
approve /tmp/c_f10_lo.txt $ISO LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "LO submits to LGM"
LGM_FINAL=$(curl -s -b /tmp/c_f10_lgm.txt -X POST "$BASE/api/submissions/$ISO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_GM","action":"APPROVED","approverName":"QA LGM"}')
api_ok "$LGM_FINAL" && track_pass "Legal GM final approval ✓" || track_fail "LGM final FAILED"
AFTER_FINAL=$(get_field "status" $ISO)
[ "$AFTER_FINAL" = "PENDING_COURT_OFFICER" ] && track_pass "Form 10 after LGM final → PENDING_COURT_OFFICER (isForm3 path) ✓" || track_fail "Expected PENDING_COURT_OFFICER, got $AFTER_FINAL"
AFTER_LO_STAGE=$(get_field "loStage" $ISO)
[ "$AFTER_LO_STAGE" = "POST_GM_APPROVAL" ] && track_pass "loStage = POST_GM_APPROVAL ✓" || track_fail "loStage wrong: $AFTER_LO_STAGE"

# ══════════════════════════════════════════════════════════════════════════════
section "FULL QA SUMMARY"
# ══════════════════════════════════════════════════════════════════════════════
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo -e "${YELLOW}  Results: ${GREEN}$PASS_COUNT passed${NC} / ${RED}$FAIL_COUNT failed${NC} / $TOTAL total"
echo ""
echo -e "  ${BLUE}Key submission IDs:${NC}"
echo -e "  Happy path (Individual):  $SUB  ($SUB_NO)"
echo -e "  Company customer:         $CO_SUB"
echo -e "  Partnership customer:     $PT_SUB"
echo -e "  Sole-prop customer:       $SP_SUB"
echo -e "  Draft:                    $DR"
echo -e "  Parallel logic:           $PAR"
echo -e "  Resubmission:             $RSUB_ID  (parent: $ORIG)"
echo -e "  Special Approver:         $SA_SUB"
echo -e "  Isolation:                $ISO"
echo -e "  Send-backs:               BUM=$SB_BUM | FBP=$SB_FBP | LGM=$SB_LGM | LO=$SB_LO | CO=$SB_CO"
echo -e "  Cancellations:            $CAN | $CAN2 | $CAN3 | $CAN4 | $CAN5"
echo ""
if [ "$FAIL_COUNT" -eq "0" ]; then
  echo -e "${GREEN}  🎉 ALL TESTS PASSED — Form 10 is fully verified!${NC}"
else
  echo -e "${RED}  ⚠️  $FAIL_COUNT test(s) failed — review ❌ above${NC}"
fi
echo ""
