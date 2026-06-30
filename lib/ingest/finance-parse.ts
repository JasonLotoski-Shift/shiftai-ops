// Parse an `ingest-email` skill response that INCLUDES the finance fields
// (financeType / payer / bill / ar / financeIncomplete / financeLinks) into the
// ExtractedProposal finance shape. Used by the composer's GREEN (financial) lane
// so a dropped or pasted invoice produces the SAME proposal shape a Gmail finance
// row does — the green review card and the finance actions then read one shape.
//
// The Gmail poll has its own equivalent parse inline; this is the composer-side
// copy (kept separate so we never import a route handler). Types are imported
// type-only from the actions module (no runtime dependency on "use server").

import type { ExtractedProposal, FinanceType, ExtractedBill, ExtractedAR } from "@/app/(app)/ingest/actions";

const FINANCE_TYPES = new Set<FinanceType>(["ap_bill", "reimbursable", "ar_payment", "firm_paid", "none"]);

function jsonObject(raw: string): Record<string, unknown> {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

/**
 * Parse a finance-document extraction. A finance document is an invoice / receipt
 * / remittance, so it carries no contact enrichment or action items — those default
 * empty. `financeType` defaults to "none" when the model couldn't classify it; the
 * partner picks the action on the green card regardless. Throws on malformed JSON
 * so the composer surfaces "try again" rather than silently filing a blank.
 */
export function parseFinanceProposal(raw: string): ExtractedProposal {
  const o = jsonObject(raw);

  const ftRaw = typeof o.financeType === "string" ? (o.financeType as string) : "none";
  const financeType = (FINANCE_TYPES.has(ftRaw as FinanceType) ? ftRaw : "none") as FinanceType;

  const billObj = o.bill && typeof o.bill === "object" ? (o.bill as Record<string, unknown>) : null;
  const bill: ExtractedBill | null =
    billObj && typeof billObj.vendor === "string" && billObj.vendor.trim() && typeof billObj.amount === "number" && billObj.amount > 0
      ? {
          vendor: (billObj.vendor as string).trim(),
          amount: billObj.amount as number,
          currency: typeof billObj.currency === "string" && billObj.currency.trim() ? (billObj.currency as string).trim().toUpperCase() : undefined,
          invoiceNumber: typeof billObj.invoiceNumber === "string" && billObj.invoiceNumber.trim() ? (billObj.invoiceNumber as string).trim() : undefined,
          dueDate: typeof billObj.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(billObj.dueDate) ? (billObj.dueDate as string) : undefined,
        }
      : null;

  const arObj = o.ar && typeof o.ar === "object" ? (o.ar as Record<string, unknown>) : null;
  const ar: ExtractedAR | null = arObj
    ? {
        invoiceNumber: typeof arObj.invoiceNumber === "string" && arObj.invoiceNumber.trim() ? (arObj.invoiceNumber as string).trim() : undefined,
        amount: typeof arObj.amount === "number" ? (arObj.amount as number) : undefined,
        paidDate: typeof arObj.paidDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(arObj.paidDate) ? (arObj.paidDate as string) : undefined,
        clientHint: typeof arObj.clientHint === "string" && arObj.clientHint.trim() ? (arObj.clientHint as string).trim() : undefined,
      }
    : null;

  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    keyPoints: strArr(o.keyPoints),
    actionItems: [],
    enrichment: { contact: [], client: [] },
    stageSignal: null,
    financeType,
    payer: typeof o.payer === "string" && o.payer.trim() ? (o.payer as string).trim() : null,
    billCandidate: financeType === "ap_bill",
    bill,
    arCandidate: financeType === "ar_payment",
    ar,
    financeIncomplete: o.financeIncomplete === true,
    financeLinks: strArr(o.financeLinks),
  };
}
