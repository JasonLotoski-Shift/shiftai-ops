// The firm's standard client agreement, rendered as clean semantic HTML that
// Drive imports into a NATIVE Google Doc (see saveContract → uploadAsGoogleDoc).
// A Google Doc is the right surface for a contract the client will redline:
// comments, track changes, sharing, and a clean File → Download → PDF.
//
// STRUCTURE: this implements the v3 "Master Conditional Sale and Custom Software
// Development Agreement" (Steve's draft, Canadianized for a BC company and edited
// per docs/contract-v3-change-brief.md). The model: the Client buys the custom
// Deliverable and takes title on full payment (the Vesting Date); Shift retains
// the Background IP and licenses it for a recurring fee. No buy-out.
//
// ARCHITECTURE (deliberate): the binding legal text in this file is FIXED. It is
// the counsel-reviewable master template — the LLM never rewrites it, so the
// clauses can't drift between contracts. Only the variable fields (parties, fees,
// dates) and Schedule A (the Deliverable/SOW, drafted by the generate-contract
// skill) change per deal. The server fills the fields deterministically with
// renderContract().
//
// SECTION NUMBERS ARE LITERAL. Google Docs drops CSS counters on import, so the
// section/sub-section numbers (1, 1.1, 4.5, 14.1, …) are written as plain text and
// the cross-references point at them by hand. If a section is added or removed,
// renumber the headings AND every cross-reference by hand (this is why the
// Insurance removal on 2026-06-22 also renumbered §7.3 and the Survival list).
//
// KNOWN DISCREPANCY (pre-existing, left verbatim): Schedule D cites "Section 2.3"
// for treating Work Orders as SOWs, but that concept is §2.4 (Sequential
// engagements); 2.3 is Acceptance. Preserved as-is — a cross-reference is binding
// wording, so the correction is counsel's call, flagged for review.
//
// LEGAL STATUS: the v3 agreement was reviewed and approved by BC counsel
// (2026-06-18) and the model ratified by Jay; dispute resolution is binding
// arbitration in Vancouver. Keep the clause text stable, changes to binding
// wording go back through counsel. The [NEEDS INPUT] gate still blocks saving a
// contract that is missing facts (parties, fees, dates, Shift's own details).

import { FIRM_PARTY } from "./firm-party";

export type ContractFields = {
  // Client party
  clientLegalName: string;
  clientAddress: string;
  clientContactName: string;
  clientContactTitle: string;
  clientContactEmail: string;
  // Document
  effectiveDate: string; // human or ISO; blank → [NEEDS INPUT]
  projectName: string; // names the engagement / Schedule A
  recital: string; // one line of what's being built; optional
  // Commercials (Canadian dollars)
  buildFee: string; // one-time SOW development fee
  backgroundIpLicenseFee: string; // monthly, Section 5.5 / Schedule C
  supportFee: string; // annual Operate/support fee, Schedule C; optional
  paymentTerms: string; // the SOW payment schedule
  // Body
  scheduleAHtml: string; // AI-drafted Deliverable scope (Schedule A)
  preparedBy: string; // partner who prepared it; optional
};

// What the Generate Contract modal collects and the server actions pass in. The
// client-scoped and deal-scoped actions share this shape. The contact fields are
// filled by the action from the client/deal record, not the modal.
export type ContractIntake = {
  clientLegalName: string;
  clientAddress: string;
  effectiveDate: string;
  projectName: string;
  buildFee: string;
  backgroundIpLicenseFee: string;
  supportFee?: string;
  paymentTerms: string;
  recital?: string;
  scopeNotes?: string;
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Required field the firm owes. Present → the value. Missing, or already carrying
// a [NEEDS INPUT] marker → that marker text, kept LITERAL so the save gate
// (assertNoNeedsInput) blocks filing, and highlighted so it's obvious in the Doc.
function req(value: string | undefined | null, label: string): string {
  const v = (value ?? "").trim();
  if (!v || /\[NEEDS INPUT/i.test(v)) {
    const text = /\[NEEDS INPUT/i.test(v) ? v : `[NEEDS INPUT: ${label}]`;
    return `<span style="background:#fce8e6;color:#c5221f;font-weight:bold">${esc(text)}</span>`;
  }
  return esc(v);
}

// Optional fill-in the Client or signing completes. Present → the value; blank →
// an underscore fill-line they write on. Never blocks saving.
function blank(value?: string | null, len = 22): string {
  const v = (value ?? "").trim();
  return v ? esc(v) : "_".repeat(len);
}

// Schedule A (the AI-drafted SOW) marks two kinds of blank. A [NEEDS INPUT: …] is
// a fact the firm owes and was not given — it stays highlighted and blocks filing
// via the save gate, so it is left untouched here. A [FILL: …] is a value the
// Client or the signing/kickoff completes (a milestone date keyed to signature,
// the cloud provider) — convert it to an underscore fill-line that never blocks.
function softenFills(html: string): string {
  return String(html ?? "").replace(/\[FILL:[^\]]*\]/g, "_".repeat(16));
}

export function renderContract(f: ContractFields): string {
  const firm = FIRM_PARTY;
  const recital =
    (f.recital || "").trim() ||
    "Shift designs, builds, and conditionally sells a custom software system to the Client, and provides ongoing operate and support services, as set out in the Schedules.";

  const prov = esc(firm.governingProvince);

  // Plain, conversion-safe CSS. Google Docs' HTML importer honours headings,
  // bold/italic, text colour/highlight, paragraph indent, and table borders — and
  // ignores the rest — so this also serves as the on-screen preview style.
  const css = `
    body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;color:#1b1b1a;line-height:1.45;max-width:7.5in;margin:0 auto;padding:24px;}
    h1{font-size:20pt;margin:2px 0;}
    h2{font-size:13pt;margin:20px 0 6px;border-bottom:1px solid #cbc6bb;padding-bottom:3px;}
    h3{font-size:11.5pt;margin:14px 0 4px;}
    p{margin:6px 0;}
    p.sub{margin:4px 0 4px 22px;}
    .brand{font-weight:bold;letter-spacing:1.5px;color:#9a7b1f;margin:0 0 2px;}
    .muted{color:#5a574f;}
    .recital{color:#5a574f;font-style:italic;}
    table{border-collapse:collapse;width:100%;margin:8px 0;}
    th,td{border:1px solid #888;padding:6px 9px;text-align:left;vertical-align:top;}
    th{background:#f4f2ec;}
    hr{border:0;border-top:1px solid #cbc6bb;margin:20px 0;}`;

  const terms = `
    <h3>1. Definitions</h3>
    <p class="sub"><b>1.1 "Affiliate"</b> means any entity that controls, is controlled by, or is under common control with a Party.</p>
    <p class="sub"><b>1.2 "Authorized Users"</b> means employees and contractors of Client and its Affiliates who need access to the Deliverable to support Client's own internal business operations. There is no limit on the number of Authorized Users.</p>
    <p class="sub"><b>1.3 "Background IP"</b> means all software, source code, frameworks, libraries, tools, templates, methodologies, know-how, the AI orchestration and gateway layer, and other materials that (a) Shift owns or has rights to before a Statement of Work, or (b) Shift develops independently of any particular engagement for general reuse, in each case whether or not incorporated into a Deliverable.</p>
    <p class="sub"><b>1.4 "Client Data"</b> means data, content, or materials provided by or for Client, or generated through Client's use of a Deliverable, including any customer, employee, or operational data.</p>
    <p class="sub"><b>1.5 "Conditions"</b> means full and final payment of all Fees due under the applicable Statement of Work, together with any additional condition identified in that Statement of Work as a condition to vesting under Section 4.</p>
    <p class="sub"><b>1.6 "Confidential Information"</b> has the meaning in Section 8.</p>
    <p class="sub"><b>1.7 "Deliverable"</b> means the custom-developed software, source code, configurations, integrations, data models, and related documentation Shift develops specifically for Client under a Statement of Work, excluding any Background IP embedded in or required to operate it.</p>
    <p class="sub"><b>1.8 "Fees"</b> means the amounts payable by Client as set out in a Statement of Work or Schedule.</p>
    <p class="sub"><b>1.9 "Statement of Work" or "SOW"</b> means a project order in the form of Schedule A, executed by both Parties, describing the Deliverable, Fees, milestones, and payment schedule for an engagement.</p>
    <p class="sub"><b>1.10 "Vesting Date"</b> means the date on which the Conditions for a given Deliverable are satisfied in full.</p>

    <h3>2. Engagement and statements of work</h3>
    <p class="sub"><b>2.1 Governing framework.</b> This Agreement sets the general terms that govern every SOW between the Parties. Each SOW forms part of, and is governed by, this Agreement. If this Agreement and an SOW conflict, the SOW governs only for the Deliverable it describes.</p>
    <p class="sub"><b>2.2 Performance.</b> Shift will perform the development services and produce the Deliverable in each SOW using qualified personnel, in a professional and workmanlike manner, in accordance with the timeline, milestones, and acceptance process in that SOW.</p>
    <p class="sub"><b>2.3 Acceptance.</b> Where an SOW specifies acceptance criteria, the Deliverable or milestone is accepted on the earliest of: (a) Client's written notice of acceptance; (b) Client's use of it in live production; or (c) expiry of the review period stated in the SOW without Client giving notice of a material non-conformity.</p>
    <p class="sub"><b>2.4 Sequential engagements.</b> Work may begin with a pilot or initial SOW and continue with further SOWs or with retainer services under Schedule D. Each is governed by this Agreement on the same basis, including the conditional sale and vesting mechanics in Section 4. No separate master agreement is needed for later engagements.</p>

    <h3>3. Fees and payment</h3>
    <p class="sub"><b>3.1 Payment schedule.</b> Client will pay the Fees per the payment schedule in the applicable SOW.</p>
    <p class="sub"><b>3.2 Invoicing.</b> Unless an SOW states otherwise, invoices are due within thirty (30) days of the invoice date. Overdue amounts accrue interest at one and one-half percent (1.5%) per month, or the maximum rate permitted by law, whichever is lower.</p>
    <p class="sub"><b>3.3 Taxes.</b> Fees are exclusive of applicable GST, HST, PST, and similar taxes, which are Client's responsibility, excluding taxes on Shift's net income.</p>
    <p class="sub"><b>3.4 Currency.</b> All Fees are quoted and payable in Canadian dollars (CAD) unless the applicable SOW states otherwise.</p>

    <h3>4. Conditional sale and vesting of title to the Deliverable</h3>
    <p class="sub"><b>4.1 Conditional sale.</b> Shift agrees to sell, and Client agrees to purchase, all right, title, and interest in the Deliverable (excluding Background IP), conditioned on satisfaction of the Conditions. Until the Vesting Date, Shift retains sole ownership of the Deliverable and all intellectual property in it, notwithstanding delivery, installation, or Client's use.</p>
    <p class="sub"><b>4.2 Automatic vesting.</b> On the Vesting Date, title to the Deliverable transfers to Client automatically, subject to (a) Shift's retained ownership of Background IP under Section 5, and (b) the restrictions in Section 6.</p>
    <p class="sub"><b>4.3 Security interest.</b> To secure Client's payment obligations, Client grants Shift a purchase-money security interest in the Deliverable until the Vesting Date. At Shift's request, Client will execute the documents reasonably necessary for Shift to perfect that interest, including a <b>financing statement under the Personal Property Security Act (${prov})</b> registered in the ${prov} Personal Property Registry, or the equivalent filing in Client's jurisdiction.</p>
    <p class="sub"><b>4.4 Pre-vesting use.</b> Before the Vesting Date, Shift grants Client a non-exclusive, non-transferable licence to use the Deliverable for Client's internal business operations, on the same terms as apply after vesting under Section 6.</p>
    <p class="sub"><b>4.5 Default.</b> If Client fails to satisfy the Conditions when due and does not cure within thirty (30) days of written notice, Shift may, at its option: (a) suspend Client's access to the Deliverable; (b) repossess or disable it; and/or (c) pursue any remedy at law, in each case without prejudice to Shift's right to recover unpaid Fees.</p>

    <h3>5. Background IP</h3>
    <p class="sub"><b>5.1 Ownership retained.</b> Shift owns all right, title, and interest in the Background IP, whether created before, during, or after the term, and whether or not embedded in any Deliverable.</p>
    <p class="sub"><b>5.2 Licence grant.</b> On delivery of each Deliverable, and continuing afterward (including after the Vesting Date) for as long as Client uses that Deliverable, Shift grants Client a non-exclusive, non-transferable licence to use the Background IP solely as embedded in, and to the extent necessary to operate, the Deliverable, for Client's internal business operations. This licence is granted in consideration of the Background IP Licence Fee in Section 5.5 and is not royalty-free.</p>
    <p class="sub"><b>5.3 No standalone rights.</b> Nothing grants Client any right to extract, reverse engineer, separately licence, sell, or otherwise exploit the Background IP independently of the Deliverable in which it is embedded.</p>
    <p class="sub"><b>5.4 Background IP Schedule.</b> Schedule B, where completed, identifies the principal Background IP components in the Deliverable. Omission of a component does not affect Shift's ownership of it.</p>
    <p class="sub"><b>5.5 Background IP Licence Fee.</b> In consideration of the licence in Section 5.2, Client will pay the Background IP Licence Fee in Schedule C. This fee compensates Shift for ongoing maintenance, updates, and improvements to the Background IP, and is payable for as long as Client uses the Deliverable, regardless of whether the Vesting Date has occurred. If it remains unpaid more than thirty (30) days after it is due, Shift may suspend Client's licence to use the Background IP until the account is current.</p>

    <h3>6. Permitted use, restrictions, and change of control</h3>
    <p class="sub"><b>6.1 Permitted use.</b> Client and its Authorized Users may use the Deliverable, before and after the Vesting Date, solely for the internal business operations of Client and its Affiliates.</p>
    <p class="sub"><b>6.2 Restrictions.</b> Client will not, and will not permit any third party to: (a) sell, resell, licence, sublicence, lease, rent, distribute, or otherwise make the Deliverable or Background IP available to any third party, including a parent, subsidiary, or Affiliate not party to this Agreement, except as expressly permitted in an SOW; (b) use the Deliverable to provide a service bureau, outsourcing, software-as-a-service, or similar offering to a third party; (c) use the Deliverable to develop a competing product or service, or make it available to a person Shift could reasonably consider a competitor; (d) remove or alter any proprietary notice; or (e) reverse engineer, decompile, or disassemble the Background IP, except to the extent that restriction is unenforceable by law.</p>
    <p class="sub"><b>6.3 Transfer requires consent.</b> Client may not transfer, assign, or convey its rights in the Deliverable to any person, including in connection with a sale of Client's business or assets or a move to an affiliated company, without Shift's prior written consent. As a condition of any approved transfer, the transferee must agree in writing to assume Client's obligations under this Agreement, including Sections 5 and 6.</p>
    <p class="sub"><b>6.4 Change of control.</b> A direct or indirect change of control of Client, including a sale of all or substantially all of Client's business or assets, a merger or amalgamation, or a transfer of more than fifty percent (50%) of Client's voting or equity interests, requires Shift's prior written consent. The rights to the Deliverable and the licence to the Background IP are personal to Client, are granted for Client's own internal business operations, and do not pass to a successor or acquirer on a change of control without Shift's written consent. On a proposed change of control, the Parties will negotiate in good faith revised terms (including Fees) for the successor's continued use. If the Parties do not agree within sixty (60) days, Shift may terminate this Agreement and all licences granted under it.</p>

    <h3>7. Warranties, IP indemnity, and mutual indemnity</h3>
    <p class="sub"><b>7.1 IP warranty.</b> Shift warrants that the Deliverable, as delivered and used in accordance with this Agreement, does not infringe the intellectual property rights of any third party, and that Shift has the right to grant the licences in this Agreement.</p>
    <p class="sub"><b>7.2 IP indemnity.</b> Shift will defend Client against any third-party claim that the Deliverable infringes that party's intellectual property rights, and will indemnify Client for damages, costs, and reasonable legal fees finally awarded, provided Client promptly notifies Shift and lets Shift control the defence and settlement.</p>
    <p class="sub"><b>7.3 Exclusions.</b> Section 7.2 does not apply to a claim arising from (a) modification of the Deliverable by anyone other than Shift, (b) combination of the Deliverable with materials not supplied by Shift, (c) Client's use after Shift instructed Client to stop, or (d) third-party or open-source components, which are licensed under their own terms (Section 14.1).</p>
    <p class="sub"><b>7.4 Mutual indemnity.</b> Each Party will defend, indemnify, and hold the other and its directors, officers, employees, and Affiliates harmless from third-party claims arising from (a) that Party's negligence, willful misconduct, or fraud in performing this Agreement, or (b) that Party's violation of applicable law in performing this Agreement.</p>
    <p class="sub"><b>7.5 Performance warranty and disclaimer.</b> Shift warrants the services are performed in a professional and workmanlike manner and that it will not knowingly introduce malicious code. Except as expressly stated in this Agreement, and to the extent permitted by law, the Deliverable and services are provided without other warranties, including any implied warranty of merchantability or fitness for a particular purpose.</p>
    <p class="sub"><b>7.6 Deliverable warranty period.</b> For ${blank("", 8)} days after acceptance of a Deliverable (or, if blank, thirty (30) days), Shift will correct material defects in that Deliverable at no charge.</p>

    <h3>8. Confidentiality</h3>
    <p class="sub"><b>8.1 Definition.</b> "Confidential Information" means the contents of this Agreement (but not its existence) and all non-public information disclosed by one Party (the "Disclosing Party") to the other (the "Receiving Party") that is marked confidential or that a reasonable person would understand to be confidential, including business, technical, pricing, financial, and operational information.</p>
    <p class="sub"><b>8.2 Exclusions.</b> Confidential Information does not include information that (a) is or becomes public through no fault of the Receiving Party, (b) was lawfully known to the Receiving Party before disclosure, or (c) is independently developed without reference to the Disclosing Party's Confidential Information.</p>
    <p class="sub"><b>8.3 Protection.</b> The Receiving Party will protect the Disclosing Party's Confidential Information with at least the degree of care it uses for its own, and no less than reasonable care, and will use and disclose it only as needed to perform this Agreement. It may disclose to its contractors, employees, officers, Affiliates, and advisors who need to know and are bound by confidentiality obligations.</p>
    <p class="sub"><b>8.4 Trade secrets; compelled disclosure.</b> Obligations for a trade secret survive for as long as it remains a trade secret. The Receiving Party may disclose Confidential Information to the extent legally compelled, on notice to the Disclosing Party where lawful.</p>
    <p class="sub"><b>8.5 Return; remedies; survival.</b> On termination, at the Disclosing Party's request, the Receiving Party will return or destroy and certify destruction of the Confidential Information. The Disclosing Party may seek injunctive relief and specific performance for breach. This Section survives termination.</p>

    <h3>9. Client data and privacy</h3>
    <p class="sub"><b>9.1 Ownership.</b> As between the Parties, Client owns all Client Data. Shift will use Client Data only to perform its obligations under this Agreement.</p>
    <p class="sub"><b>9.2 Client responsibility.</b> Client is responsible for ensuring its collection, use, and disclosure of Client Data, including any personal information processed through the Deliverable, complies with applicable law, and for obtaining any required consents. Client will indemnify Shift against claims arising from Client's or an Authorized User's unlawful collection, use, or disclosure of Client Data.</p>
    <p class="sub"><b>9.3 Shift safeguards.</b> Shift will protect personal information in the Client Data with security safeguards appropriate to its sensitivity, comparable to the protection required of Client under the Personal Information Protection Act (${prov}) and PIPEDA, and will process personal information only on Client's instructions as a service provider.</p>
    <p class="sub"><b>9.4 Breach notice; sub-processors.</b> Shift will notify Client without undue delay on becoming aware of a security breach affecting Client Data, and will cooperate in Client's response. Shift will bind any sub-processor to terms at least as protective and remains responsible for the sub-processor's compliance.</p>
    <p class="sub"><b>9.5 Return or deletion.</b> On termination, Shift will return or delete Client Data at Client's direction, except where law requires retention.</p>
    <p class="sub"><b>9.6 General data; feedback.</b> Client agrees that Shift may use de-identified, aggregated data that does not identify Client or any individual ("General Data"), and any feedback or suggestions Client provides, to maintain and improve the Background IP and to develop new services. Shift will not disclose Client's identifiable Client Data to other clients.</p>

    <h3>10. Limitation of liability</h3>
    <p class="sub"><b>10.1 Exclusion of indirect damages.</b> Neither Party is liable for indirect, incidental, special, or consequential damages, or for loss of profits, revenue, or data, arising out of this Agreement, even if advised of the possibility.</p>
    <p class="sub"><b>10.2 Cap.</b> Except for (a) a Party's indemnification obligations, (b) breach of Section 8 (Confidentiality), (c) Client's payment obligations, and (d) a Party's gross negligence or willful misconduct, each Party's total aggregate liability arising out of this Agreement will not exceed <b>the greater of (i) fifty percent (50%) of the total Fees payable under the applicable SOW, or (ii) the Fees paid by Client in the six (6) months preceding the claim.</b></p>

    <h3>11. Business continuity and Background IP escrow</h3>
    <p class="sub">Because the Deliverable cannot operate without the Background IP, Shift will, on Client's request, place and maintain the Background IP source needed to operate the Deliverable in escrow with a third-party agent. The agent will release it to Client only on (a) Shift's insolvency, bankruptcy, or cessation of business; (b) Shift's material breach of its support obligations uncured after written notice and a reasonable cure period; or (c) Shift's discontinuation of the product with no successor. A release lets Client use the Background IP source only for its own internal maintenance of the Deliverable and transfers no ownership of the Background IP.</p>

    <h3>12. Term and termination</h3>
    <p class="sub"><b>12.1 Term.</b> This Agreement begins on the Effective Date and continues until all SOWs under it have expired or been terminated.</p>
    <p class="sub"><b>12.2 Termination for cause.</b> Either Party may terminate an SOW for the other's uncured material breach, on thirty (30) days' written notice specifying the breach, if it remains uncured at the end of that period.</p>
    <p class="sub"><b>12.3 Default.</b> Shift may suspend or terminate access to the Deliverable as set out in Section 4.5.</p>

    <h3>13. Effect of termination</h3>
    <p class="sub"><b>13.1 Before vesting.</b> If an SOW terminates before the Vesting Date for any reason other than Shift's uncured material breach, Client's licence to use the Deliverable ends immediately, and Client will, at Shift's option, return or certify destruction of all copies of the Deliverable.</p>
    <p class="sub"><b>13.2 Shift's breach before vesting.</b> If an SOW terminates before the Vesting Date because of Shift's uncured material breach, Client is entitled, at its election, to a refund of Fees paid for the unaccepted work, or to vesting of title to the work paid for and accepted.</p>
    <p class="sub"><b>13.3 After vesting.</b> If the Vesting Date has occurred, Client's ownership of the Deliverable is unaffected by termination, but the Background IP licence under Section 5.2 and the restrictions in Section 6 survive for as long as Client uses the Deliverable.</p>
    <p class="sub"><b>13.4 Survival.</b> Sections 1, 5, 6, 7, 8, 9, 10, 11, 13, and 15 survive termination or expiry.</p>

    <h3>14. Additional covenants</h3>
    <p class="sub"><b>14.1 Open-source and third-party components.</b> The Deliverable may include open-source and third-party components, which are licensed under their own terms and are outside Shift's warranty in Section 7.1. Client will comply with those terms.</p>
    <p class="sub"><b>14.2 Audit.</b> On reasonable notice, Shift may verify that Client's use of the Deliverable and Background IP complies with the licence scope and Section 6 restrictions.</p>
    <p class="sub"><b>14.3 Non-solicitation.</b> During the term and for twelve (12) months after, Client will not solicit for employment or hire any Shift personnel who worked on the engagement, except through general advertising not targeted at them.</p>
    <p class="sub"><b>14.4 Service levels.</b> Operate-phase service levels (availability, support response times, and any service-credit remedy) are set out in Schedule C.</p>

    <h3>15. General provisions</h3>
    <p class="sub"><b>15.1 Governing law and dispute resolution.</b> This Agreement is governed by the laws of ${prov} and the federal laws of Canada applicable there, without regard to conflict-of-law principles. The Parties will first try in good faith to resolve any dispute by negotiation, then by mediation. If it is not resolved, the dispute is finally resolved by binding arbitration seated in ${esc(firm.forumCity)} under the Arbitration Act (${prov}).</p>
    <p class="sub"><b>15.2 Notices.</b> Notices must be in writing and delivered in person, by email, or by registered mail to the addresses on the cover page, and are deemed received on delivery (or, if after 5:00 p.m. at the place of receipt or on a non-business day, the next business day).</p>
    <p class="sub"><b>15.3 Assignment.</b> Neither Party may assign this Agreement without the other's prior written consent; Client assignment is further subject to Section 6.4 (Change of control). Shift may assign to a successor in a merger or sale of substantially all of its assets on notice.</p>
    <p class="sub"><b>15.4 Independent contractor.</b> Shift is an independent contractor. Nothing creates a partnership, joint venture, or employment relationship.</p>
    <p class="sub"><b>15.5 Force majeure.</b> Neither Party is liable for delay or failure caused by events beyond its reasonable control.</p>
    <p class="sub"><b>15.6 Severability; waiver; cumulative remedies.</b> If a provision is unenforceable, the rest stays in effect. A failure to enforce is not a waiver. Remedies are cumulative.</p>
    <p class="sub"><b>15.7 Order of precedence.</b> If this Agreement, an SOW, and a Schedule conflict, the SOW governs for its Deliverable, then the relevant Schedule, then this Agreement.</p>
    <p class="sub"><b>15.8 Entire agreement; amendment.</b> This Agreement, with all SOWs and Schedules, is the entire agreement and supersedes prior proposals and communications. It may be amended only by a writing signed by both Parties.</p>
    <p class="sub"><b>15.9 Counterparts; electronic signature; language.</b> This Agreement may be signed in counterparts and by electronic signature, each an original and together one agreement, consistent with the Electronic Transactions Act (${prov}). The Parties require it to be in English.</p>`;

  const commercialSummary = `
    <table>
      <tr><th style="width:34%">One-time build fee (SOW)</th><td>${req(f.buildFee, "build fee in CAD")} CAD, plus applicable taxes</td></tr>
      <tr><th>Background IP Licence Fee</th><td>${req(f.backgroundIpLicenseFee, "monthly Background IP Licence Fee in CAD")} CAD per month (Section 5.5 / Schedule C)</td></tr>
      <tr><th>Operate &amp; support fee</th><td>${f.supportFee?.trim() ? esc(f.supportFee) + " CAD per year (Schedule C)" : blank("", 16) + " (Schedule C)"}</td></tr>
      <tr><th>Payment schedule</th><td>${req(f.paymentTerms, "payment schedule, e.g. 40% on signing / 40% at build start / 20% on acceptance; net 30")}</td></tr>
      <tr><th>Currency &amp; taxes</th><td>All amounts in Canadian dollars. GST, HST, and PST are added where they apply.</td></tr>
    </table>`;

  const clientName = req(f.clientLegalName, "Client legal name");

  const sigBlock = (clientLabel: string) => `
    <table>
      <tr>
        <td style="width:50%">
          <b>${esc(firm.legalName)} ("Shift")</b><br/><br/>
          Signature: ${"_".repeat(28)}<br/>
          Name: ${blank(firm.signatoryName, 24)}<br/>
          Title: ${"_".repeat(24)}<br/>
          Date: ${"_".repeat(18)}
        </td>
        <td style="width:50%">
          <b>${clientLabel} ("Client")</b><br/><br/>
          Signature: ${"_".repeat(28)}<br/>
          Name: ${blank(f.clientContactName, 24)}<br/>
          Title: ${blank(f.clientContactTitle, 24)}<br/>
          Date: ${"_".repeat(18)}
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Master Conditional Sale and Custom Software Development Agreement — ${esc(f.clientLegalName || "Client")}</title>
<style>${css}</style>
</head>
<body>
  <p class="brand">SHIFT AI PARTNERS</p>
  <h1>Master Conditional Sale and Custom Software Development Agreement</h1>
  <p class="recital">${esc(recital)}</p>

  <p><span class="muted">Provider ("Shift")</span><br/>
  <b>${req(firm.partyName, "Shift party name")}</b><br/>
  ${esc(firm.partyDescriptor)}<br/>
  ${firm.incorporated ? `Incorporation no. ${blank(firm.incorporationNumber, 18)}<br/>` : ""}${req(firm.address, "Shift registered address")}<br/>
  ${esc(firm.noticeEmail)}</p>

  <p><span class="muted">Client ("Customer")</span><br/>
  <b>${clientName}</b><br/>
  ${blank(f.clientAddress, 32)}<br/>
  Attn: ${blank(f.clientContactName, 24)}${f.clientContactTitle ? `, ${esc(f.clientContactTitle)}` : ""}<br/>
  ${f.clientContactEmail ? esc(f.clientContactEmail) : blank("", 24)}</p>

  <p><b>Effective date:</b> ${req(f.effectiveDate, "effective date")} &nbsp;&middot;&nbsp; <b>Governing law:</b> ${prov} &nbsp;&middot;&nbsp; <b>Engagement:</b> ${req(f.projectName, "project / engagement name")}</p>

  <p>This Agreement is entered into as of the Effective Date by and between ${esc(firm.legalName)} ("Shift") and the Client named above ("Client"). It sets out the general terms on which Shift designs, builds, and conditionally sells custom software systems to Client, and incorporates by reference each Statement of Work executed under Schedule A and the Operate, Support &amp; Background IP Licence terms at Schedule C. Neither Party is bound until both have signed this Agreement and at least one Statement of Work.</p>

  <h2>Commercial summary</h2>
  ${commercialSummary}
  <p class="muted">Detailed scope is Schedule A; commercial detail is Schedules A and C. The Terms and Conditions that follow, and the Schedules, form part of this Agreement.</p>

  <h2>Terms and conditions</h2>
  ${terms}

  <hr/>
  <h2>Signatures</h2>
  <p>The Parties have executed this Agreement as of the Effective Date. This Agreement may be signed in counterparts and electronically.</p>
  ${sigBlock(clientName)}

  <hr/>
  <h2>Schedule A — Statement of Work</h2>
  <p class="muted">Entered into under, and governed by, this Agreement. Project: ${req(f.projectName, "project / engagement name")}.</p>
  ${f.scheduleAHtml ? softenFills(f.scheduleAHtml) : `<p>${req("", "Schedule A — Deliverable scope of work")}</p>`}
  <h3>Fees and payment</h3>
  <table>
    <tr><th>Item</th><th>Amount</th><th>Due</th></tr>
    <tr><td>Build fee (this SOW)</td><td>${req(f.buildFee, "build fee in CAD")} CAD</td><td>${req(f.paymentTerms, "payment schedule")}</td></tr>
  </table>
  <h3>Conditions for vesting</h3>
  <p>Unless stated otherwise above, the Conditions for vesting of title under Section 4 are full and final payment of the total Fees for this SOW.</p>
  ${sigBlock(clientName)}

  <hr/>
  <h2>Schedule B — Background IP Schedule</h2>
  <p class="muted">Identifies the principal Background IP (Section 1.3) embedded in the Deliverable. Shift retains ownership of each item listed, and of any Background IP not listed, per Section 5.</p>
  <table>
    <tr><th style="width:34%">Component</th><th>Description</th></tr>
    <tr><td>AI orchestration / gateway layer</td><td>The audited gateway routing AI requests, shared across Shift client systems.</td></tr>
    <tr><td>Platform framework &amp; pattern library</td><td>Shift's reusable application framework, agent and skill engine, dashboards, and integration patterns.</td></tr>
    <tr><td>${"_".repeat(20)}</td><td>${"_".repeat(40)}</td></tr>
  </table>

  <hr/>
  <h2>Schedule C — Operate, Support &amp; Background IP Licence</h2>
  <p>This Schedule sets out (a) the maintenance and support Shift provides for the Deliverable (the "Operate Services"), and (b) the Background IP Licence Fee payable under Section 5.5. Both are governed by this Agreement.</p>
  <h3>Fees, billing, and renewal</h3>
  <table>
    <tr><th>Item</th><th>Fee</th><th>Billing</th></tr>
    <tr><td>Operate &amp; support</td><td>${f.supportFee?.trim() ? esc(f.supportFee) + " CAD" : blank("", 14)}</td><td>Annual, auto-renewing</td></tr>
    <tr><td>Background IP Licence Fee (Section 5.5)</td><td>${req(f.backgroundIpLicenseFee, "monthly Background IP Licence Fee in CAD")} CAD</td><td>Monthly</td></tr>
  </table>
  <h3>Services and support hours</h3>
  <p>Operate Services include software warranty and error correction for the Deliverable, email and telephone support during support hours, and ongoing maintenance, updates, and improvements to the Background IP. Support hours: ${blank("8:30–17:00 PT, Monday to Friday, excluding statutory holidays")}.</p>
  <h3>Renewal and suspension</h3>
  <p>The annual Operate fee renews automatically each year on the anniversary of its start date unless either Party gives written notice of non-renewal at least ninety (90) days before. The Background IP Licence Fee is billed monthly for as long as Client uses the Deliverable, and non-payment may result in suspension as set out in Section 5.5.</p>

  <hr/>
  <h2>Schedule D — Retainer Services (optional)</h2>
  <p>This Schedule applies only if the Parties agree retainer-based services. Work is scoped through written Work Orders, each treated as an SOW under Section 2.3 and Section 4, so title to each Work Order's Deliverable vests as it is completed and paid for.</p>
  <table>
    <tr><th style="width:34%">Retainer start date</th><td>${"_".repeat(24)}</td></tr>
    <tr><th>Monthly capacity</th><td>${"_".repeat(14)} hours per month</td></tr>
    <tr><th>Monthly retainer fee</th><td>${"_".repeat(14)} CAD, due in advance on the first of each month</td></tr>
    <tr><th>Overage rate</th><td>${"_".repeat(14)} CAD per hour, billed in 15-minute increments</td></tr>
    <tr><th>Cancellation</th><td>Renews monthly; either Party may cancel on thirty (30) days' written notice. Cancellation does not affect vesting already achieved for completed, paid Work Orders.</td></tr>
  </table>

  <hr/>
  <p class="muted">Prepared by ${f.preparedBy ? esc(f.preparedBy) : blank("", 18)} &middot; ${esc(firm.operatingName)}${firm.incorporated ? ` (${esc(firm.legalName)})` : ""}. The firm's standard agreement. Complete every field before signing.</p>
</body>
</html>`;
}
