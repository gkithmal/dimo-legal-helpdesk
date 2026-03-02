#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# Form 4 Full QA Test Suite — Vehicle Rent Agreement
# USAGE: bash tests/form4-qa/test_form4_full_qa.sh
# Run from project root. Dev server must be running: npm run dev
# ══════════════════════════════════════════════════════════════════════════════

BASE="http://localhost:3000"

if ! curl -s --max-time 3 "$BASE/api/auth/csrf" > /dev/null 2>&1; then
  echo -e "\033[0;31m❌ Dev server is not running. Start it with: npm run dev\033[0m"
  exit 1
fi

echo -e "\033[1;33m🧹 Cleaning up previous Form 4 QA test data...\033[0m"
npx prisma db execute --stdin <<'SQL' 2>/dev/null
DELETE FROM "submission_parties"           WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F4_%');
DELETE FROM "submission_approvals"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F4_%');
DELETE FROM "submission_documents"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F4_%');
DELETE FROM "submission_comments"          WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F4_%');
DELETE FROM "submission_special_approvers" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F4_%');
DELETE FROM "submissions"                  WHERE "submissionNo" LIKE 'LHD_QA_F4_%';
SQL
echo -e "\033[0;32m✅ Cleanup done\033[0m"

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'
NC='\033[0m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'
pass()    { echo -e "${GREEN}✅ $1${NC}"; }
fail()    { echo -e "${RED}❌ $1${NC}"; }
info()    { echo -e "${BLUE}ℹ️  $1${NC}"; }
section() { echo -e "\n${YELLOW}══════════════════════════════════════${NC}";
            echo -e "${YELLOW}  $1${NC}";
            echo -e "${YELLOW}══════════════════════════════════════${NC}"; }
subsect() { echo -e "\n${CYAN}  ── $1 ──${NC}"; }

PASS_COUNT=0; FAIL_COUNT=0
track_pass() { PASS_COUNT=$((PASS_COUNT+1)); pass "$1"; }
track_fail() { FAIL_COUNT=$((FAIL_COUNT+1)); fail "$1"; }

# ── Auth helper ────────────────────────────────────────────────────────────────
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

# ── API helpers ────────────────────────────────────────────────────────────────
get_sub()      { curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions/$1"; }
get_id()       { echo $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))"; }
api_ok()       { echo $1 | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; return $?; }

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
check_scope_field() {
  # Reads a field from the JSON-encoded scopeOfAgreement
  ACTUAL=$(get_sub $2 | python3 -c "
import sys,json
d=json.load(sys.stdin).get('data',{})
try:
    scope=json.loads(d.get('scopeOfAgreement','{}'))
    print(scope.get('$1',''))
except:
    print('')
" 2>/dev/null)
  [ "$ACTUAL" = "$3" ] && track_pass "scope.$1 = '$ACTUAL' ✓" || track_fail "scope.$1: expected '$3', got '$ACTUAL'"
}

approve() {
  local COOKIE=$1 SUB=$2 ROLE=$3 ACTION=$4 LABEL=$5
  R=$(curl -s -b $COOKIE -X POST "$BASE/api/submissions/$SUB/approve" \
    -H "Content-Type: application/json" \
    -d "{\"role\":\"$ROLE\",\"action\":\"$ACTION\",\"comment\":\"Test comment\",\"approverName\":\"Test $ROLE\"}")
  api_ok "$R" && track_pass "$LABEL ✓" || {
    track_fail "$LABEL failed"
    echo "    Error: $(echo $R | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("error","unknown"))' 2>/dev/null)"
  }
}

# ── Form 4 scope payload (vehicle rent agreement fields stored as JSON) ──────
# NOTE: Vehicle Make/Model dropdowns are currently hardcoded in the UI.
#       When these are moved to DB, update MAKE and MODEL values below.
MAKE="TATA"
MODEL="Curvv"
OWNER_TYPE="Company"
OWNER_NAME="Rentalcars (pvt) ltd"

make_sub() {
  local NO=$1 STATUS=$2 OWNER_TYPE_ARG=${3:-"Company"}
  local OWNER_NAME_ARG="Rentalcars (pvt) ltd"
  [ "$OWNER_TYPE_ARG" = "Individual" ]          && OWNER_NAME_ARG="John Silva"
  [ "$OWNER_TYPE_ARG" = "Partnership" ]         && OWNER_NAME_ARG="Silva & Partners"
  [ "$OWNER_TYPE_ARG" = "Sole proprietorship" ] && OWNER_NAME_ARG="John Silva Sole Prop"

  curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
    -H "Content-Type: application/json" \
    -d "{
      \"submissionNo\": \"$NO\",
      \"formId\": 4,
      \"formName\": \"Vehicle Rent Agreement\",
      \"status\": \"$STATUS\",
      \"initiatorId\": \"$INITIATOR_ID\",
      \"initiatorName\": \"Test Initiator\",
      \"companyCode\": \"DM01 - DIMO PLC\",
      \"title\": \"Vehicle Rent Agreement\",
      \"sapCostCenter\": \"000003999 - IT Department\",
      \"scopeOfAgreement\": \"{\\\"ownerType\\\":\\\"$OWNER_TYPE_ARG\\\",\\\"ownerName\\\":\\\"$OWNER_NAME_ARG\\\",\\\"nicNo\\\":\\\"978657354V\\\",\\\"address\\\":\\\"50 Ramya Mawatha, Colombo 10\\\",\\\"contactNo\\\":\\\"+9471345627\\\",\\\"vehicleNo\\\":\\\"CAM9078\\\",\\\"make\\\":\\\"$MAKE\\\",\\\"model\\\":\\\"$MODEL\\\",\\\"chassisNo\\\":\\\"TBN456789X123456\\\",\\\"termOfRent\\\":\\\"Annual\\\",\\\"commencing\\\":\\\"2025-01-09\\\",\\\"monthlyRentalExcl\\\":\\\"100000\\\",\\\"monthlyRentalIncl\\\":\\\"300000\\\",\\\"refundableDeposit\\\":\\\"150000\\\",\\\"maxUsage\\\":\\\"100000\\\",\\\"excessKmRate\\\":\\\"60\\\",\\\"workingHours\\\":\\\"8am - 5pm\\\",\\\"renewalAgreementNo\\\":\\\"00200\\\",\\\"agreementDate\\\":\\\"2025-09-01\\\",\\\"reasonForHiring\\\":\\\"Transport for management team\\\",\\\"specialConditions\\\":\\\"Vehicle must be in good condition\\\"}\",
      \"term\": \"Annual\",
      \"lkrValue\": \"300000\",
      \"remarks\": \"Vehicle Rent Agreement test submission\",
      \"initiatorComments\": \"Transport for management team\",
      \"legalOfficerId\": \"$LO_ID\",
      \"bumId\": \"$BUM_ID\",
      \"fbpId\": \"$FBP_ID\",
      \"clusterHeadId\": \"$CH_ID\",
      \"parties\": [{\"type\": \"$OWNER_TYPE_ARG\", \"name\": \"$OWNER_NAME_ARG\"}]
    }"
}

# ══════════════════════════════════════════════════════════════════════════════
section "STEP 0: Environment Setup"
# ══════════════════════════════════════════════════════════════════════════════

# Pre-login to access /api/users (auth-gated)
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
[ -n "$CH_ID" ]        && track_pass "Cluster Head ID: $CH_ID"     || { track_fail "Cluster Head not found"; exit 1; }
[ -n "$LO_ID" ]        && track_pass "Legal Officer ID: $LO_ID"    || { track_fail "Legal Officer not found"; exit 1; }
[ -n "$SA_ID" ]        && track_pass "Special Approver ID: $SA_ID" || track_fail "Special Approver not found (non-fatal)"

subsect "Login all roles"
login "oliva.perera@testdimo.com"     /tmp/c_initiator.txt
login "grace.perera@testdimo.com"     /tmp/c_bum.txt
login "madurika.sama@testdimo.com"    /tmp/c_fbp.txt
login "mangala.wick@testdimo.com"     /tmp/c_ch.txt
login "dinali.guru@testdimo.com"      /tmp/c_lgm.txt
login "sandalie.gomes@testdimo.com"   /tmp/c_lo.txt
login "special.approver@testdimo.com" /tmp/c_sa.txt

# ══════════════════════════════════════════════════════════════════════════════
section "TEST A: Full Happy Path — End to End"
# ══════════════════════════════════════════════════════════════════════════════

subsect "A1: Initiator creates Form 4 submission"
RES=$(make_sub "LHD_QA_F4_HAPPY_001" "PENDING_APPROVAL" "Company")
SUB=$(get_id "$RES")
SUB_NO=$(echo $RES | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('submissionNo','') or d.get('data',{}).get('submissionNo',''))")
[ -n "$SUB" ] && track_pass "Submission created — No: $SUB_NO | ID: $SUB" || { track_fail "Submission creation failed: $RES"; exit 1; }

subsect "A2: Verify initial field values"
SUB_DATA=$(get_sub $SUB)

chk() {
  V=$(echo $SUB_DATA | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1',''))" 2>/dev/null)
  [ "$V" = "$2" ] && track_pass "$1 = '$V' ✓" || track_fail "$1: expected '$2', got '$V'"
}
chk "formId"    "4"
chk "formName"  "Vehicle Rent Agreement"
chk "status"    "PENDING_APPROVAL"
chk "legalGmStage" "INITIAL_REVIEW"

# Form 4 uses 3 approvals (BUM + FBP + CLUSTER_HEAD) — same as Form 1/2
APPROVALS=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
[ "$APPROVALS" -eq "3" ] && track_pass "3 parallel approvals (BUM+FBP+CH) ✓" || track_fail "Expected 3 approvals for Form 4, got $APPROVALS"

# Verify scopeOfAgreement stores the vehicle fields as JSON
check_scope_field "ownerType"     $SUB "Company"
check_scope_field "vehicleNo"     $SUB "CAM9078"
check_scope_field "make"          $SUB "$MAKE"
check_scope_field "model"         $SUB "$MODEL"
check_scope_field "chassisNo"     $SUB "TBN456789X123456"
check_scope_field "termOfRent"    $SUB "Annual"
check_scope_field "monthlyRentalIncl" $SUB "300000"

DOCS=$(echo $SUB_DATA | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$DOCS" -gt "0" ] && track_pass "Documents auto-created: $DOCS docs ✓" || track_fail "No documents created"

subsect "A3: BUM approves — stays PENDING_APPROVAL (parallel)"
approve /tmp/c_bum.txt $SUB BUM APPROVED "BUM approval"
check_status $SUB "PENDING_APPROVAL"

subsect "A4: FBP approves — stays PENDING_APPROVAL (needs CH too)"
approve /tmp/c_fbp.txt $SUB FBP APPROVED "FBP approval"
check_status $SUB "PENDING_APPROVAL"

subsect "A5: Cluster Head approves — all 3 done → PENDING_LEGAL_GM"
approve /tmp/c_ch.txt $SUB CLUSTER_HEAD APPROVED "Cluster Head approval"
check_status $SUB "PENDING_LEGAL_GM"

subsect "A6: Legal GM — reassign legal officer + OK to Proceed → PENDING_LEGAL_OFFICER"
PATCH_R=$(curl -s -b /tmp/c_lgm.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d "{\"assignedLegalOfficer\": \"$LO_ID\"}")
api_ok "$PATCH_R" && track_pass "Legal GM assigned legal officer ✓" || track_fail "Officer assignment failed"

approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM initial approval (OK to Proceed)"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "INITIAL_REVIEW"
check_gm_stage $SUB "INITIAL_REVIEW"

subsect "A7: Legal Officer reviews docs + submits to Legal GM → PENDING_LEGAL_GM_FINAL"
approve /tmp/c_lo.txt $SUB LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "Legal Officer submits to Legal GM"
check_status   $SUB "PENDING_LEGAL_GM_FINAL"
check_gm_stage $SUB "FINAL_APPROVAL"

subsect "A8: Legal GM final approval → PENDING_LEGAL_OFFICER (FINALIZATION)"
approve /tmp/c_lgm.txt $SUB LEGAL_GM APPROVED "Legal GM final approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "FINALIZATION"

subsect "A9: Legal Officer marks COMPLETED"
COMP_RES=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"COMPLETED","comment":"Agreement executed","approverName":"Sandalie Gomes"}')
api_ok "$COMP_RES" && track_pass "Legal Officer COMPLETED ✓" || track_fail "LO COMPLETED failed"
check_status $SUB "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST B: Scope Fields — Vehicle Details Stored & Retrieved Correctly"
# ══════════════════════════════════════════════════════════════════════════════

subsect "B1: Create submission with full vehicle payload"
RES=$(make_sub "LHD_QA_F4_SCOPE_001" "PENDING_APPROVAL" "Individual")
SCOPE_SUB=$(get_id "$RES")
[ -n "$SCOPE_SUB" ] && track_pass "Scope test submission created ✓" || track_fail "Scope submission failed"

subsect "B2: Verify all vehicle fields round-trip correctly via scopeOfAgreement JSON"
check_scope_field "ownerType"         $SCOPE_SUB "Individual"
check_scope_field "ownerName"         $SCOPE_SUB "John Silva"
check_scope_field "nicNo"             $SCOPE_SUB "978657354V"
check_scope_field "address"           $SCOPE_SUB "50 Ramya Mawatha, Colombo 10"
check_scope_field "contactNo"         $SCOPE_SUB "+9471345627"
check_scope_field "vehicleNo"         $SCOPE_SUB "CAM9078"
check_scope_field "make"              $SCOPE_SUB "$MAKE"
check_scope_field "model"             $SCOPE_SUB "$MODEL"
check_scope_field "chassisNo"         $SCOPE_SUB "TBN456789X123456"
check_scope_field "termOfRent"        $SCOPE_SUB "Annual"
check_scope_field "commencing"        $SCOPE_SUB "2025-01-09"
check_scope_field "monthlyRentalExcl" $SCOPE_SUB "100000"
check_scope_field "monthlyRentalIncl" $SCOPE_SUB "300000"
check_scope_field "refundableDeposit" $SCOPE_SUB "150000"
check_scope_field "maxUsage"          $SCOPE_SUB "100000"
check_scope_field "excessKmRate"      $SCOPE_SUB "60"
check_scope_field "workingHours"      $SCOPE_SUB "8am - 5pm"
check_scope_field "renewalAgreementNo" $SCOPE_SUB "00200"
check_scope_field "agreementDate"     $SCOPE_SUB "2025-09-01"
check_scope_field "reasonForHiring"   $SCOPE_SUB "Transport for management team"
check_scope_field "specialConditions" $SCOPE_SUB "Vehicle must be in good condition"

subsect "B3: PATCH scopeOfAgreement — update a vehicle field"
UPD_R=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$SCOPE_SUB" \
  -H "Content-Type: application/json" \
  -d '{"scopeOfAgreement":"{\"ownerType\":\"Company\",\"ownerName\":\"New Fleet Ltd\",\"vehicleNo\":\"WP-ABC-1234\",\"make\":\"Toyota\",\"model\":\"Hilux\",\"chassisNo\":\"NEW_CHASSIS_001\",\"termOfRent\":\"Monthly\",\"commencing\":\"2026-01-01\",\"monthlyRentalIncl\":\"500000\"}"}')
api_ok "$UPD_R" && track_pass "scopeOfAgreement PATCH succeeded ✓" || track_fail "PATCH failed"

check_scope_field "vehicleNo"  $SCOPE_SUB "WP-ABC-1234"
check_scope_field "make"       $SCOPE_SUB "Toyota"
check_scope_field "model"      $SCOPE_SUB "Hilux"
check_scope_field "ownerName"  $SCOPE_SUB "New Fleet Ltd"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST C: Draft Save & Edit"
# ══════════════════════════════════════════════════════════════════════════════

subsect "C1: Save as DRAFT"
RES=$(make_sub "LHD_QA_F4_DRAFT_001" "DRAFT" "Individual")
DR=$(get_id "$RES")
[ -n "$DR" ] && track_pass "Draft created: $DR ✓" || track_fail "Draft creation failed"
check_status $DR "DRAFT"

subsect "C2: Edit draft vehicle fields"
PATCH_DR=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$DR" \
  -H "Content-Type: application/json" \
  -d '{"scopeOfAgreement":"{\"ownerType\":\"Partnership\",\"ownerName\":\"Silva and Perera Partners\",\"vehicleNo\":\"NC-5678\",\"make\":\"Honda\",\"model\":\"Vezel\",\"chassisNo\":\"DRAFT_CH_001\",\"termOfRent\":\"Quarterly\",\"commencing\":\"2026-06-01\",\"monthlyRentalIncl\":\"200000\"}"}')
api_ok "$PATCH_DR" && track_pass "Draft scope fields updated ✓" || track_fail "Draft edit failed"

check_scope_field "ownerType" $DR "Partnership"
check_scope_field "vehicleNo" $DR "NC-5678"
check_scope_field "termOfRent" $DR "Quarterly"

subsect "C3: Promote draft → PENDING_APPROVAL"
PROMOTE=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$DR" \
  -H "Content-Type: application/json" \
  -d '{"status":"PENDING_APPROVAL"}')
api_ok "$PROMOTE" && track_pass "Draft promoted to PENDING_APPROVAL ✓" || track_fail "Promotion failed"
check_status $DR "PENDING_APPROVAL"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST D: Required Documents — Owner Type Based"
# ══════════════════════════════════════════════════════════════════════════════

subsect "D1: Company owner — base docs + Company-specific docs"
RES=$(make_sub "LHD_QA_F4_DOCS_CO_001" "PENDING_APPROVAL" "Company")
DOCS_CO=$(get_id "$RES")
CO_DOC_DATA=$(get_sub $DOCS_CO | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['label'])
")
CO_DOC_COUNT=$(get_sub $DOCS_CO | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
info "Form 4 Company doc count: $CO_DOC_COUNT"
[ "$CO_DOC_COUNT" -gt "0" ] && track_pass "Company docs created: $CO_DOC_COUNT ✓" || track_fail "No docs created"
echo "$CO_DOC_DATA" | grep -qi "Certificate of Registration"  && track_pass "Base: Certificate of Registration ✓"    || track_fail "Missing: Certificate of Registration"
echo "$CO_DOC_DATA" | grep -qi "Revenue License"              && track_pass "Base: Revenue License ✓"                || track_fail "Missing: Revenue License"
echo "$CO_DOC_DATA" | grep -qi "Vehicle Insurance"            && track_pass "Base: Vehicle Insurance Cover ✓"        || track_fail "Missing: Vehicle Insurance Cover"
echo "$CO_DOC_DATA" | grep -qi "National Identity Card"       && track_pass "Base: National Identity Card ✓"         || track_fail "Missing: National Identity Card of Owner"
echo "$CO_DOC_DATA" | grep -qi "Article of Association"       && track_pass "Company: Article of Association ✓"      || track_fail "Missing: Article of Association"
echo "$CO_DOC_DATA" | grep -qi "Company Registration"         && track_pass "Company: Company Registration Cert ✓"   || track_fail "Missing: Company Registration Certificate"
echo "$CO_DOC_DATA" | grep -qi "Form 20"                      && track_pass "Company: Form 20 ✓"                     || track_fail "Missing: Form 20"

subsect "D2: Individual owner — base docs + Individual-specific docs"
RES=$(make_sub "LHD_QA_F4_DOCS_IND_001" "PENDING_APPROVAL" "Individual")
DOCS_IND=$(get_id "$RES")
IND_DOC_DATA=$(get_sub $DOCS_IND | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['label'])
")
IND_DOC_COUNT=$(get_sub $DOCS_IND | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
info "Form 4 Individual doc count: $IND_DOC_COUNT"
[ "$IND_DOC_COUNT" -gt "0" ] && track_pass "Individual docs created: $IND_DOC_COUNT ✓" || track_fail "No docs"
echo "$IND_DOC_DATA" | grep -qi "Certificate of Registration" && track_pass "Base: Cert of Registration ✓"           || track_fail "Missing: Cert of Registration"
echo "$IND_DOC_DATA" | grep -qi "Revenue License"             && track_pass "Base: Revenue License ✓"                || track_fail "Missing: Revenue License"
echo "$IND_DOC_DATA" | grep -qi "NIC"                         && track_pass "Individual: NIC ✓"                      || track_fail "Missing: NIC (Individual)"
# Ensure no Company doc contamination
echo "$IND_DOC_DATA" | grep -qi "Article of Association"      && track_fail "WRONG: Company doc in Individual sub"   || track_pass "No Company doc contamination ✓"

subsect "D3: Partnership — partnership-specific docs"
RES=$(make_sub "LHD_QA_F4_DOCS_PART_001" "PENDING_APPROVAL" "Partnership")
DOCS_PART=$(get_id "$RES")
PART_DOC_DATA=$(get_sub $DOCS_PART | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['label'])
")
PART_DOC_COUNT=$(get_sub $DOCS_PART | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
info "Form 4 Partnership doc count: $PART_DOC_COUNT"
echo "$PART_DOC_DATA" | grep -qi "Certificate of Registration" && track_pass "Base: Cert of Registration ✓"          || track_fail "Missing: Cert of Registration"
echo "$PART_DOC_DATA" | grep -qi "Partnership"                 && track_pass "Partnership: Registration cert ✓"       || track_fail "Missing: Partnership registration cert"
echo "$PART_DOC_DATA" | grep -qi "passport"                    && track_pass "Partnership: Partner NICs/passports ✓"  || track_fail "Missing: Partner NIC/passport copies"

subsect "D4: Sole proprietorship — sole-specific docs"
RES=$(make_sub "LHD_QA_F4_DOCS_SOLE_001" "PENDING_APPROVAL" "Sole proprietorship")
DOCS_SOLE=$(get_id "$RES")
SOLE_DOC_DATA=$(get_sub $DOCS_SOLE | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
for d in docs: print(d['label'])
")
echo "$SOLE_DOC_DATA" | grep -qi "Certificate of Registration" && track_pass "Base: Cert of Registration ✓"          || track_fail "Missing: Cert of Registration"
echo "$SOLE_DOC_DATA" | grep -qi "sole"                        && track_pass "Sole: Sole proprietor doc ✓"            || track_fail "Missing: Sole proprietorship doc"
echo "$SOLE_DOC_DATA" | grep -qi "Business registration"       && track_pass "Sole: Business registration ✓"         || track_fail "Missing: Business registration"

subsect "D5: Update document status to APPROVED"
DOC_ID=$(get_sub $DOCS_CO | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[0]['id'] if docs else '')")
[ -n "$DOC_ID" ] && track_pass "Got document ID: $DOC_ID" || track_fail "No document ID"
DOC_UPD=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$DOCS_CO" \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":\"$DOC_ID\",\"documentStatus\":\"APPROVED\",\"documentComment\":\"Document verified\"}")
api_ok "$DOC_UPD" && track_pass "Document status updated ✓" || track_fail "Document update failed"

DOC_STATUS=$(get_sub $DOCS_CO | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
d=[x for x in docs if x['id']=='$DOC_ID']
print(d[0]['status'] if d else 'NOT FOUND')
")
[ "$DOC_STATUS" = "APPROVED" ] && track_pass "Document status = APPROVED ✓" || track_fail "Doc status wrong: $DOC_STATUS"

subsect "D6: Mark document as ATTENTION_NEEDED"
DOC_ID2=$(get_sub $DOCS_CO | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[1]['id'] if len(docs)>1 else '')")
if [ -n "$DOC_ID2" ]; then
  DOC_ATT=$(curl -s -b /tmp/c_lo.txt -X PATCH "$BASE/api/submissions/$DOCS_CO" \
    -H "Content-Type: application/json" \
    -d "{\"documentId\":\"$DOC_ID2\",\"documentStatus\":\"ATTENTION_NEEDED\",\"documentComment\":\"Please resubmit cleaner scan\"}")
  api_ok "$DOC_ATT" && track_pass "Document ATTENTION_NEEDED set ✓" || track_fail "ATTENTION_NEEDED update failed"
else
  track_fail "No second document found for ATTENTION_NEEDED test"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "TEST E: Send Back Flows — All Stages"
# ══════════════════════════════════════════════════════════════════════════════

subsect "E1: BUM sends back"
RES=$(make_sub "LHD_QA_F4_SB_BUM_001" "PENDING_APPROVAL" "Company")
SB_BUM=$(get_id "$RES")
approve /tmp/c_bum.txt $SB_BUM BUM SENT_BACK "BUM send-back"
check_status $SB_BUM "SENT_BACK"

subsect "E2: FBP sends back"
RES=$(make_sub "LHD_QA_F4_SB_FBP_001" "PENDING_APPROVAL" "Company")
SB_FBP=$(get_id "$RES")
approve /tmp/c_fbp.txt $SB_FBP FBP SENT_BACK "FBP send-back"
check_status $SB_FBP "SENT_BACK"

subsect "E3: Cluster Head sends back"
RES=$(make_sub "LHD_QA_F4_SB_CH_001" "PENDING_APPROVAL" "Company")
SB_CH=$(get_id "$RES")
approve /tmp/c_ch.txt $SB_CH CLUSTER_HEAD SENT_BACK "Cluster Head send-back"
check_status $SB_CH "SENT_BACK"

subsect "E4: Legal GM sends back (initial review)"
RES=$(make_sub "LHD_QA_F4_SB_LGM_001" "PENDING_LEGAL_GM" "Company")
SB_LGM=$(get_id "$RES")
approve /tmp/c_lgm.txt $SB_LGM LEGAL_GM SENT_BACK "Legal GM send-back"
check_status $SB_LGM "SENT_BACK"

subsect "E5: Legal Officer returns to initiator"
RES=$(make_sub "LHD_QA_F4_SB_LO_001" "PENDING_LEGAL_OFFICER" "Company")
SB_LO=$(get_id "$RES")
R=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SB_LO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"RETURNED_TO_INITIATOR","comment":"Please provide updated vehicle registration","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "Legal Officer returned to initiator ✓" || track_fail "LO return failed"
check_status $SB_LO "SENT_BACK"

subsect "E6: Legal GM sends back (final approval stage)"
RES=$(make_sub "LHD_QA_F4_SB_LGM_FINAL_001" "PENDING_LEGAL_GM_FINAL" "Company")
SB_LGM_F=$(get_id "$RES")
# Set legalGmStage to FINAL_APPROVAL
curl -s -b /tmp/c_lgm.txt -X PATCH "$BASE/api/submissions/$SB_LGM_F" \
  -H "Content-Type: application/json" \
  -d '{"legalGmStage":"FINAL_APPROVAL"}' > /dev/null
approve /tmp/c_lgm.txt $SB_LGM_F LEGAL_GM SENT_BACK "Legal GM final-stage send-back"
check_status $SB_LGM_F "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST F: Parallel Approval Logic — BUM + FBP + Cluster Head"
# ══════════════════════════════════════════════════════════════════════════════

subsect "F1: Only BUM approves — stays PENDING_APPROVAL"
RES=$(make_sub "LHD_QA_F4_PAR_001" "PENDING_APPROVAL" "Company")
PAR=$(get_id "$RES")
approve /tmp/c_bum.txt $PAR BUM APPROVED "BUM only"
check_status $PAR "PENDING_APPROVAL"

subsect "F2: BUM + FBP approve — still needs CH, stays PENDING_APPROVAL"
approve /tmp/c_fbp.txt $PAR FBP APPROVED "FBP joins"
check_status $PAR "PENDING_APPROVAL"

subsect "F3: Cluster Head approves — all 3 done → PENDING_LEGAL_GM"
approve /tmp/c_ch.txt $PAR CLUSTER_HEAD APPROVED "CH triggers transition"
check_status $PAR "PENDING_LEGAL_GM"

subsect "F4: Mixed — CH + FBP approve, then BUM cancels → CANCELLED"
RES=$(make_sub "LHD_QA_F4_PAR_CANCEL_001" "PENDING_APPROVAL" "Company")
PAR_CAN=$(get_id "$RES")
approve /tmp/c_ch.txt  $PAR_CAN CLUSTER_HEAD APPROVED "CH approves"
approve /tmp/c_fbp.txt $PAR_CAN FBP          APPROVED "FBP approves"
approve /tmp/c_bum.txt $PAR_CAN BUM          CANCELLED "BUM cancels (overrides)"
check_status $PAR_CAN "CANCELLED"

subsect "F5: All approve except CH sends back → SENT_BACK"
RES=$(make_sub "LHD_QA_F4_PAR_SB_001" "PENDING_APPROVAL" "Company")
PAR_SB=$(get_id "$RES")
approve /tmp/c_bum.txt $PAR_SB BUM          APPROVED  "BUM approves"
approve /tmp/c_fbp.txt $PAR_SB FBP          APPROVED  "FBP approves"
approve /tmp/c_ch.txt  $PAR_SB CLUSTER_HEAD SENT_BACK "CH sends back"
check_status $PAR_SB "SENT_BACK"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST G: Cancellation — All Stages"
# ══════════════════════════════════════════════════════════════════════════════

subsect "G1: BUM cancels"
RES=$(make_sub "LHD_QA_F4_CAN_001" "PENDING_APPROVAL" "Company")
CAN1=$(get_id "$RES")
approve /tmp/c_bum.txt $CAN1 BUM CANCELLED "BUM cancellation"
check_status $CAN1 "CANCELLED"

subsect "G2: Legal GM cancels (initial review)"
RES=$(make_sub "LHD_QA_F4_CAN_002" "PENDING_LEGAL_GM" "Company")
CAN2=$(get_id "$RES")
approve /tmp/c_lgm.txt $CAN2 LEGAL_GM CANCELLED "Legal GM cancellation"
check_status $CAN2 "CANCELLED"

subsect "G3: Legal Officer cancels"
RES=$(make_sub "LHD_QA_F4_CAN_003" "PENDING_LEGAL_OFFICER" "Company")
CAN3=$(get_id "$RES")
R=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$CAN3/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"CANCELLED","comment":"Agreement no longer required","approverName":"Sandalie Gomes"}')
api_ok "$R" && track_pass "Legal Officer cancellation ✓" || track_fail "LO cancellation failed"
check_status $CAN3 "CANCELLED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST H: Legal GM Reassign Flow"
# ══════════════════════════════════════════════════════════════════════════════

subsect "H1: Legal GM reassigns a different legal officer"
RES=$(make_sub "LHD_QA_F4_REASSIGN_001" "PENDING_LEGAL_GM" "Company")
RSN=$(get_id "$RES")
[ -n "$RSN" ] && track_pass "Reassign test submission created ✓" || track_fail "Submission failed"

# Patch in a new legal officer (simulating reassign)
REASSIGN_R=$(curl -s -b /tmp/c_lgm.txt -X PATCH "$BASE/api/submissions/$RSN" \
  -H "Content-Type: application/json" \
  -d "{\"assignedLegalOfficer\": \"$LO_ID\"}")
api_ok "$REASSIGN_R" && track_pass "Legal officer reassigned via PATCH ✓" || track_fail "Reassign PATCH failed"

SAVED_LO=$(get_sub $RSN | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('assignedLegalOfficer',''))")
[ "$SAVED_LO" = "$LO_ID" ] && track_pass "assignedLegalOfficer saved correctly ✓" || track_fail "assignedLegalOfficer wrong: $SAVED_LO"

subsect "H2: Legal GM proceeds after reassign — PENDING_LEGAL_OFFICER"
approve /tmp/c_lgm.txt $RSN LEGAL_GM APPROVED "Legal GM OK to Proceed after reassign"
check_status $RSN "PENDING_LEGAL_OFFICER"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST I: Special Approver Flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "I1: Legal GM assigns Special Approver during initial review"
RES=$(make_sub "LHD_QA_F4_SA_GM_001" "PENDING_LEGAL_GM" "Company")
SA_GM=$(get_id "$RES")
SA_RES=$(curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$SA_GM/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"specialApprovers\":[{\"email\":\"special.approver@testdimo.com\",\"name\":\"Special Approver\",\"dept\":\"Legal\"}],\"assignedOfficer\":\"$LO_ID\"}")
api_ok "$SA_RES" && track_pass "Legal GM assigned special approver + ok to proceed ✓" || track_fail "SA assignment failed"
check_status $SA_GM "PENDING_SPECIAL_APPROVER"

subsect "I2: Special Approver approves (GM-initial) → PENDING_LEGAL_OFFICER + INITIAL_REVIEW"
SA_APP=$(curl -s -b /tmp/c_sa.txt -X POST "$BASE/api/submissions/$SA_GM/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_APP" && track_pass "Special Approver approved ✓" || track_fail "SA approval failed"
check_status   $SA_GM "PENDING_LEGAL_OFFICER"
check_lo_stage $SA_GM "INITIAL_REVIEW"

subsect "I3: Legal Officer assigns Special Approver during review"
RES=$(make_sub "LHD_QA_F4_SA_LO_001" "PENDING_LEGAL_OFFICER" "Company")
SA_LO=$(get_id "$RES")
LO_SA_RES=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$SA_LO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"ASSIGN_SPECIAL_APPROVER","specialApproverEmail":"special.approver@testdimo.com","specialApproverName":"Special Approver"}')
api_ok "$LO_SA_RES" && track_pass "Legal Officer assigned special approver ✓" || track_fail "LO SA assignment failed"
check_status $SA_LO "PENDING_SPECIAL_APPROVER"

subsect "I4: Special Approver approves (LO-assigned) → PENDING_LEGAL_OFFICER + REVIEW_FOR_GM"
SA_LO_APP=$(curl -s -b /tmp/c_sa.txt -X POST "$BASE/api/submissions/$SA_LO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"SPECIAL_APPROVER","action":"APPROVED","approverEmail":"special.approver@testdimo.com","approverName":"Special Approver"}')
api_ok "$SA_LO_APP" && track_pass "Special Approver approved (LO path) ✓" || track_fail "SA approval (LO path) failed"
check_status   $SA_LO "PENDING_LEGAL_OFFICER"
check_lo_stage $SA_LO "REVIEW_FOR_GM"

subsect "I5: Special Approver sends back → SENT_BACK"
RES=$(make_sub "LHD_QA_F4_SA_SB_001" "PENDING_LEGAL_GM" "Company")
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
section "TEST J: Resubmission"
# ══════════════════════════════════════════════════════════════════════════════

subsect "J1: Create resubmission linked to original"
RESUB=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F4_HAPPY_001_R1\",
    \"formId\": 4, \"formName\": \"Vehicle Rent Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"DM01 - DIMO PLC\",
    \"title\": \"Vehicle Rent Agreement\",
    \"sapCostCenter\": \"000003999 - IT Department\",
    \"scopeOfAgreement\": \"{\\\"ownerType\\\":\\\"Company\\\",\\\"ownerName\\\":\\\"Updated Rentals Ltd\\\",\\\"vehicleNo\\\":\\\"CAM9078-R\\\",\\\"make\\\":\\\"Toyota\\\",\\\"model\\\":\\\"Hilux\\\",\\\"chassisNo\\\":\\\"NEW_CHASSIS_R1\\\",\\\"termOfRent\\\":\\\"Annual\\\",\\\"commencing\\\":\\\"2026-01-01\\\",\\\"monthlyRentalIncl\\\":\\\"350000\\\"}\",
    \"term\": \"Annual\",
    \"lkrValue\": \"350000\",
    \"remarks\": \"Updated after send-back\",
    \"initiatorComments\": \"\",
    \"legalOfficerId\": \"$LO_ID\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\", \"clusterHeadId\": \"$CH_ID\",
    \"parties\": [{\"type\": \"Company\", \"name\": \"Updated Rentals Ltd\"}],
    \"parentId\": \"$SUB\", \"isResubmission\": true
  }")
RID=$(get_id "$RESUB")
RPARENT=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('parentId',''))")
RFLAG=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isResubmission',''))")
[ -n "$RID" ]           && track_pass "Resubmission created: $RID ✓" || track_fail "Resubmission failed"
[ "$RPARENT" = "$SUB" ] && track_pass "parentId linked correctly ✓"   || track_fail "parentId wrong: $RPARENT"
[ "$RFLAG" = "True" ]   && track_pass "isResubmission = True ✓"       || track_fail "isResubmission flag wrong: $RFLAG"

subsect "J2: Mark original as RESUBMITTED"
MR=$(curl -s -b /tmp/c_initiator.txt -X PATCH "$BASE/api/submissions/$SUB" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}')
api_ok "$MR" && track_pass "Original marked RESUBMITTED ✓" || track_fail "Mark resubmitted failed"

subsect "J3: RESUBMITTED submissions filtered from API list"
RESUB_IN_LIST=$(curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions" | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
found=[s for s in data if s.get('status')=='RESUBMITTED']
print(len(found))")
[ "$RESUB_IN_LIST" -eq "0" ] && track_pass "RESUBMITTED filtered from list ✓" || track_fail "API returns $RESUB_IN_LIST RESUBMITTED items"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST K: Comments"
# ══════════════════════════════════════════════════════════════════════════════

subsect "K1: Legal GM posts comment"
CMT1=$(curl -s -b /tmp/c_lgm.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dinali Gurusinghe","authorRole":"LEGAL_GM","text":"Please confirm the chassis number with the dealer."}')
api_ok "$CMT1" && track_pass "Legal GM comment posted ✓" || track_fail "GM comment failed"

subsect "K2: Legal Officer posts comment"
CMT2=$(curl -s -b /tmp/c_lo.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Sandalie Gomes","authorRole":"LEGAL_OFFICER","text":"Revenue license checked and valid."}')
api_ok "$CMT2" && track_pass "Legal Officer comment posted ✓" || track_fail "LO comment failed"

subsect "K3: Initiator posts comment"
CMT3=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions/$RID/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Oliva Perera","authorRole":"INITIATOR","text":"Updated documents uploaded."}')
api_ok "$CMT3" && track_pass "Initiator comment posted ✓" || track_fail "Initiator comment failed"

subsect "K4: Verify all 3 comments visible"
CMT_COUNT=$(get_sub $RID | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT" -ge "3" ] && track_pass "Comments visible ($CMT_COUNT) ✓" || track_fail "Expected 3+ comments, got $CMT_COUNT"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST L: API Edge Cases"
# ══════════════════════════════════════════════════════════════════════════════

subsect "L1: GET non-existent submission → 404"
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions/nonexistent_f4_xyz_001")
[ "$R" = "404" ] && track_pass "Non-existent returns 404 ✓" || track_fail "Expected 404, got $R"

subsect "L2: POST missing required fields → error"
BAD=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"formId":4}')
BAD_OK=$(echo $BAD | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$BAD_OK" = "False" ] && track_pass "Missing fields returns error ✓" || track_fail "Expected error for missing fields"

subsect "L3: Unauthenticated approve → 401"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"BUM","action":"APPROVED"}')
[ "$UNAUTH" = "401" ] && track_pass "Unauthenticated returns 401 ✓" || track_fail "Expected 401, got $UNAUTH"

subsect "L4: Duplicate submission number → conflict"
DUP=$(curl -s -b /tmp/c_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F4_HAPPY_001\",
    \"formId\": 4, \"formName\": \"Vehicle Rent Agreement\",
    \"status\": \"PENDING_APPROVAL\",
    \"initiatorId\": \"$INITIATOR_ID\", \"initiatorName\": \"Test\",
    \"companyCode\": \"DM01\", \"title\": \"X\",
    \"sapCostCenter\": \"X\", \"scopeOfAgreement\": \"{}\",
    \"term\": \"\", \"lkrValue\": \"\",
    \"remarks\": \"\", \"initiatorComments\": \"\",
    \"legalOfficerId\": \"\",
    \"bumId\": \"$BUM_ID\", \"fbpId\": \"$FBP_ID\",
    \"parties\": []
  }")
DUP_OK=$(echo $DUP | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$DUP_OK" = "False" ] && track_pass "Duplicate submission number rejected ✓" || track_fail "Expected conflict for duplicate"

subsect "L5: GET submissions list — Form 4 visible in initiator's list"
LIST=$(curl -s -b /tmp/c_initiator.txt "$BASE/api/submissions")
F4_COUNT=$(echo $LIST | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
f4=[s for s in data if s.get('formId')==4]
print(len(f4))")
[ "$F4_COUNT" -gt "0" ] && track_pass "Form 4 submissions visible in list ($F4_COUNT) ✓" || track_fail "No Form 4 submissions in list"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST M: Form 4 Workflow Isolation — No Court Officer, No CEO"
# ══════════════════════════════════════════════════════════════════════════════

subsect "M1: Form 4 has exactly 3 approvals (BUM + FBP + CLUSTER_HEAD)"
RES=$(make_sub "LHD_QA_F4_ISO_001" "PENDING_APPROVAL" "Company")
ISO=$(get_id "$RES")
APP_COUNT=$(get_sub $ISO | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
[ "$APP_COUNT" -eq "3" ] && track_pass "Form 4 has exactly 3 approvals ✓" || track_fail "Expected 3, got $APP_COUNT"

CEO_APP=$(get_sub $ISO | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='CEO']))")
[ "$CEO_APP" -eq "0" ] && track_pass "No CEO approval row (Form 4 skips CEO) ✓" || track_fail "Form 4 should NOT have CEO, found $CEO_APP"

CO_APP=$(get_sub $ISO | python3 -c "import sys,json; approvals=json.load(sys.stdin).get('data',{}).get('approvals',[]); print(len([a for a in approvals if a.get('role')=='COURT_OFFICER']))")
[ "$CO_APP" -eq "0" ] && track_pass "No COURT_OFFICER approval row ✓" || track_fail "Form 4 should NOT have COURT_OFFICER, found $CO_APP"

subsect "M2: loStage initialises as PENDING_LEGAL_GM (same as Form 1)"
INIT_LO=$(get_sub $ISO | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('loStage',''))")
[ "$INIT_LO" = "PENDING_LEGAL_GM" ] && track_pass "loStage = PENDING_LEGAL_GM ✓" || track_fail "Expected PENDING_LEGAL_GM, got $INIT_LO"

subsect "M3: BUM+FBP+CH → PENDING_LEGAL_GM (no CEO step like Form 2)"
approve /tmp/c_bum.txt $ISO BUM          APPROVED "BUM"
approve /tmp/c_fbp.txt $ISO FBP          APPROVED "FBP"
approve /tmp/c_ch.txt  $ISO CLUSTER_HEAD APPROVED "CH"
check_status $ISO "PENDING_LEGAL_GM"

subsect "M4: GM final approval → PENDING_LEGAL_OFFICER FINALIZATION (same as Form 1/2, not PENDING_COURT_OFFICER like Form 3)"
approve /tmp/c_lgm.txt $ISO LEGAL_GM APPROVED "Legal GM initial"
check_lo_stage $ISO "INITIAL_REVIEW"
approve /tmp/c_lo.txt  $ISO LEGAL_OFFICER SUBMIT_TO_LEGAL_GM "LO submits to GM"
check_status $ISO "PENDING_LEGAL_GM_FINAL"
approve /tmp/c_lgm.txt $ISO LEGAL_GM APPROVED "Legal GM final"
check_status   $ISO "PENDING_LEGAL_OFFICER"
check_lo_stage $ISO "FINALIZATION"

# ══════════════════════════════════════════════════════════════════════════════
section "FULL QA SUMMARY"
# ══════════════════════════════════════════════════════════════════════════════
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo -e "${YELLOW}  Results: ${GREEN}$PASS_COUNT passed${NC} / ${RED}$FAIL_COUNT failed${NC} / $TOTAL total"
echo ""
echo -e "  ${BLUE}Submission IDs tested:${NC}"
echo -e "  Happy path:      $SUB ($SUB_NO)"
echo -e "  Scope test:      $SCOPE_SUB"
echo -e "  Draft:           $DR"
echo -e "  Parallel:        $PAR | Cancel=$PAR_CAN | SendBack=$PAR_SB"
echo -e "  Reassign:        $RSN"
echo -e "  Resubmission:    $RID"
echo -e "  Special Apprvrs: GM=$SA_GM | LO=$SA_LO | SendBack=$SA_SB"
echo -e "  Send-backs:      BUM=$SB_BUM | FBP=$SB_FBP | CH=$SB_CH | LGM=$SB_LGM | LO=$SB_LO | LGM-Final=$SB_LGM_F"
echo -e "  Cancellations:   $CAN1 | $CAN2 | $CAN3"
echo -e "  Docs test:       Company=$DOCS_CO | Ind=$DOCS_IND | Part=$DOCS_PART | Sole=$DOCS_SOLE"
echo -e "  Isolation:       $ISO"
echo ""
if [ "$FAIL_COUNT" -eq "0" ]; then
  echo -e "${GREEN}  🎉 ALL TESTS PASSED — Form 4 is fully verified!${NC}"
else
  echo -e "${RED}  ⚠️  $FAIL_COUNT test(s) failed — review ❌ above${NC}"
fi
echo ""