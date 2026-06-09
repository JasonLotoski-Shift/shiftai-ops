// react-pdf renderer — turns an InvoiceTemplateData into a real PDF Buffer.
//
// This is the SINGLE renderer for the sent invoice. Fixed layout, values only;
// no LLM. It mirrors the design in invoice-template.ts (the HTML preview) and
// shares INVOICE_FIRM + the CAD formatter so the two never disagree on a figure.
//
// Built-in fonts (Helvetica / Courier) on purpose: no font fetch at render time,
// so it generates reliably in a Vercel serverless function. The 12-degree skewed
// wordmark from the marketing brand is rendered upright here (react-pdf has no
// skew transform); the gold "AI" and the gold total carry the brand on the page.

import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { INVOICE_FIRM, formatInvoiceCad, type InvoiceTemplateData } from "@/lib/invoice-template";

const INK = "#15171A";
const MUTED = "#5C6872";
const GOLD = "#C9A961";
const FOG = "#ECEDEF";
const HAIRLINE = "#D7D8DC";
const RED = "#9F2521";

const s = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", paddingTop: 48, paddingHorizontal: 48, paddingBottom: 36, fontFamily: "Helvetica", fontSize: 10, color: INK, lineHeight: 1.5 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  wordmark: { fontFamily: "Helvetica-Bold", fontSize: 22, letterSpacing: -0.5 },
  gold: { color: GOLD },
  fromMeta: { fontSize: 9, color: MUTED, marginTop: 8, lineHeight: 1.6 },
  docLabel: { alignItems: "flex-end" },
  docWord: { fontFamily: "Courier", fontSize: 10, letterSpacing: 2, color: MUTED },
  docNum: { fontFamily: "Courier", fontSize: 16, color: INK, marginTop: 3 },
  docStatus: { fontFamily: "Courier", fontSize: 9, letterSpacing: 1, color: GOLD, marginTop: 4 },
  parties: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 22 },
  label: { fontFamily: "Courier", fontSize: 8, letterSpacing: 1, color: MUTED, marginBottom: 6 },
  company: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  muted: { color: MUTED },
  dates: { alignItems: "flex-end" },
  dateRow: { flexDirection: "row", marginBottom: 4 },
  dateK: { color: MUTED, marginRight: 10 },
  dateV: { fontFamily: "Courier" },
  th: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  thText: { fontFamily: "Courier", fontSize: 8, letterSpacing: 1, color: MUTED },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  rowDesc: { flex: 1, paddingRight: 20 },
  rowAmt: { fontFamily: "Courier" },
  totals: { marginTop: 16, marginLeft: "auto", width: 220 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  totK: { color: MUTED },
  totV: { fontFamily: "Courier" },
  due: { borderTopWidth: 2, borderTopColor: INK, marginTop: 5, paddingTop: 10 },
  dueK: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  dueV: { fontFamily: "Courier", fontSize: 13, color: GOLD },
  pay: { marginTop: 32, padding: 18, backgroundColor: FOG, borderRadius: 8 },
  payText: { fontSize: 10, lineHeight: 1.7 },
  bold: { fontFamily: "Helvetica-Bold" },
  red: { color: RED, fontFamily: "Helvetica-Bold" },
  foot: { marginTop: 28, paddingTop: 14, borderTopWidth: 1, borderTopColor: HAIRLINE, flexDirection: "row", justifyContent: "space-between" },
  footText: { fontSize: 9, color: MUTED },
});

// Render a firm constant, red if it's still a [NEEDS INPUT] placeholder so it
// can't slip silently into a sent invoice.
type RpdfStyle = (typeof s)[keyof typeof s];
function FirmText({ value, baseStyle }: { value: string; baseStyle?: RpdfStyle }) {
  const needs = value.startsWith("[NEEDS INPUT");
  if (needs) return <Text style={baseStyle ? [baseStyle, s.red] : s.red}>{value}</Text>;
  return <Text style={baseStyle}>{value}</Text>;
}

function InvoiceDocument({ d }: { d: InvoiceTemplateData }) {
  return (
    <Document title={`Invoice ${d.number} — ${INVOICE_FIRM.legalName}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.top}>
          <View>
            <Text style={s.wordmark}>SHIFT <Text style={s.gold}>AI</Text></Text>
            <Text style={s.fromMeta}>{INVOICE_FIRM.legalName}</Text>
            <FirmText value={INVOICE_FIRM.address} baseStyle={s.fromMeta} />
            <Text style={s.fromMeta}>{INVOICE_FIRM.email}</Text>
          </View>
          <View style={s.docLabel}>
            <Text style={s.docWord}>INVOICE</Text>
            <Text style={s.docNum}>{d.number}</Text>
            <Text style={s.docStatus}>{d.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.parties}>
          <View>
            <Text style={s.label}>BILL TO</Text>
            <Text style={s.company}>{d.billTo.company}</Text>
            {d.billTo.contactName ? (
              <Text>{d.billTo.contactName}{d.billTo.contactTitle ? `, ${d.billTo.contactTitle}` : ""}</Text>
            ) : null}
            {d.billTo.address ? <Text>{d.billTo.address}</Text> : null}
            {d.billTo.email ? <Text style={s.muted}>{d.billTo.email}</Text> : null}
          </View>
          <View style={s.dates}>
            <View style={s.dateRow}><Text style={s.dateK}>Issued</Text><Text style={s.dateV}>{d.issuedAt}</Text></View>
            <View style={s.dateRow}><Text style={s.dateK}>Due</Text><Text style={s.dateV}>{d.dueAt}</Text></View>
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.thText}>DESCRIPTION</Text>
          <Text style={s.thText}>AMOUNT</Text>
        </View>
        <View style={s.row}>
          <Text style={s.rowDesc}>{d.lineDescription}</Text>
          <Text style={s.rowAmt}>{formatInvoiceCad(d.amountCad)}</Text>
        </View>

        <View style={s.totals}>
          <View style={s.totRow}><Text style={s.totK}>Subtotal</Text><Text style={s.totV}>{formatInvoiceCad(d.amountCad)}</Text></View>
          <View style={s.totRow}><Text style={s.totK}>Tax</Text><Text style={s.totV}>None</Text></View>
          <View style={[s.totRow, s.due]}><Text style={s.dueK}>Total due</Text><Text style={s.dueV}>{formatInvoiceCad(d.totalCad)}</Text></View>
        </View>

        <View style={s.pay}>
          <Text style={s.label}>PAYMENT</Text>
          <Text style={s.payText}>
            Due {d.dueAt}. Pay by Interac e-transfer to <Text style={s.bold}>{INVOICE_FIRM.eTransfer}</Text>.{" "}
            <FirmText value={INVOICE_FIRM.wireDetails} />
          </Text>
          <Text style={[s.payText, s.muted]}>{INVOICE_FIRM.taxNote}</Text>
        </View>

        <View style={s.foot}>
          <Text style={s.footText}>{INVOICE_FIRM.legalName} · {INVOICE_FIRM.email}</Text>
          <Text style={s.footText}>Thank you.</Text>
        </View>
      </Page>
    </Document>
  );
}

// Deterministic: same data in, byte-for-similar PDF out. No model call.
export async function renderInvoicePdf(d: InvoiceTemplateData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument d={d} />);
}
