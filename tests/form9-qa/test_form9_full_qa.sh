#!/bin/bash

# ══════════════════════════════════════════════════════════════════════════════
# Form 9 Full QA Test Suite — Approval for Purchasing of a Premises
# USAGE: bash tests/form9-qa/test_form9_full_qa.sh
# Run from project root. Dev server must be running: npm run dev
# ══════════════════════════════════════════════════════════════════════════════

BASE="http://localhost:3000"

if ! curl -s --max-time 3 "$BASE/api/auth/csrf" > /dev/null 2>&1; then
  echo -e "\033[0;31m❌ Dev server is not running. Start it with: npm run dev\033[0m"
  exit 1
fi

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

# ─── Cleanup ──────────────────────────────────────────────────────────────────
echo -e "\n${YELLOW}🧹 Cleaning up previous QA test data...${NC}"
npx prisma db execute --stdin <<'SQL' 2>/dev/null
DELETE FROM "submission_parties"           WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F9_%');
DELETE FROM "submission_approvals"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F9_%');
DELETE FROM "submission_documents"         WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F9_%');
DELETE FROM "submission_comments"          WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F9_%');
DELETE FROM "submission_special_approvers" WHERE "submissionId" IN (SELECT id FROM "submissions" WHERE "submissionNo" LIKE 'LHD_QA_F9_%');
DELETE FROM "submissions"                  WHERE "submissionNo" LIKE 'LHD_QA_F9_%';
SQL
echo -e "${GREEN}  ✅ Cleanup done${NC}"

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
get_sub()     { curl -s -b /tmp/c_f9_initiator.txt "$BASE/api/submissions/$1"; }
api_ok()      { echo $1 | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; return $?; }
get_id()      { echo $1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))"; }
get_field()   { get_sub $2 | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('$1',''))" 2>/dev/null; }

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
  shift 5
  EXTRA="${@}"
  BODY="{\"role\":\"$ROLE\",\"action\":\"$ACTION\",\"comment\":\"QA test\",\"approverName\":\"QA $ROLE\"${EXTRA:+,$EXTRA}}"
  R=$(curl -s -b $COOKIE -X POST "$BASE/api/submissions/$SUB/approve" \
    -H "Content-Type: application/json" -d "$BODY")
  api_ok "$R" && track_pass "$LABEL ✓" || { track_fail "$LABEL FAILED"; echo "    → $(echo $R | python3 -c 'import sys,json; print(json.load(sys.stdin).get("error","?"))')"; }
}

# ─── Form 9 submission factory ────────────────────────────────────────────────
make_f9() {
  local NO=$1 STATUS=$2 OWNER_TYPE=${3:-"Individual"}
  curl -s -b /tmp/c_f9_initiator.txt -X POST "$BASE/api/submissions" \
    -H "Content-Type: application/json" \
    -d "{
      \"submissionNo\": \"$NO\",
      \"formId\": 9,
      \"formName\": \"Approval for Purchasing of a Premises\",
      \"status\": \"$STATUS\",
      \"initiatorId\": \"$INITIATOR_ID\",
      \"initiatorName\": \"Test Initiator\",
      \"companyCode\": \"DM01\",
      \"sapCostCenter\": \"000003999\",
      \"title\": \"Approval for Purchasing of a Premises\",
      \"scopeOfAgreement\": \"Purchase of premises at Ass. No. QA-001\",
      \"term\": \"\",
      \"value\": \"15000000\",
      \"remarks\": \"QA Test Submission\",
      \"f9PropertyOwnerType\": \"$OWNER_TYPE\",
      \"f9PropertyOwnerName\": \"QA Test Owner\",
      \"f9NIC\": \"123456789V\",
      \"f9OwnerContactNo\": \"0771234567\",
      \"f9PremisesAssNo\": \"QA/001/2026\",
      \"f9PropertyType\": \"[\\\"Land\\\"]\",
      \"f9ConsiderationRs\": \"15000000\",
      \"f9PlanNo\": \"QA-PLAN-001\",
      \"f9LotNo\": \"QA-LOT-001\",
      \"f9Facilities\": \"[\\\"Electricity\\\",\\\"Water\\\"]\",
      \"f9GMCApprovalNo\": \"GMC/2026/001\",
      \"f9GMCApprovalDate\": \"2026-01-15\",
      \"f9InitiatorContactNo\": \"0112345678\",
      \"f9Remarks\": \"QA test\",
      \"f9ClusterDirectorId\": \"$CD_ID\",
      \"f9GMCMemberId\": \"$GMC_ID\",
      \"documents\": [
        {\"label\": \"Title Deed\",        \"type\": \"required\", \"fileUrl\": null},
        {\"label\": \"Plan\",              \"type\": \"required\", \"fileUrl\": null},
        {\"label\": \"Owner's Letter\",    \"type\": \"required\", \"fileUrl\": null},
        {\"label\": \"Extracts\",          \"type\": \"required\", \"fileUrl\": null}
      ],
      \"parties\": []
    }"
}

# ══════════════════════════════════════════════════════════════════════════════
section "STEP 0: Environment Setup"
# ══════════════════════════════════════════════════════════════════════════════

# Bootstrap login to fetch user IDs
CSRF=$(curl -s -c /tmp/c_f9_initiator.txt "$BASE/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -c /tmp/c_f9_initiator.txt -b /tmp/c_f9_initiator.txt -X POST "$BASE/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=oliva.perera@testdimo.com" \
  --data-urlencode "password=Test@1234" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "json=true" -L > /dev/null

USERS=$(curl -s -b /tmp/c_f9_initiator.txt "$BASE/api/users?includeInactive=true")
uid() { echo $USERS | python3 -c "import sys,json; u=[x for x in json.load(sys.stdin).get('data',[]) if x.get('email')=='$1']; print(u[0]['id'] if u else '')"; }

INITIATOR_ID=$(uid "oliva.perera@testdimo.com")
CD_ID=$(uid "rakhita.perera@dimolanka.com")
GMC_ID=$(uid "mangala.wickramasinghe@dimolanka.com")
FM_ID=$(uid "prabath.vidanage@dimolanka.com")
LO_ID=$(uid "sandalie.gomes@testdimo.com")
LGM_ID=$(uid "dinali.guru@testdimo.com")
CEO_ID=$(uid "ceo@testdimo.com")

[ -n "$INITIATOR_ID" ] && track_pass "Initiator ID:       $INITIATOR_ID" || { track_fail "Initiator not found"; exit 1; }
[ -n "$CD_ID"  ]       && track_pass "Cluster Director:   $CD_ID"        || track_fail "Cluster Director not found"
[ -n "$GMC_ID" ]       && track_pass "GMC Member:         $GMC_ID"       || track_fail "GMC Member not found"
[ -n "$FM_ID"  ]       && track_pass "Facility Manager:   $FM_ID"        || track_fail "Facility Manager not found"
[ -n "$LO_ID"  ]       && track_pass "Legal Officer:      $LO_ID"        || track_fail "Legal Officer not found"
[ -n "$LGM_ID" ]       && track_pass "Legal GM:           $LGM_ID"       || track_fail "Legal GM not found"
[ -n "$CEO_ID" ]       && track_pass "CEO:                $CEO_ID"       || track_fail "CEO not found"

subsect "Login all roles"
login "oliva.perera@testdimo.com"              /tmp/c_f9_initiator.txt
login "rakhita.perera@dimolanka.com"           /tmp/c_f9_cd.txt
login "mangala.wickramasinghe@dimolanka.com"   /tmp/c_f9_gmc.txt
login "prabath.vidanage@dimolanka.com"         /tmp/c_f9_fm.txt
login "sandalie.gomes@testdimo.com"            /tmp/c_f9_lo.txt
login "dinali.guru@testdimo.com"               /tmp/c_f9_lgm.txt
login "ceo@testdimo.com"                       /tmp/c_f9_ceo.txt

# ══════════════════════════════════════════════════════════════════════════════
section "TEST A: Full Happy Path — End to End (Individual Owner)"
# ══════════════════════════════════════════════════════════════════════════════
# Flow: Initiator → LGM (initial) → LO (title verification) → LGM (title review)
#   → BUM Confirm → Cluster Director → GMC → BUM (docs) → LO (review docs)
#   → LO (submit to FM) → Facility Manager → LO (finalization) → LO (submit to LGM final)
#   → LGM (final) → LO (execution) → CEO acknowledge → COMPLETED

subsect "A1: Initiator submits Form 9"
RES=$(make_f9 "LHD_QA_F9_HAPPY_001" "PENDING_LEGAL_GM" "Individual")
SUB=$(get_id "$RES")
SUB_NO=$(echo $RES | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('submissionNo','') or d.get('data',{}).get('submissionNo',''))")
[ -n "$SUB" ] && track_pass "Submission created — No: $SUB_NO | ID: $SUB" || { track_fail "Submission creation failed: $RES"; exit 1; }

subsect "A2: Verify initial field values"
check_field "formId"       $SUB "9"
check_field "status"       $SUB "PENDING_LEGAL_GM"
check_field "loStage"      $SUB "F9_PENDING_ASSIGNMENT"
check_field "legalGmStage" $SUB "INITIAL_REVIEW"
check_field "f9PropertyOwnerType" $SUB "Individual"
check_field "f9ConsiderationRs"   $SUB "15000000"

DOC_COUNT=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$DOC_COUNT" -ge "4" ] && track_pass "Initial docs created: $DOC_COUNT ✓" || track_fail "Expected ≥4 docs, got $DOC_COUNT"

# Form 9 has NO parallel BUM/FBP/CH approvals — 0 approval rows at submission
APPROVAL_COUNT=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('approvals',[])))")
[ "$APPROVAL_COUNT" -eq "0" ] && track_pass "No parallel approvals (Form 9 starts at Legal GM) ✓" || track_fail "Expected 0 approvals, got $APPROVAL_COUNT"

subsect "A3: Legal GM initial review → assigns LO → PENDING_LEGAL_OFFICER (F9_TITLE_VERIFICATION)"
LGM_INIT=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\",\"approverName\":\"Dinali Gurusinghe\"}")
api_ok "$LGM_INIT" && track_pass "Legal GM initial approval ✓" || track_fail "Legal GM initial approval FAILED"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "F9_TITLE_VERIFICATION"
check_gm_stage $SUB "INITIAL_REVIEW"
check_field "assignedLegalOfficer" $SUB "$LO_ID"

subsect "A4: Legal Officer submits title to LGM → PENDING_LEGAL_GM (F9_TITLE_REVIEW)"
approve /tmp/c_f9_lo.txt $SUB LEGAL_OFFICER F9_SUBMIT_TITLE_TO_GM "LO submits title to LGM"
check_status   $SUB "PENDING_LEGAL_GM"
check_lo_stage $SUB "F9_PENDING_GM"
check_gm_stage $SUB "F9_TITLE_REVIEW"

subsect "A5: Legal GM approves title review → PENDING_BUM_CONFIRM"
approve /tmp/c_f9_lgm.txt $SUB LEGAL_GM APPROVED "LGM approves title"
check_status $SUB "PENDING_BUM_CONFIRM"

subsect "A6: BUM confirms proceed → PENDING_CLUSTER_DIRECTOR"
approve /tmp/c_f9_initiator.txt $SUB BUM_F9_CONFIRM PROCEED "BUM confirms proceed"
check_status $SUB "PENDING_CLUSTER_DIRECTOR"

subsect "A7: Cluster Director approves → PENDING_GMC"
approve /tmp/c_f9_cd.txt $SUB CLUSTER_DIRECTOR APPROVED "Cluster Director approves"
check_status $SUB "PENDING_GMC"

subsect "A8: GMC Member approves → PENDING_BUM_DOCS + extra docs added by owner type"
approve /tmp/c_f9_gmc.txt $SUB GMC_MEMBER APPROVED "GMC Member approves"
check_status $SUB "PENDING_BUM_DOCS"

# Verify extra docs were auto-added (Individual owner type)
DOC_COUNT_AFTER=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('documents',[])))")
[ "$DOC_COUNT_AFTER" -gt "$DOC_COUNT" ] && track_pass "Extra docs auto-added: now $DOC_COUNT_AFTER docs ✓" || track_fail "No extra docs added (expected >$DOC_COUNT, got $DOC_COUNT_AFTER)"
INDIVIDUAL_DOC=$(get_sub $SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'National Identity Card' in d.get('label','')]; print(found[0]['label'] if found else '')")
[ -n "$INDIVIDUAL_DOC" ] && track_pass "Individual extra doc present: '$INDIVIDUAL_DOC' ✓" || track_fail "Individual extra doc not found"

subsect "A9: BUM submits documents → PENDING_LEGAL_OFFICER (F9_REVIEW_DOCS)"
approve /tmp/c_f9_initiator.txt $SUB BUM_F9_DOCS SUBMITTED "BUM submits docs"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "F9_REVIEW_DOCS"

subsect "A10: LO submits to Facility Manager → PENDING_FACILITY_MANAGER"
LO_FM=$(curl -s -b /tmp/c_f9_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_OFFICER\",\"action\":\"F9_SUBMIT_TO_FM\",\"facilityManagerId\":\"$FM_ID\",\"approverName\":\"Sandalie Gomes\"}")
api_ok "$LO_FM" && track_pass "LO submits to FM ✓" || track_fail "LO submit to FM FAILED"
check_status   $SUB "PENDING_FACILITY_MANAGER"
check_lo_stage $SUB "F9_PENDING_FM"
check_field "f9FacilityManagerId" $SUB "$FM_ID"

subsect "A11: Facility Manager approves → PENDING_LEGAL_OFFICER (F9_FINALIZATION)"
approve /tmp/c_f9_fm.txt $SUB FACILITY_MANAGER APPROVED "Facility Manager approves"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "F9_FINALIZATION"

subsect "A12: LO saves official use fields (partial save, no status change)"
SAVE_RES=$(curl -s -b /tmp/c_f9_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_OFFICER\",\"action\":\"F9_SAVE_OFFICIAL\",
      \"f9BoardResolutionNo\":\"BR/2026/001\",
      \"f9StampDutyOpinionNo\":\"SD/2026/001\",
      \"f9StampDutyRs\":\"75000\",
      \"f9LegalFeeRs\":\"50000\",
      \"f9ReferenceNo\":\"REF/2026/001\"}")
api_ok "$SAVE_RES" && track_pass "LO saves official fields ✓" || track_fail "LO save official FAILED"
check_status $SUB "PENDING_LEGAL_OFFICER"
check_field "f9BoardResolutionNo" $SUB "BR/2026/001"
check_field "f9StampDutyRs"       $SUB "75000"

subsect "A13: LO submits final deed to LGM → PENDING_LEGAL_GM_FINAL"
approve /tmp/c_f9_lo.txt $SUB LEGAL_OFFICER F9_SUBMIT_FINAL_TO_GM "LO submits final deed to LGM"
check_status   $SUB "PENDING_LEGAL_GM_FINAL"
check_lo_stage $SUB "F9_PENDING_FINAL_GM"
check_gm_stage $SUB "FINAL_APPROVAL"

subsect "A14: LGM final approval → PENDING_LEGAL_OFFICER (F9_EXECUTION)"
approve /tmp/c_f9_lgm.txt $SUB LEGAL_GM APPROVED "LGM final approval"
check_status   $SUB "PENDING_LEGAL_OFFICER"
check_lo_stage $SUB "F9_EXECUTION"

subsect "A15: LO marks job complete → PENDING_CEO"
JOB_RES=$(curl -s -b /tmp/c_f9_lo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_OFFICER\",\"action\":\"F9_JOB_COMPLETE\",
      \"f9DeedNo\":\"DEED/2026/001\",
      \"f9DeedDate\":\"2026-03-01\",
      \"f9LandRegistryRegNo\":\"LRR/2026/001\",
      \"f9DateHandoverFinance\":\"2026-03-05\",
      \"f9OfficialRemarks\":\"All documents handed over\",
      \"approverName\":\"Sandalie Gomes\"}")
api_ok "$JOB_RES" && track_pass "LO marks job complete ✓" || track_fail "LO job complete FAILED"
check_status $SUB "PENDING_CEO"
check_lo_stage $SUB "F9_DONE"
check_field "f9DeedNo"              $SUB "DEED/2026/001"
check_field "f9LandRegistryRegNo"   $SUB "LRR/2026/001"
check_field "f9LegalReviewCompleted" $SUB "True"

subsect "A16: CEO acknowledges → COMPLETED"
ACK_RES=$(curl -s -b /tmp/c_f9_ceo.txt -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"CEO_F9","action":"ACKNOWLEDGED","approverName":"Dimo CEO"}')
api_ok "$ACK_RES" && track_pass "CEO acknowledges ✓" || track_fail "CEO acknowledge FAILED"
check_status $SUB "COMPLETED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST B: Owner Type — Company (extra docs differ from Individual)"
# ══════════════════════════════════════════════════════════════════════════════

subsect "B1: Submit Form 9 with Company owner"
RES=$(make_f9 "LHD_QA_F9_CO_001" "PENDING_LEGAL_GM" "Company")
CO_SUB=$(get_id "$RES")
[ -n "$CO_SUB" ] && track_pass "Company submission: $CO_SUB" || { track_fail "Company submission failed"; }

# Walk to GMC to trigger extra doc insertion
LGM_R=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$CO_SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\"}")
api_ok "$LGM_R" && track_pass "LGM initial approval (Company path) ✓" || track_fail "LGM initial FAILED"
approve /tmp/c_f9_lo.txt  $CO_SUB LEGAL_OFFICER F9_SUBMIT_TITLE_TO_GM "LO submits title"
approve /tmp/c_f9_lgm.txt $CO_SUB LEGAL_GM      APPROVED              "LGM approves title"
approve /tmp/c_f9_initiator.txt $CO_SUB BUM_F9_CONFIRM PROCEED        "BUM confirms"
approve /tmp/c_f9_cd.txt  $CO_SUB CLUSTER_DIRECTOR APPROVED           "CD approves"

subsect "B2: GMC approves Company owner — verify company-specific extra docs"
approve /tmp/c_f9_gmc.txt $CO_SUB GMC_MEMBER APPROVED "GMC approves (Company)"
check_status $CO_SUB "PENDING_BUM_DOCS"
ARTICLES=$(get_sub $CO_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'Articles of Association' in d.get('label','')]; print(found[0]['label'] if found else '')")
[ -n "$ARTICLES" ] && track_pass "Company doc 'Articles of Association' added ✓" || track_fail "Company extra doc not found"
BOARD_RES=$(get_sub $CO_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'Board Resolution' in d.get('label','')]; print(found[0]['label'] if found else '')")
[ -n "$BOARD_RES" ] && track_pass "Company doc 'Board Resolution' added ✓" || track_fail "Board Resolution not found"

subsect "B3: Submit Form 9 with Partnership owner"
RES=$(make_f9 "LHD_QA_F9_PART_001" "PENDING_LEGAL_GM" "Partnership")
PT_SUB=$(get_id "$RES")
LGM_R=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$PT_SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\"}")
approve /tmp/c_f9_lo.txt  $PT_SUB LEGAL_OFFICER F9_SUBMIT_TITLE_TO_GM "LO submits title"
approve /tmp/c_f9_lgm.txt $PT_SUB LEGAL_GM      APPROVED              "LGM approves title"
approve /tmp/c_f9_initiator.txt $PT_SUB BUM_F9_CONFIRM PROCEED        "BUM confirms"
approve /tmp/c_f9_cd.txt  $PT_SUB CLUSTER_DIRECTOR APPROVED           "CD approves"
approve /tmp/c_f9_gmc.txt $PT_SUB GMC_MEMBER APPROVED "GMC approves (Partnership)"
check_status $PT_SUB "PENDING_BUM_DOCS"
PART_DOC=$(get_sub $PT_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); found=[d for d in docs if 'Partnership Registration Certificate' in d.get('label','')]; print(found[0]['label'] if found else '')")
[ -n "$PART_DOC" ] && track_pass "Partnership doc added ✓" || track_fail "Partnership extra doc not found"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST C: Cancellation flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "C1: BUM_F9_CONFIRM cancels"
RES=$(make_f9 "LHD_QA_F9_CANCEL_001" "PENDING_BUM_CONFIRM")
C1=$(get_id "$RES")
approve /tmp/c_f9_initiator.txt $C1 BUM_F9_CONFIRM CANCELLED "BUM Confirm cancels"
check_status $C1 "CANCELLED"

subsect "C2: Cluster Director cancels"
RES=$(make_f9 "LHD_QA_F9_CANCEL_002" "PENDING_CLUSTER_DIRECTOR")
C2=$(get_id "$RES")
approve /tmp/c_f9_cd.txt $C2 CLUSTER_DIRECTOR CANCELLED "Cluster Director cancels"
check_status $C2 "CANCELLED"

subsect "C3: GMC Member cancels"
RES=$(make_f9 "LHD_QA_F9_CANCEL_003" "PENDING_GMC")
C3=$(get_id "$RES")
approve /tmp/c_f9_gmc.txt $C3 GMC_MEMBER CANCELLED "GMC cancels"
check_status $C3 "CANCELLED"

subsect "C4: Legal GM cancels at initial review"
RES=$(make_f9 "LHD_QA_F9_CANCEL_004" "PENDING_LEGAL_GM")
C4=$(get_id "$RES")
approve /tmp/c_f9_lgm.txt $C4 LEGAL_GM CANCELLED "LGM cancels at initial review"
check_status $C4 "CANCELLED"

subsect "C5: Legal GM cancels at title review stage"
RES=$(make_f9 "LHD_QA_F9_CANCEL_005" "PENDING_LEGAL_GM")
C5=$(get_id "$RES")
# Advance to F9_TITLE_REVIEW stage
LGM_R=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$C5/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\"}")
approve /tmp/c_f9_lo.txt  $C5 LEGAL_OFFICER F9_SUBMIT_TITLE_TO_GM "LO submits title"
check_gm_stage $C5 "F9_TITLE_REVIEW"
LGM_CANCEL=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$C5/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_GM","action":"CANCELLED","approverName":"Dinali Gurusinghe"}')
api_ok "$LGM_CANCEL" && track_pass "LGM cancels at title review ✓" || track_fail "LGM cancel at title review FAILED"
check_status $C5 "CANCELLED"

subsect "C6: Legal GM cancels at final approval stage"
RES=$(make_f9 "LHD_QA_F9_CANCEL_006" "PENDING_LEGAL_GM_FINAL")
C6=$(get_id "$RES")
# Patch legalGmStage to FINAL_APPROVAL so route hits the final branch
curl -s -b /tmp/c_f9_lgm.txt -X PATCH "$BASE/api/submissions/$C6" \
  -H "Content-Type: application/json" \
  -d '{"legalGmStage":"FINAL_APPROVAL"}' > /dev/null
FINAL_CANCEL=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$C6/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_GM","action":"CANCELLED","approverName":"Dinali Gurusinghe"}')
api_ok "$FINAL_CANCEL" && track_pass "LGM cancels at final approval ✓" || track_fail "LGM final cancel FAILED"
check_status $C6 "CANCELLED"

subsect "C7: Facility Manager cancels"
RES=$(make_f9 "LHD_QA_F9_CANCEL_007" "PENDING_FACILITY_MANAGER")
C7=$(get_id "$RES")
approve /tmp/c_f9_fm.txt $C7 FACILITY_MANAGER CANCELLED "FM cancels"
check_status $C7 "CANCELLED"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST D: Send Back / Return flows"
# ══════════════════════════════════════════════════════════════════════════════

subsect "D1: Legal GM sends back at initial review"
RES=$(make_f9 "LHD_QA_F9_SB_001" "PENDING_LEGAL_GM")
SB1=$(get_id "$RES")
approve /tmp/c_f9_lgm.txt $SB1 LEGAL_GM SENT_BACK "LGM sends back (initial)"
check_status $SB1 "SENT_BACK"

subsect "D2: Legal GM sends back at title review → returns to LO for re-verification"
RES=$(make_f9 "LHD_QA_F9_SB_002" "PENDING_LEGAL_GM")
SB2=$(get_id "$RES")
LGM_R=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$SB2/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\"}")
approve /tmp/c_f9_lo.txt $SB2 LEGAL_OFFICER F9_SUBMIT_TITLE_TO_GM "LO submits title"
check_gm_stage $SB2 "F9_TITLE_REVIEW"
TITLE_SB=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$SB2/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_GM","action":"SENT_BACK","approverName":"Dinali Gurusinghe"}')
api_ok "$TITLE_SB" && track_pass "LGM sends back at title review ✓" || track_fail "LGM title review send-back FAILED"
check_status   $SB2 "PENDING_LEGAL_OFFICER"
check_lo_stage $SB2 "F9_TITLE_VERIFICATION"
check_gm_stage $SB2 "INITIAL_REVIEW"

subsect "D3: LO requests more docs → PENDING_BUM_DOCS"
RES=$(make_f9 "LHD_QA_F9_SB_003" "PENDING_LEGAL_OFFICER")
SB3=$(get_id "$RES")
# Patch to F9_REVIEW_DOCS stage first
curl -s -b /tmp/c_f9_lgm.txt -X PATCH "$BASE/api/submissions/$SB3" \
  -H "Content-Type: application/json" \
  -d '{"loStage":"F9_REVIEW_DOCS"}' > /dev/null
MORE_DOCS=$(curl -s -b /tmp/c_f9_lo.txt -X POST "$BASE/api/submissions/$SB3/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_OFFICER","action":"F9_REQUEST_MORE_DOCS","approverName":"Sandalie Gomes"}')
api_ok "$MORE_DOCS" && track_pass "LO requests more docs ✓" || track_fail "LO request more docs FAILED"
check_status   $SB3 "PENDING_BUM_DOCS"
check_lo_stage $SB3 "F9_REVIEW_DOCS"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST E: Document Management"
# ══════════════════════════════════════════════════════════════════════════════

subsect "E1: Upload/update document fileUrl"
RES=$(make_f9 "LHD_QA_F9_DOCS_001" "PENDING_LEGAL_GM")
DOC_SUB=$(get_id "$RES")
DOC_ID=$(get_sub $DOC_SUB | python3 -c "import sys,json; docs=json.load(sys.stdin).get('data',{}).get('documents',[]); print(docs[0]['id'] if docs else '')")
[ -n "$DOC_ID" ] && track_pass "Got doc ID: $DOC_ID" || track_fail "No doc ID found"
DOC_UPD=$(curl -s -b /tmp/c_f9_initiator.txt -X PATCH "$BASE/api/submissions/$DOC_SUB" \
  -H "Content-Type: application/json" \
  -d "{\"documentId\":\"$DOC_ID\",\"fileUrl\":\"https://test.example.com/title-deed.pdf\"}")
api_ok "$DOC_UPD" && track_pass "Document fileUrl updated ✓" || track_fail "Document update FAILED"
DOC_URL=$(get_sub $DOC_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
d=[x for x in docs if x['id']=='$DOC_ID']
print(d[0].get('fileUrl','') if d else '')
")
[ "$DOC_URL" = "https://test.example.com/title-deed.pdf" ] && track_pass "fileUrl persisted ✓" || track_fail "fileUrl wrong: $DOC_URL"

subsect "E2: LO adds Legal Dept document"
LGM_R=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$DOC_SUB/approve" \
  -H "Content-Type: application/json" \
  -d "{\"role\":\"LEGAL_GM\",\"action\":\"APPROVED\",\"assignedOfficer\":\"$LO_ID\"}")
ADD_DOC=$(curl -s -b /tmp/c_f9_lo.txt -X PATCH "$BASE/api/submissions/$DOC_SUB" \
  -H "Content-Type: application/json" \
  -d '{"addDocument":{"label":"Deed of Transfer Draft","type":"legal","fileUrl":"https://test.example.com/deed-draft.pdf"}}')
api_ok "$ADD_DOC" && track_pass "Legal dept doc added ✓" || track_fail "Legal dept doc add FAILED"
LEGAL_DOC=$(get_sub $DOC_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
found=[d for d in docs if d.get('type')=='legal']
print(found[0].get('label','') if found else '')
")
[ "$LEGAL_DOC" = "Deed of Transfer Draft" ] && track_pass "Legal doc visible: '$LEGAL_DOC' ✓" || track_fail "Legal doc not found"

subsect "E3: Verify all 4 initial required doc labels"
DOC_LABELS=$(get_sub $DOC_SUB | python3 -c "
import sys,json
docs=json.load(sys.stdin).get('data',{}).get('documents',[])
req=[d['label'] for d in docs if d.get('type')=='required']
print('|'.join(req))
")
for EXPECTED in "Title Deed" "Plan" "Owner's Letter" "Extracts"; do
  echo "$DOC_LABELS" | grep -q "$EXPECTED" \
    && track_pass "Required doc '$EXPECTED' present ✓" \
    || track_fail "Required doc '$EXPECTED' MISSING"
done

# ══════════════════════════════════════════════════════════════════════════════
section "TEST F: Comments"
# ══════════════════════════════════════════════════════════════════════════════

subsect "F1: Post comment from LGM"
CMT=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/submissions/$SUB/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Dinali Gurusinghe","authorRole":"LEGAL_GM","text":"All title documents verified. Proceeding with approval."}')
api_ok "$CMT" && track_pass "Comment posted ✓" || track_fail "Comment post FAILED"

subsect "F2: Comment visible in GET response"
CMT_COUNT=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT" -gt "0" ] && track_pass "Comment visible ($CMT_COUNT) ✓" || track_fail "No comments found"

subsect "F3: Post comment from LO"
CMT2=$(curl -s -b /tmp/c_f9_lo.txt -X POST "$BASE/api/submissions/$SUB/comments" \
  -H "Content-Type: application/json" \
  -d '{"authorName":"Sandalie Gomes","authorRole":"LEGAL_OFFICER","text":"Physical documents received and filed."}')
api_ok "$CMT2" && track_pass "LO comment posted ✓" || track_fail "LO comment post FAILED"
CMT_COUNT2=$(get_sub $SUB | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('data',{}).get('comments',[])))")
[ "$CMT_COUNT2" -ge "2" ] && track_pass "Multiple comments visible: $CMT_COUNT2 ✓" || track_fail "Expected ≥2 comments, got $CMT_COUNT2"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST G: Resubmission"
# ══════════════════════════════════════════════════════════════════════════════

subsect "G1: Mark original as SENT_BACK then create resubmission"
RES=$(make_f9 "LHD_QA_F9_ORIG_001" "PENDING_LEGAL_GM")
ORIG=$(get_id "$RES")
approve /tmp/c_f9_lgm.txt $ORIG LEGAL_GM SENT_BACK "LGM sends back original"
check_status $ORIG "SENT_BACK"

RESUB=$(curl -s -b /tmp/c_f9_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d "{
    \"submissionNo\": \"LHD_QA_F9_ORIG_001_R1\",
    \"formId\": 9,
    \"formName\": \"Approval for Purchasing of a Premises\",
    \"status\": \"PENDING_LEGAL_GM\",
    \"initiatorId\": \"$INITIATOR_ID\",
    \"initiatorName\": \"Test Initiator\",
    \"companyCode\": \"DM01\",
    \"sapCostCenter\": \"000003999\",
    \"title\": \"Approval for Purchasing of a Premises\",
    \"scopeOfAgreement\": \"Purchase of premises at Ass. No. QA-001 (Resubmission)\",
    \"term\": \"\", \"value\": \"15500000\",
    \"f9PropertyOwnerType\": \"Individual\",
    \"f9PropertyOwnerName\": \"QA Test Owner\",
    \"f9NIC\": \"123456789V\",
    \"f9OwnerContactNo\": \"0771234567\",
    \"f9PremisesAssNo\": \"QA/001/2026\",
    \"f9PropertyType\": \"[\\\"Land\\\"]\",
    \"f9ConsiderationRs\": \"15500000\",
    \"f9PlanNo\": \"QA-PLAN-001\", \"f9LotNo\": \"QA-LOT-001\",
    \"f9Facilities\": \"[\\\"Electricity\\\",\\\"Water\\\"]\",
    \"f9GMCApprovalNo\": \"GMC/2026/001\",
    \"f9GMCApprovalDate\": \"2026-01-15\",
    \"f9InitiatorContactNo\": \"0112345678\",
    \"f9ClusterDirectorId\": \"$CD_ID\",
    \"f9GMCMemberId\": \"$GMC_ID\",
    \"documents\": [{\"label\":\"Title Deed\",\"type\":\"required\",\"fileUrl\":null}],
    \"parties\": [],
    \"parentId\": \"$ORIG\",
    \"isResubmission\": true
  }")
RSUB_ID=$(get_id "$RESUB")
RPARENT=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('parentId',''))")
RFLAG=$(echo $RESUB | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('isResubmission',''))")
[ -n "$RSUB_ID" ]        && track_pass "Resubmission created: $RSUB_ID ✓"    || track_fail "Resubmission FAILED"
[ "$RPARENT" = "$ORIG" ] && track_pass "parentId linked correctly ✓"          || track_fail "parentId wrong: $RPARENT"
[ "$RFLAG" = "True" ]    && track_pass "isResubmission = True ✓"               || track_fail "isResubmission flag wrong: $RFLAG"

subsect "G2: Mark original as RESUBMITTED"
MR=$(curl -s -b /tmp/c_f9_initiator.txt -X PATCH "$BASE/api/submissions/$ORIG" \
  -H "Content-Type: application/json" \
  -d '{"status":"RESUBMITTED"}')
api_ok "$MR" && track_pass "Original marked RESUBMITTED ✓" || track_fail "Mark RESUBMITTED FAILED"
check_field "status" $ORIG "RESUBMITTED"

subsect "G3: RESUBMITTED not visible in list API"
RESUBMITTED_COUNT=$(curl -s -b /tmp/c_f9_initiator.txt "$BASE/api/submissions" | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
found=[s for s in data if s.get('status')=='RESUBMITTED']
print(len(found))")
[ "$RESUBMITTED_COUNT" -eq "0" ] && track_pass "RESUBMITTED filtered from list ✓" || track_fail "API returns $RESUBMITTED_COUNT RESUBMITTED submissions"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST H: API Edge Cases"
# ══════════════════════════════════════════════════════════════════════════════

subsect "H1: GET non-existent submission → 404"
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/submissions/nonexistent_f9_qa_xyz")
[ "$R" = "404" ] && track_pass "Non-existent returns 404 ✓" || track_fail "Expected 404, got $R"

subsect "H2: POST with missing required fields → error"
BAD=$(curl -s -b /tmp/c_f9_initiator.txt -X POST "$BASE/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{"formId":9}')
BAD_OK=$(echo $BAD | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$BAD_OK" = "False" ] && track_pass "Missing fields returns error ✓" || track_fail "Expected error for missing fields"

subsect "H3: Duplicate submission number → rejected"
DUP=$(make_f9 "LHD_QA_F9_HAPPY_001" "PENDING_LEGAL_GM")
DUP_OK=$(echo $DUP | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$DUP_OK" = "False" ] && track_pass "Duplicate number rejected ✓" || track_fail "Expected conflict for duplicate"

subsect "H4: Unauthenticated approve → 401"
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/submissions/$SUB/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"LEGAL_GM","action":"APPROVED"}')
[ "$UNAUTH" = "401" ] && track_pass "Unauthenticated returns 401 ✓" || track_fail "Expected 401, got $UNAUTH"

subsect "H5: GET all submissions — Form 9 entries visible"
ALL=$(curl -s -b /tmp/c_f9_initiator.txt "$BASE/api/submissions")
F9_COUNT=$(echo $ALL | python3 -c "import sys,json; data=json.load(sys.stdin).get('data',[]); print(len([s for s in data if s.get('formId')==9]))")
[ "$F9_COUNT" -gt "0" ] && track_pass "Form 9 submissions visible in list: $F9_COUNT ✓" || track_fail "No Form 9 submissions in list"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST I: Form 9 Isolation — No BUM/FBP/CH parallel approvals"
# ══════════════════════════════════════════════════════════════════════════════

subsect "I1: BUM/FBP/CH approve actions should NOT change Form 9 status"
RES=$(make_f9 "LHD_QA_F9_ISOLATE_001" "PENDING_LEGAL_GM")
ISO=$(get_id "$RES")
# Attempt BUM action on a Form 9 — should do nothing meaningful
BAD_BUM=$(curl -s -b /tmp/c_f9_initiator.txt -X POST "$BASE/api/submissions/$ISO/approve" \
  -H "Content-Type: application/json" \
  -d '{"role":"BUM","action":"APPROVED","approverName":"Test BUM"}')
# Status should still be PENDING_LEGAL_GM (no BUM approval row = no allApproved trigger)
AFTER_STATUS=$(get_field "status" $ISO)
[ "$AFTER_STATUS" = "PENDING_LEGAL_GM" ] && track_pass "Form 9 status unaffected by rogue BUM action ✓" || track_fail "Status changed unexpectedly: $AFTER_STATUS"

subsect "I2: Form 9 loStage starts as F9_PENDING_ASSIGNMENT (not PENDING_GM like Form 1)"
INIT_LO=$(get_field "loStage" $ISO)
[ "$INIT_LO" = "F9_PENDING_ASSIGNMENT" ] && track_pass "loStage = F9_PENDING_ASSIGNMENT (Form 9 specific) ✓" || track_fail "loStage wrong: $INIT_LO"

subsect "I3: Form 9 legalGmStage starts as INITIAL_REVIEW"
INIT_GM=$(get_field "legalGmStage" $ISO)
[ "$INIT_GM" = "INITIAL_REVIEW" ] && track_pass "legalGmStage = INITIAL_REVIEW ✓" || track_fail "legalGmStage wrong: $INIT_GM"

# ══════════════════════════════════════════════════════════════════════════════
section "TEST J: Settings — Form 9 Config (Instructions + Docs)"
# ══════════════════════════════════════════════════════════════════════════════

subsect "J1: GET /api/settings/forms includes Form 9"
SETTINGS=$(curl -s -b /tmp/c_f9_lgm.txt "$BASE/api/settings/forms")
F9_CONFIG=$(echo $SETTINGS | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
f9=[c for c in data if c.get('formId')==9]
print(f9[0].get('formName','') if f9 else 'NOT FOUND')
")
[ "$F9_CONFIG" != "NOT FOUND" ] && track_pass "Form 9 config exists in settings: '$F9_CONFIG' ✓" || track_fail "Form 9 config NOT FOUND in settings"

subsect "J2: Legal GM can POST instructions for Form 9"
INSTR_RES=$(curl -s -b /tmp/c_f9_lgm.txt -X POST "$BASE/api/settings/forms" \
  -H "Content-Type: application/json" \
  -d '{
    "formId": 9,
    "instructions": "QA Test Instructions: Please attach all required documents including Title Deed, Plan, and Owner'\''s Letter before submission.",
    "docs": [
      {"label": "Incorporation Certificate", "type": "Company"},
      {"label": "NIC Copy", "type": "Individual"},
      {"label": "Partnership Registration", "type": "Partnership"}
    ]
  }')
api_ok "$INSTR_RES" && track_pass "Form 9 instructions saved ✓" || track_fail "Instructions save FAILED"

subsect "J3: Instructions persist and are readable"
VERIFY=$(curl -s -b /tmp/c_f9_initiator.txt "$BASE/api/settings/forms")
SAVED_INSTR=$(echo $VERIFY | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
f9=[c for c in data if c.get('formId')==9]
print(f9[0].get('instructions','') if f9 else '')
")
echo "$SAVED_INSTR" | grep -q "QA Test Instructions" \
  && track_pass "Instructions persist ✓" \
  || track_fail "Instructions not found after save"

SAVED_DOCS=$(echo $VERIFY | python3 -c "
import sys,json
data=json.load(sys.stdin).get('data',[])
f9=[c for c in data if c.get('formId')==9]
docs=f9[0].get('docs',[]) if f9 else []
print(len(docs))
")
[ "$SAVED_DOCS" -eq "3" ] && track_pass "3 config docs saved ✓" || track_fail "Expected 3 docs, got $SAVED_DOCS"

subsect "J4: Non-LGM cannot save Form 9 settings (403)"
UNAUTH_INSTR=$(curl -s -b /tmp/c_f9_initiator.txt -X POST "$BASE/api/settings/forms" \
  -H "Content-Type: application/json" \
  -d '{"formId":9,"instructions":"Hacked!","docs":[]}')
UNAUTH_OK=$(echo $UNAUTH_INSTR | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))")
[ "$UNAUTH_OK" = "False" ] && track_pass "Non-LGM blocked from saving settings ✓" || track_fail "Non-LGM should NOT be able to save settings"

# ══════════════════════════════════════════════════════════════════════════════
section "FULL QA SUMMARY"
# ══════════════════════════════════════════════════════════════════════════════
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo ""
echo -e "${YELLOW}  Results: ${GREEN}$PASS_COUNT passed${NC} / ${RED}$FAIL_COUNT failed${NC} / $TOTAL total"
echo ""
echo -e "  ${BLUE}Key submission IDs:${NC}"
echo -e "  Happy path (Individual):  $SUB  ($SUB_NO)"
echo -e "  Company owner:            $CO_SUB"
echo -e "  Partnership owner:        $PT_SUB"
echo -e "  Resubmission:             $RSUB_ID  (parent: $ORIG)"
echo -e "  Isolate test:             $ISO"
echo -e "  Cancellations:            C1=$C1  C2=$C2  C3=$C3  C4=$C4  C5=$C5  C6=$C6  C7=$C7"
echo -e "  Send-backs:               SB1=$SB1  SB2=$SB2  SB3=$SB3"
echo ""
if [ "$FAIL_COUNT" -eq "0" ]; then
  echo -e "${GREEN}  🎉 ALL TESTS PASSED — Form 9 is fully verified!${NC}"
else
  echo -e "${RED}  ⚠️  $FAIL_COUNT test(s) failed — review ❌ above${NC}"
fi
echo ""