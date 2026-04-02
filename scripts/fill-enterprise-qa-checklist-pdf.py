"""
Generate FXMARK_v1_Enterprise_QA_Checklist_FILLED.pdf with Status / Notes from a release test run.
Run from repo root: python scripts/fill-enterprise-qa-checklist-pdf.py
Requires: pip install fpdf2
"""
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "FXMARK_v1_Enterprise_QA_Checklist_FILLED.pdf"

ROWS_A = [
    ("GET /health", "200 OK when server running", "PASS", "200 + JSON status ok (localhost:3000)", "High"),
    ("GET /api/health", "Returns API + DB status", "PARTIAL", "200 OK; body only status ok - no explicit DB fields", "High"),
    ("Maintenance ON", "All /api routes return 503", "NOT RUN", "Maintenance not toggled in this run", "Critical"),
    ("CORS", "Frontend origin allowed", "PARTIAL", "CORS via getAllowedOriginsList; no browser preflight here", "High"),
    ("Rate limit", "429 on abuse", "NOT RUN", "Limiter configured; abuse burst not executed", "High"),
    ("Error handling", "Consistent JSON error", "PASS", "Invalid login: error, message, requestId JSON", "High"),
]

ROWS_B = [
    (
        "Register",
        "User created",
        "PARTIAL",
        "Rerun: PASS 201 + verificationEmailSent true. Also E11000 dup accountNo on repeat "
        "registers (staging counter) - flaky",
        "Critical",
    ),
    ("Login", "Token returned", "NOT VERIFIED", "alice@test.com: 401 invalid creds", "Critical"),
    (
        "Refresh token",
        "New token issued",
        "PARTIAL",
        "POST /refresh returns 403 EMAIL_NOT_VERIFIED until email verified (by design). "
        "Post-verify rotation not exercised in this run",
        "High",
    ),
    ("Logout", "Session invalidated", "NOT RUN", "No completed register+logout in same session this rerun", "High"),
    ("Forgot password", "Email sent", "NOT RUN", "", "High"),
    ("Reset password", "Password updated", "NOT RUN", "", "High"),
]

ROWS_D = [
    ("Deposit create", "Transaction created", "NOT RUN", "", "Critical"),
    ("NOWPayments webhook", "Wallet credited once only", "PASS", "Unit tests nowpayments IPN", "Critical"),
    ("Duplicate webhook", "No double credit", "PASS", "Unit: 5x finished credits once", "Critical"),
    ("Withdrawal request", "Pending created", "NOT RUN", "", "Critical"),
    ("Withdrawal complete", "Wallet debited", "NOT RUN", "", "Critical"),
    ("Internal transfer", "Both wallets updated", "NOT RUN", "", "High"),
    ("Ledger sync", "Wallet = ledger balance", "NOT RUN", "", "Critical"),
]

ROWS_G = [
    ("Create account", "Account created", "NOT RUN", "No trading E2E", "Critical"),
    ("Place order", "Order placed", "NOT RUN", "", "Critical"),
    ("Order fill", "Position opened", "NOT RUN", "", "Critical"),
    ("Close position", "P&L correct", "NOT RUN", "", "Critical"),
    ("SL/TP hit", "Auto close works", "NOT RUN", "", "High"),
    ("Margin update", "Real-time correct", "NOT RUN", "", "Critical"),
    ("Stop-out", "Triggers correctly", "NOT RUN", "", "Critical"),
]

ROWS_H = [
    ("Follow fund", "Allocation created", "NOT RUN", "", "Critical"),
    ("Profit distribution", "Correct % credited", "NOT RUN", "", "Critical"),
    ("Idempotency", "No duplicate distribution", "NOT RUN", "", "Critical"),
    ("Withdraw", "Rules enforced", "NOT RUN", "", "Critical"),
    ("IB commission", "Correct payout", "NOT RUN", "", "High"),
]

ROWS_M = [
    ("Approve withdrawal", "Status updated", "NOT RUN", "", "Critical"),
    ("Complete withdrawal", "Finalized", "NOT RUN", "", "Critical"),
    ("Fraud alerts", "Triggered correctly", "NOT RUN", "", "High"),
    ("Audit logs", "Every action logged", "NOT RUN", "", "High"),
    ("Reconciliation", "No mismatch", "NOT RUN", "", "Critical"),
]

ROWS_O = [
    (
        "JWT expiry",
        "Refresh works",
        "PARTIAL",
        "Refresh endpoint enforces emailVerified; full refresh-after-verify not E2E here",
        "High",
    ),
    ("Email flows", "Verify/reset works", "PARTIAL", "Code + path links; no live inbox E2E", "High"),
    ("Redis fallback", "App runs without Redis", "PASS", "cache.js memory fallback", "Medium"),
    ("Secrets", "No hardcoded keys", "PARTIAL", "Spot review only", "Critical"),
]

ROLES = [
    ("Guest", "Landing -> Register -> Login", "NOT RUN"),
    ("Investor", "Deposit -> Trade -> PAMM -> Withdraw", "NOT RUN"),
    ("IB", "Referral -> Commission tracking", "NOT RUN"),
    ("Admin", "Approve + complete withdrawal", "NOT RUN"),
    ("Superadmin", "System control + distribution", "NOT RUN"),
]


def emit_table(pdf: FPDF, rows: list[tuple]) -> None:
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(46, 5, "Test / endpoint", border=1)
    pdf.cell(34, 5, "Expected", border=1)
    pdf.cell(22, 5, "Status", border=1)
    pdf.cell(78, 5, "Notes", border=1)
    pdf.cell(16, 5, "Pri", border=1)
    pdf.ln()
    pdf.set_font("Helvetica", "", 7)
    for test, exp, status, notes, pri in rows:
        h_test = pdf.multi_cell(46, 4, test, border=0, split_only=True)
        h_exp = pdf.multi_cell(34, 4, exp, border=0, split_only=True)
        h_st = pdf.multi_cell(22, 4, status, border=0, split_only=True)
        h_no = pdf.multi_cell(78, 4, notes, border=0, split_only=True)
        h_pri = pdf.multi_cell(16, 4, pri, border=0, split_only=True)
        row_h = max(len(h_test), len(h_exp), len(h_st), len(h_no), len(h_pri), 1) * 4 + 2
        if pdf.get_y() + row_h > pdf.h - 18:
            pdf.add_page()
        x = pdf.l_margin
        y = pdf.get_y()
        pdf.rect(x, y, 46, row_h)
        pdf.rect(x + 46, y, 34, row_h)
        pdf.rect(x + 80, y, 22, row_h)
        pdf.rect(x + 102, y, 78, row_h)
        pdf.rect(x + 180, y, 16, row_h)
        pdf.set_xy(x + 1, y + 1)
        pdf.multi_cell(44, 4, test, border=0)
        pdf.set_xy(x + 47, y + 1)
        pdf.multi_cell(32, 4, exp, border=0)
        pdf.set_xy(x + 81, y + 1)
        pdf.multi_cell(20, 4, status, border=0)
        pdf.set_xy(x + 103, y + 1)
        pdf.multi_cell(76, 4, notes, border=0)
        pdf.set_xy(x + 181, y + 1)
        pdf.multi_cell(14, 4, pri, border=0)
        pdf.set_xy(x, y + row_h)


def main():
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "FXMARK v1 ENTERPRISE QA CHECKLIST (FILLED)", ln=1)
    pdf.set_font("Helvetica", "", 9)
    w = pdf.w - pdf.r_margin - pdf.l_margin
    pdf.multi_cell(
        w,
        5,
        "Validation rerun (2026-04-02). Source: FXMARK_v1_Enterprise_QA_Checklist.pdf\n"
        "Re-validated: health, api/health, error JSON, IB + NOWPayments unit tests (8+8 pass). "
        "Auth: register success path + dup accountNo race; refresh 403 until verified. "
        "No trading/PAMM/admin E2E.",
    )

    def sec(title: str):
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, title, ln=1)
        pdf.set_font("Helvetica", "", 7)

    sec("A. Platform & API Shell")
    emit_table(pdf, ROWS_A)
    sec("B. Authentication & Session")
    emit_table(pdf, ROWS_B)
    sec("D. Wallet & Money Movement")
    emit_table(pdf, ROWS_D)

    pdf.add_page()
    sec("G. Trading Engine")
    emit_table(pdf, ROWS_G)
    sec("H. PAMM AI System")
    emit_table(pdf, ROWS_H)
    sec("M. Admin & Risk Controls")
    emit_table(pdf, ROWS_M)
    sec("O. Cross-Cutting")
    emit_table(pdf, ROWS_O)

    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Role-Based End-to-End Testing", ln=1)
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(40, 5, "Role", border=1)
    pdf.cell(110, 5, "Scenario", border=1)
    pdf.cell(40, 5, "Status", border=1)
    pdf.ln()
    pdf.set_font("Helvetica", "", 8)
    for role, scen, st in ROLES:
        pdf.cell(40, 6, role, border=1)
        pdf.cell(110, 6, scen, border=1)
        pdf.cell(40, 6, st, border=1)
        pdf.ln()

    pdf.ln(4)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 11)
    pdf.multi_cell(pdf.w - pdf.r_margin - pdf.l_margin, 6, "VERDICT: NOT READY for enterprise launch on this run alone.")
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(
        pdf.w - pdf.r_margin - pdf.l_margin,
        5,
        "Rerun notes: Register happy path confirmed; intermittent E11000 duplicate accountNo needs ops/dev fix. "
        "Login seed unverified. Refresh behavior matches policy (verify email first). "
        "Still NOT RUN: maintenance 503, CORS browser, rate-limit 429, wallet, trading, PAMM, admin, role E2E.",
    )

    pdf.output(str(OUT))
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
