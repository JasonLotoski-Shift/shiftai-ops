// Invoice document template — the single source of the invoice LAYOUT.
//
// The layout is FIXED. Only the values change, so every invoice the firm sends
// looks identical. It is filled deterministically from the Invoice record by
// renderInvoiceHtml() below — there is NO LLM in the money path. An invoice is a
// data-merge, not a piece of writing: the figures come straight from Postgres,
// never re-typed by a model, so a total can't drift and the format can't vary.
//
// Output is a self-contained, print-ready HTML document (light, on-brand, plain
// — invoices are professional, not marketing). It can be saved to Drive as HTML,
// "printed to PDF", or converted to a Google Doc later.

// ── Firm constants — set ONCE. Items marked [NEEDS INPUT] must be filled in
//    before any invoice is sent; the figures are real money, so don't guess. ──
export const INVOICE_FIRM = {
  legalName: "Shift AI Partners",
  email: "hello@shiftai.partners",
  address: "2 - 307 Glen Park Drive, Kelowna BC V1V 0H1, Canada",
  // Interac e-transfer recipient (phone-registered). No wire/bank details offered.
  eTransfer: "250-870-4275",
  wireDetails: "",
  // The firm is not GST/HST-registered (no tax line on invoices).
  taxNote: "GST/HST not applicable. Shift AI Partners is not tax-registered.",
} as const;

export type InvoiceTemplateData = {
  number: string; // e.g. "SAI-2026-009"
  issuedAt: string; // pre-formatted, e.g. "9 Jun 2026"
  dueAt: string; // pre-formatted
  status: "Draft" | "Sent" | "Paid" | "Overdue";
  billTo: {
    company: string;
    contactName?: string;
    contactTitle?: string;
    email?: string;
    address?: string; // free text (from the client record); optional
  };
  lineDescription: string; // e.g. "Professional services — Acme Corp · Dispatch pilot"
  amountCad: number; // whole CAD — the subtotal (canonical AR figure)
  totalCad: number; // whole CAD — equals amountCad while there is no tax
};

// Exact, explicit money format: "$1,234.00 CAD". Two decimals, thousands commas.
// Shared by the HTML preview and the react-pdf renderer so the figure is
// formatted identically in both.
export function formatInvoiceCad(n: number): string {
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD`;
}

// HTML-escape a value before it goes into the template (defends the layout
// against stray <, >, & in a company name or note).
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderInvoiceHtml(d: InvoiceTemplateData): string {
  const billLines = [
    `<div class="bt-company">${esc(d.billTo.company)}</div>`,
    d.billTo.contactName
      ? `<div>${esc(d.billTo.contactName)}${d.billTo.contactTitle ? `, ${esc(d.billTo.contactTitle)}` : ""}</div>`
      : "",
    d.billTo.address ? `<div>${esc(d.billTo.address)}</div>` : "",
    d.billTo.email ? `<div class="muted">${esc(d.billTo.email)}</div>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Invoice ${esc(d.number)} — ${INVOICE_FIRM.legalName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
<style>
  :root {
    --fog: #ECEDEF; --white: #FFFFFF; --hairline: #D7D8DC; --ink: #15171A;
    --muted: #5C6872; --gold: #C9A961; --flag-red: #9F2521;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--fog); color: var(--ink); font-family: Inter, system-ui, sans-serif; font-size: 14px; line-height: 1.5; padding: 32px; }
  .sheet { max-width: 820px; margin: 0 auto; background: var(--white); border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 56px 56px 40px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 28px; border-bottom: 1px solid var(--hairline); }
  .wordmark { font-family: "Big Shoulders Display", sans-serif; font-weight: 900; font-size: 30px; letter-spacing: -0.02em; transform: skewX(-12deg); display: inline-block; line-height: 1; }
  .wordmark .ai { color: var(--gold); }
  .from-meta { font-size: 12px; color: var(--muted); margin-top: 10px; line-height: 1.7; }
  .doc-label { text-align: right; }
  .doc-label .word { font-family: "JetBrains Mono", monospace; font-size: 12px; letter-spacing: 0.18em; color: var(--muted); }
  .doc-label .num { font-family: "JetBrains Mono", monospace; font-size: 20px; color: var(--ink); margin-top: 4px; }
  .doc-label .status { font-family: "JetBrains Mono", monospace; font-size: 11px; letter-spacing: 0.08em; color: var(--gold); margin-top: 6px; }
  .parties { display: flex; justify-content: space-between; gap: 40px; padding: 28px 0; }
  .label { font-family: "JetBrains Mono", monospace; font-size: 10px; letter-spacing: 0.12em; color: var(--muted); margin-bottom: 8px; }
  .bt-company { font-weight: 600; font-size: 15px; }
  .muted { color: var(--muted); }
  .dates { text-align: right; font-size: 13px; line-height: 1.9; }
  .dates .k { color: var(--muted); margin-right: 12px; }
  .dates .v { font-family: "JetBrains Mono", monospace; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-family: "JetBrains Mono", monospace; font-size: 10px; letter-spacing: 0.12em; color: var(--muted); font-weight: 500; padding: 10px 0; border-bottom: 1px solid var(--hairline); }
  th.r, td.r { text-align: right; }
  td { padding: 16px 0; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  td.amt { font-family: "JetBrains Mono", monospace; }
  .totals { margin-top: 18px; margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; }
  .totals .row .k { color: var(--muted); }
  .totals .row .v { font-family: "JetBrains Mono", monospace; }
  .totals .due { border-top: 2px solid var(--ink); margin-top: 6px; padding-top: 12px; font-size: 16px; font-weight: 600; }
  .totals .due .v { color: var(--gold); }
  .pay { margin-top: 40px; padding: 20px 22px; background: var(--fog); border-radius: 10px; font-size: 13px; line-height: 1.7; }
  .pay .label { margin-bottom: 6px; }
  .foot { margin-top: 36px; padding-top: 18px; border-top: 1px solid var(--hairline); display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
  .needsinput { color: var(--flag-red); font-weight: 600; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <span class="wordmark">SHIFT <span class="ai">AI</span></span>
        <div class="from-meta">
          ${INVOICE_FIRM.legalName}<br />
          ${fmtFirm(INVOICE_FIRM.address)}<br />
          ${INVOICE_FIRM.email}
        </div>
      </div>
      <div class="doc-label">
        <div class="word">INVOICE</div>
        <div class="num">${esc(d.number)}</div>
        <div class="status">${esc(d.status).toUpperCase()}</div>
      </div>
    </div>

    <div class="parties">
      <div>
        <div class="label">BILL TO</div>
        ${billLines}
      </div>
      <div class="dates">
        <div><span class="k">Issued</span><span class="v">${esc(d.issuedAt)}</span></div>
        <div><span class="k">Due</span><span class="v">${esc(d.dueAt)}</span></div>
      </div>
    </div>

    <table>
      <thead>
        <tr><th>DESCRIPTION</th><th class="r">AMOUNT</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(d.lineDescription)}</td>
          <td class="r amt">${formatInvoiceCad(d.amountCad)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span class="k">Subtotal</span><span class="v">${formatInvoiceCad(d.amountCad)}</span></div>
      <div class="row"><span class="k">Tax</span><span class="v">None</span></div>
      <div class="row due"><span class="k">Total due</span><span class="v">${formatInvoiceCad(d.totalCad)}</span></div>
    </div>

    <div class="pay">
      <div class="label">PAYMENT</div>
      Due ${esc(d.dueAt)}. Pay by Interac e-transfer to <strong>${fmtFirm(INVOICE_FIRM.eTransfer)}</strong>.
      ${INVOICE_FIRM.wireDetails.startsWith("[NEEDS INPUT") ? fmtFirm(INVOICE_FIRM.wireDetails) : esc(INVOICE_FIRM.wireDetails)}<br />
      <span class="muted">${esc(INVOICE_FIRM.taxNote)}</span>
    </div>

    <div class="foot">
      <span>${INVOICE_FIRM.legalName} · ${INVOICE_FIRM.email}</span>
      <span>Thank you.</span>
    </div>
  </div>
</body>
</html>`;
}

// Render a firm constant: if it's still a [NEEDS INPUT] placeholder, show it in
// red so it can't slip into a sent invoice; otherwise escape it normally.
function fmtFirm(v: string): string {
  return v.startsWith("[NEEDS INPUT") ? `<span class="needsinput">${esc(v)}</span>` : esc(v);
}
