// The firm's standard client agreement, rendered as one self-contained,
// fillable HTML document with a Download-PDF (browser print) button.
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

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Required fillable field: a blank (or already-marked) value renders as a red,
// save-blocking [NEEDS INPUT] marker. Editable in the browser before print.
function fld(value: string | undefined | null, label: string): string {
  const v = (value ?? "").trim();
  if (!v || /\[NEEDS INPUT/i.test(v)) {
    const text = /\[NEEDS INPUT/i.test(v) ? v : `[NEEDS INPUT: ${label}]`;
    return `<span class="fld needs" contenteditable="true">${esc(text)}</span>`;
  }
  return `<span class="fld" contenteditable="true">${esc(v)}</span>`;
}

// Optional fillable field (signature names, dates, fill-at-signing details): a
// blank renders as an empty editable fill-line, never a save-blocking marker.
function line(value?: string | null, minWidth = "180px"): string {
  return `<span class="fld soft" style="min-width:${minWidth}" contenteditable="true">${esc((value ?? "").trim())}</span>`;
}

export function renderContract(f: ContractFields): string {
  const firm = FIRM_PARTY;
  const recital =
    (f.recital || "").trim() ||
    "Shift designs, builds, and conditionally sells a custom software system to the Client, and provides ongoing operate and support services, as set out in the Schedules.";

  const css = `
    :root{
      --ink:#1b1b1a; --muted:#5a574f; --rule:#cbc6bb; --gold:#9a7b1f;
      --needs:#9F2521; --fill:#1457a6; --paper:#ffffff; --canvas:#e9e7e2;
    }
    *{box-sizing:border-box;}
    html,body{margin:0;padding:0;}
    body{background:var(--canvas);color:var(--ink);
      font-family:Georgia,"Times New Roman",serif;font-size:11.5pt;line-height:1.55;}
    .toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;
      justify-content:space-between;gap:16px;padding:10px 18px;background:#1b1b1a;color:#f3f1ec;
      font-family:ui-sans-serif,system-ui,"Segoe UI",Arial,sans-serif;font-size:13px;}
    .toolbar button{font:inherit;font-weight:600;cursor:pointer;border:0;border-radius:6px;
      padding:8px 16px;background:var(--gold);color:#1b1b1a;}
    .toolbar .hint{color:#cfc9bd;font-size:12px;}
    .page{max-width:8.5in;margin:24px auto;background:var(--paper);padding:0.9in 0.85in;
      box-shadow:0 6px 30px rgba(0,0,0,.18);}
    h1,h2,h3,h4,.masthead,.label,.tag,.toolbar,table{font-family:ui-sans-serif,system-ui,"Segoe UI",Arial,sans-serif;}
    .masthead{display:flex;align-items:baseline;justify-content:space-between;
      border-bottom:2px solid var(--ink);padding-bottom:8px;margin-bottom:4px;}
    .masthead .brand{font-weight:700;letter-spacing:.04em;font-size:15px;text-transform:uppercase;}
    .masthead .brand b{color:var(--gold);}
    .masthead .doctype{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:right;}
    h1.title{font-size:19px;margin:14px 0 2px;}
    .subtitle{color:var(--muted);font-style:italic;margin:0 0 16px;font-size:12pt;}
    .banner{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--needs);
      background:#fbeaea;color:var(--needs);border-radius:6px;padding:10px 12px;margin:0 0 18px;
      font-family:ui-sans-serif,system-ui,Arial,sans-serif;font-size:11px;line-height:1.45;}
    .banner b{font-weight:700;}
    h2{font-size:13px;letter-spacing:.02em;text-transform:uppercase;margin:22px 0 6px;
      padding-bottom:3px;border-bottom:1px solid var(--rule);}
    h3{font-size:12px;margin:14px 0 4px;}
    p{margin:6px 0;}
    .parties{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0 4px;}
    .party{border:1px solid var(--rule);border-radius:6px;padding:10px 12px;}
    .party .label,.summary .label{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
    .party .who{font-weight:700;margin-top:2px;}
    .party .meta{font-size:10.5pt;color:var(--muted);margin-top:3px;}
    table.summary{width:100%;border-collapse:collapse;margin:8px 0;font-size:10.6pt;}
    table.summary th,table.summary td{text-align:left;border:1px solid var(--rule);padding:7px 9px;vertical-align:top;}
    table.summary th{background:#f4f2ec;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);width:34%;}
    ol.terms{margin:6px 0;padding-left:0;counter-reset:sec;list-style:none;}
    ol.terms>li{counter-increment:sec;margin:15px 0;padding-left:30px;position:relative;}
    ol.terms>li::before{content:counter(sec) ".";position:absolute;left:0;top:0;
      font-family:ui-sans-serif,system-ui,Arial,sans-serif;font-weight:700;color:var(--gold);}
    ol.terms>li>.h{font-family:ui-sans-serif,system-ui,Arial,sans-serif;font-weight:700;
      font-size:11.5pt;display:block;margin-bottom:3px;}
    ol.sub{margin:5px 0 0;padding-left:20px;}
    ol.sub>li{margin:4px 0;}
    .fld{font-family:inherit;color:var(--fill);border-bottom:1px dotted var(--fill);
      padding:0 2px;display:inline-block;min-width:60px;outline:none;}
    .fld.soft{color:var(--ink);border-bottom:1px solid var(--ink);min-height:1.2em;}
    .fld.needs{color:var(--needs);font-weight:700;border-bottom:1px dotted var(--needs);}
    .counsel{color:var(--gold);font-style:italic;font-family:ui-sans-serif,system-ui,Arial,sans-serif;font-size:9.5pt;}
    .pagebreak{break-before:page;}
    .sched-body{font-size:11pt;}
    .sched-body h3{text-transform:none;font-family:ui-sans-serif,system-ui,Arial,sans-serif;}
    .sched-body table{border-collapse:collapse;width:100%;margin:6px 0;}
    .sched-body td,.sched-body th{border:1px solid var(--rule);padding:6px 8px;font-size:10.5pt;}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:18px;}
    .sign .box .label{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
    .sign .sigline{margin-top:26px;border-top:1px solid var(--ink);padding-top:4px;font-size:10pt;color:var(--muted);}
    .foot{margin-top:26px;border-top:1px solid var(--rule);padding-top:8px;color:var(--muted);font-size:9.5pt;}
    @media print{
      body{background:#fff;}
      .toolbar,.screen-only{display:none !important;}
      .page{box-shadow:none;margin:0;max-width:none;padding:0;}
      .fld{border-bottom:none;color:#1b1b1a;}
      .fld.soft{border-bottom:1px solid #1b1b1a;}
      .fld.needs{color:var(--needs);} /* stay red so an unfinished print is obvious */
      .pagebreak{break-before:page;}
      @page{size:letter;margin:0.75in;}
    }
  `;

  const prov = esc(firm.governingProvince);

  const terms = `
  <ol class="terms">
    <li><span class="h">Definitions</span>
      <ol class="sub">
        <li><b>"Affiliate"</b> means any entity that controls, is controlled by, or is under common control with a Party.</li>
        <li><b>"Authorized Users"</b> means employees and contractors of Client and its Affiliates who need access to the Deliverable to support Client's own internal business operations. There is no limit on the number of Authorized Users.</li>
        <li><b>"Background IP"</b> means all software, source code, frameworks, libraries, tools, templates, methodologies, know-how, the AI orchestration and gateway layer, and other materials that (a) Shift owns or has rights to before a Statement of Work, or (b) Shift develops independently of any particular engagement for general reuse, in each case whether or not incorporated into a Deliverable.</li>
        <li><b>"Client Data"</b> means data, content, or materials provided by or for Client, or generated through Client's use of a Deliverable, including any customer, employee, or operational data.</li>
        <li><b>"Conditions"</b> means full and final payment of all Fees due under the applicable Statement of Work, together with any additional condition identified in that Statement of Work as a condition to vesting under Section 4.</li>
        <li><b>"Confidential Information"</b> has the meaning in Section 8.</li>
        <li><b>"Deliverable"</b> means the custom-developed software, source code, configurations, integrations, data models, and related documentation Shift develops specifically for Client under a Statement of Work, excluding any Background IP embedded in or required to operate it.</li>
        <li><b>"Fees"</b> means the amounts payable by Client as set out in a Statement of Work or Schedule.</li>
        <li><b>"Statement of Work"</b> or <b>"SOW"</b> means a project order in the form of Schedule A, executed by both Parties, describing the Deliverable, Fees, milestones, and payment schedule for an engagement.</li>
        <li><b>"Vesting Date"</b> means the date on which the Conditions for a given Deliverable are satisfied in full.</li>
      </ol></li>

    <li><span class="h">Engagement and statements of work</span>
      <ol class="sub">
        <li><b>Governing framework.</b> This Agreement sets the general terms that govern every SOW between the Parties. Each SOW forms part of, and is governed by, this Agreement. If this Agreement and an SOW conflict, the SOW governs only for the Deliverable it describes.</li>
        <li><b>Performance.</b> Shift will perform the development services and produce the Deliverable in each SOW using qualified personnel, in a professional and workmanlike manner, in accordance with the timeline, milestones, and acceptance process in that SOW.</li>
        <li><b>Acceptance.</b> Where an SOW specifies acceptance criteria, the Deliverable or milestone is accepted on the earliest of: (a) Client's written notice of acceptance; (b) Client's use of it in live production; or (c) expiry of the review period stated in the SOW without Client giving notice of a material non-conformity.</li>
        <li><b>Sequential engagements.</b> Work may begin with a pilot or initial SOW and continue with further SOWs or with retainer services under Schedule D. Each is governed by this Agreement on the same basis, including the conditional sale and vesting mechanics in Section 4. No separate master agreement is needed for later engagements.</li>
      </ol></li>

    <li><span class="h">Fees and payment</span>
      <ol class="sub">
        <li><b>Payment schedule.</b> Client will pay the Fees per the payment schedule in the applicable SOW.</li>
        <li><b>Invoicing.</b> Unless an SOW states otherwise, invoices are due within thirty (30) days of the invoice date. Overdue amounts accrue interest at one and one-half percent (1.5%) per month, or the maximum rate permitted by law, whichever is lower.</li>
        <li><b>Taxes.</b> Fees are exclusive of applicable GST, HST, PST, and similar taxes, which are Client's responsibility, excluding taxes on Shift's net income.</li>
        <li><b>Currency.</b> All Fees are quoted and payable in Canadian dollars (CAD) unless the applicable SOW states otherwise.</li>
      </ol></li>

    <li><span class="h">Conditional sale and vesting of title to the Deliverable</span>
      <ol class="sub">
        <li><b>Conditional sale.</b> Shift agrees to sell, and Client agrees to purchase, all right, title, and interest in the Deliverable (excluding Background IP), conditioned on satisfaction of the Conditions. Until the Vesting Date, Shift retains sole ownership of the Deliverable and all intellectual property in it, notwithstanding delivery, installation, or Client's use.</li>
        <li><b>Automatic vesting.</b> On the Vesting Date, title to the Deliverable transfers to Client automatically, subject to (a) Shift's retained ownership of Background IP under Section 5, and (b) the restrictions in Section 6.</li>
        <li><b>Security interest.</b> To secure Client's payment obligations, Client grants Shift a purchase-money security interest in the Deliverable until the Vesting Date. At Shift's request, Client will execute the documents reasonably necessary for Shift to perfect that interest, including a <b>financing statement under the Personal Property Security Act (${prov})</b> registered in the ${prov} Personal Property Registry, or the equivalent filing in Client's jurisdiction.</li>
        <li><b>Pre-vesting use.</b> Before the Vesting Date, Shift grants Client a non-exclusive, non-transferable licence to use the Deliverable for Client's internal business operations, on the same terms as apply after vesting under Section 6.</li>
        <li><b>Default.</b> If Client fails to satisfy the Conditions when due and does not cure within thirty (30) days of written notice, Shift may, at its option: (a) suspend Client's access to the Deliverable; (b) repossess or disable it; and/or (c) pursue any remedy at law, in each case without prejudice to Shift's right to recover unpaid Fees.</li>
      </ol></li>

    <li><span class="h">Background IP</span>
      <ol class="sub">
        <li><b>Ownership retained.</b> Shift owns all right, title, and interest in the Background IP, whether created before, during, or after the term, and whether or not embedded in any Deliverable.</li>
        <li><b>Licence grant.</b> On delivery of each Deliverable, and continuing afterward (including after the Vesting Date) for as long as Client uses that Deliverable, Shift grants Client a non-exclusive, non-transferable licence to use the Background IP solely as embedded in, and to the extent necessary to operate, the Deliverable, for Client's internal business operations. This licence is granted in consideration of the Background IP Licence Fee in Section 5.5 and is not royalty-free.</li>
        <li><b>No standalone rights.</b> Nothing grants Client any right to extract, reverse engineer, separately licence, sell, or otherwise exploit the Background IP independently of the Deliverable in which it is embedded.</li>
        <li><b>Background IP Schedule.</b> Schedule B, where completed, identifies the principal Background IP components in the Deliverable. Omission of a component does not affect Shift's ownership of it.</li>
        <li><b>Background IP Licence Fee.</b> In consideration of the licence in Section 5.2, Client will pay the Background IP Licence Fee in Schedule C. This fee compensates Shift for ongoing maintenance, updates, and improvements to the Background IP, and is payable for as long as Client uses the Deliverable, regardless of whether the Vesting Date has occurred. If it remains unpaid more than thirty (30) days after it is due, Shift may suspend Client's licence to use the Background IP until the account is current.</li>
      </ol></li>

    <li><span class="h">Permitted use, restrictions, and change of control</span>
      <ol class="sub">
        <li><b>Permitted use.</b> Client and its Authorized Users may use the Deliverable, before and after the Vesting Date, solely for the internal business operations of Client and its Affiliates.</li>
        <li><b>Restrictions.</b> Client will not, and will not permit any third party to: (a) sell, resell, licence, sublicence, lease, rent, distribute, or otherwise make the Deliverable or Background IP available to any third party, including a parent, subsidiary, or Affiliate not party to this Agreement, except as expressly permitted in an SOW; (b) use the Deliverable to provide a service bureau, outsourcing, software-as-a-service, or similar offering to a third party; (c) use the Deliverable to develop a competing product or service, or make it available to a person Shift could reasonably consider a competitor; (d) remove or alter any proprietary notice; or (e) reverse engineer, decompile, or disassemble the Background IP, except to the extent that restriction is unenforceable by law.</li>
        <li><b>Transfer requires consent.</b> Client may not transfer, assign, or convey its rights in the Deliverable to any person, including in connection with a sale of Client's business or assets or a move to an affiliated company, without Shift's prior written consent. As a condition of any approved transfer, the transferee must agree in writing to assume Client's obligations under this Agreement, including Sections 5 and 6.</li>
        <li><b>Change of control.</b> A direct or indirect change of control of Client, including a sale of all or substantially all of Client's business or assets, a merger or amalgamation, or a transfer of more than fifty percent (50%) of Client's voting or equity interests, requires Shift's prior written consent. The rights to the Deliverable and the licence to the Background IP are personal to Client, are granted for Client's own internal business operations, and do not pass to a successor or acquirer on a change of control without Shift's written consent. On a proposed change of control, the Parties will negotiate in good faith revised terms (including Fees) for the successor's continued use. If the Parties do not agree within sixty (60) days, Shift may terminate this Agreement and all licences granted under it.</li>
      </ol></li>

    <li><span class="h">Warranties, IP indemnity, and mutual indemnity</span>
      <ol class="sub">
        <li><b>IP warranty.</b> Shift warrants that the Deliverable, as delivered and used in accordance with this Agreement, does not infringe the intellectual property rights of any third party, and that Shift has the right to grant the licences in this Agreement.</li>
        <li><b>IP indemnity.</b> Shift will defend Client against any third-party claim that the Deliverable infringes that party's intellectual property rights, and will indemnify Client for damages, costs, and reasonable legal fees finally awarded, provided Client promptly notifies Shift and lets Shift control the defence and settlement.</li>
        <li><b>Exclusions.</b> Section 7.2 does not apply to a claim arising from (a) modification of the Deliverable by anyone other than Shift, (b) combination of the Deliverable with materials not supplied by Shift, (c) Client's use after Shift instructed Client to stop, or (d) third-party or open-source components, which are licensed under their own terms (Section 15.1).</li>
        <li><b>Mutual indemnity.</b> Each Party will defend, indemnify, and hold the other and its directors, officers, employees, and Affiliates harmless from third-party claims arising from (a) that Party's negligence, willful misconduct, or fraud in performing this Agreement, or (b) that Party's violation of applicable law in performing this Agreement.</li>
        <li><b>Performance warranty and disclaimer.</b> Shift warrants the services are performed in a professional and workmanlike manner and that it will not knowingly introduce malicious code. Except as expressly stated in this Agreement, and to the extent permitted by law, the Deliverable and services are provided without other warranties, including any implied warranty of merchantability or fitness for a particular purpose.</li>
        <li><b>Deliverable warranty period.</b> For ${line("", "70px")} days after acceptance of a Deliverable (or, if blank, thirty (30) days), Shift will correct material defects in that Deliverable at no charge.</li>
      </ol></li>

    <li><span class="h">Confidentiality</span>
      <ol class="sub">
        <li><b>Definition.</b> "Confidential Information" means the contents of this Agreement (but not its existence) and all non-public information disclosed by one Party (the "Disclosing Party") to the other (the "Receiving Party") that is marked confidential or that a reasonable person would understand to be confidential, including business, technical, pricing, financial, and operational information.</li>
        <li><b>Exclusions.</b> Confidential Information does not include information that (a) is or becomes public through no fault of the Receiving Party, (b) was lawfully known to the Receiving Party before disclosure, or (c) is independently developed without reference to the Disclosing Party's Confidential Information.</li>
        <li><b>Protection.</b> The Receiving Party will protect the Disclosing Party's Confidential Information with at least the degree of care it uses for its own, and no less than reasonable care, and will use and disclose it only as needed to perform this Agreement. It may disclose to its contractors, employees, officers, Affiliates, and advisors who need to know and are bound by confidentiality obligations.</li>
        <li><b>Trade secrets; compelled disclosure.</b> Obligations for a trade secret survive for as long as it remains a trade secret. The Receiving Party may disclose Confidential Information to the extent legally compelled, on notice to the Disclosing Party where lawful.</li>
        <li><b>Return; remedies; survival.</b> On termination, at the Disclosing Party's request, the Receiving Party will return or destroy and certify destruction of the Confidential Information. The Disclosing Party may seek injunctive relief and specific performance for breach. This Section survives termination.</li>
      </ol></li>

    <li><span class="h">Client data and privacy</span>
      <ol class="sub">
        <li><b>Ownership.</b> As between the Parties, Client owns all Client Data. Shift will use Client Data only to perform its obligations under this Agreement.</li>
        <li><b>Client responsibility.</b> Client is responsible for ensuring its collection, use, and disclosure of Client Data, including any personal information processed through the Deliverable, complies with applicable law, and for obtaining any required consents. Client will indemnify Shift against claims arising from Client's or an Authorized User's unlawful collection, use, or disclosure of Client Data.</li>
        <li><b>Shift safeguards.</b> Shift will protect personal information in the Client Data with security safeguards appropriate to its sensitivity, comparable to the protection required of Client under the Personal Information Protection Act (${prov}) and PIPEDA, and will process personal information only on Client's instructions as a service provider.</li>
        <li><b>Breach notice; sub-processors.</b> Shift will notify Client without undue delay on becoming aware of a security breach affecting Client Data, and will cooperate in Client's response. Shift will bind any sub-processor to terms at least as protective and remains responsible for the sub-processor's compliance.</li>
        <li><b>Return or deletion.</b> On termination, Shift will return or delete Client Data at Client's direction, except where law requires retention.</li>
        <li><b>General data; feedback.</b> Client agrees that Shift may use de-identified, aggregated data that does not identify Client or any individual ("General Data"), and any feedback or suggestions Client provides, to maintain and improve the Background IP and to develop new services. Shift will not disclose Client's identifiable Client Data to other clients.</li>
      </ol></li>

    <li><span class="h">Limitation of liability</span>
      <ol class="sub">
        <li><b>Exclusion of indirect damages.</b> Neither Party is liable for indirect, incidental, special, or consequential damages, or for loss of profits, revenue, or data, arising out of this Agreement, even if advised of the possibility.</li>
        <li><b>Cap.</b> Except for (a) a Party's indemnification obligations, (b) breach of Section 8 (Confidentiality), (c) Client's payment obligations, and (d) a Party's gross negligence or willful misconduct, each Party's total aggregate liability arising out of this Agreement will not exceed <b>the greater of (i) fifty percent (50%) of the total Fees payable under the applicable SOW, or (ii) the Fees paid by Client in the six (6) months preceding the claim.</b></li>
      </ol></li>

    <li><span class="h">Insurance</span>
      <p>Shift will maintain, during the term, Commercial General Liability insurance of not less than ${fld(firm.insuranceLimit, "Shift CGL insurance limit")}, and technology / cyber errors-and-omissions insurance of not less than ${line("", "120px")}, and will provide evidence on request.</p></li>

    <li><span class="h">Business continuity and Background IP escrow</span>
      <p>Because the Deliverable cannot operate without the Background IP, Shift will, on Client's request, place and maintain the Background IP source needed to operate the Deliverable in escrow with a third-party agent. The agent will release it to Client only on (a) Shift's insolvency, bankruptcy, or cessation of business; (b) Shift's material breach of its support obligations uncured after written notice and a reasonable cure period; or (c) Shift's discontinuation of the product with no successor. A release lets Client use the Background IP source only for its own internal maintenance of the Deliverable and transfers no ownership of the Background IP.</p></li>

    <li><span class="h">Term and termination</span>
      <ol class="sub">
        <li><b>Term.</b> This Agreement begins on the Effective Date and continues until all SOWs under it have expired or been terminated.</li>
        <li><b>Termination for cause.</b> Either Party may terminate an SOW for the other's uncured material breach, on thirty (30) days' written notice specifying the breach, if it remains uncured at the end of that period.</li>
        <li><b>Default.</b> Shift may suspend or terminate access to the Deliverable as set out in Section 4.5.</li>
      </ol></li>

    <li><span class="h">Effect of termination</span>
      <ol class="sub">
        <li><b>Before vesting.</b> If an SOW terminates before the Vesting Date for any reason other than Shift's uncured material breach, Client's licence to use the Deliverable ends immediately, and Client will, at Shift's option, return or certify destruction of all copies of the Deliverable.</li>
        <li><b>Shift's breach before vesting.</b> If an SOW terminates before the Vesting Date because of Shift's uncured material breach, Client is entitled, at its election, to a refund of Fees paid for the unaccepted work, or to vesting of title to the work paid for and accepted.</li>
        <li><b>After vesting.</b> If the Vesting Date has occurred, Client's ownership of the Deliverable is unaffected by termination, but the Background IP licence under Section 5.2 and the restrictions in Section 6 survive for as long as Client uses the Deliverable.</li>
        <li><b>Survival.</b> Sections 1, 5, 6, 7, 8, 9, 10, 12, 14, and 16 survive termination or expiry.</li>
      </ol></li>

    <li><span class="h">Additional covenants</span>
      <ol class="sub">
        <li><b>Open-source and third-party components.</b> The Deliverable may include open-source and third-party components, which are licensed under their own terms and are outside Shift's warranty in Section 7.1. Client will comply with those terms.</li>
        <li><b>Audit.</b> On reasonable notice, Shift may verify that Client's use of the Deliverable and Background IP complies with the licence scope and Section 6 restrictions.</li>
        <li><b>Non-solicitation.</b> During the term and for twelve (12) months after, Client will not solicit for employment or hire any Shift personnel who worked on the engagement, except through general advertising not targeted at them.</li>
        <li><b>Service levels.</b> Operate-phase service levels (availability, support response times, and any service-credit remedy) are set out in Schedule C.</li>
      </ol></li>

    <li><span class="h">General provisions</span>
      <ol class="sub">
        <li><b>Governing law and dispute resolution.</b> This Agreement is governed by the laws of ${prov} and the federal laws of Canada applicable there, without regard to conflict-of-law principles. The Parties will first try in good faith to resolve any dispute by negotiation, then by mediation. If it is not resolved, the dispute is finally resolved by binding arbitration seated in ${esc(firm.forumCity)} under the Arbitration Act (${prov}).</li>
        <li><b>Notices.</b> Notices must be in writing and delivered in person, by email, or by registered mail to the addresses on the cover page, and are deemed received on delivery (or, if after 5:00 p.m. at the place of receipt or on a non-business day, the next business day).</li>
        <li><b>Assignment.</b> Neither Party may assign this Agreement without the other's prior written consent; Client assignment is further subject to Section 6.4 (Change of control). Shift may assign to a successor in a merger or sale of substantially all of its assets on notice.</li>
        <li><b>Independent contractor.</b> Shift is an independent contractor. Nothing creates a partnership, joint venture, or employment relationship.</li>
        <li><b>Force majeure.</b> Neither Party is liable for delay or failure caused by events beyond its reasonable control.</li>
        <li><b>Severability; waiver; cumulative remedies.</b> If a provision is unenforceable, the rest stays in effect. A failure to enforce is not a waiver. Remedies are cumulative.</li>
        <li><b>Order of precedence.</b> If this Agreement, an SOW, and a Schedule conflict, the SOW governs for its Deliverable, then the relevant Schedule, then this Agreement.</li>
        <li><b>Entire agreement; amendment.</b> This Agreement, with all SOWs and Schedules, is the entire agreement and supersedes prior proposals and communications. It may be amended only by a writing signed by both Parties.</li>
        <li><b>Counterparts; electronic signature; language.</b> This Agreement may be signed in counterparts and by electronic signature, each an original and together one agreement, consistent with the Electronic Transactions Act (${prov}). The Parties require it to be in English.</li>
      </ol></li>
  </ol>`;

  const commercialSummary = `
    <table class="summary">
      <tr><th>One-time build fee (SOW)</th><td>${fld(f.buildFee, "build fee in CAD")} CAD, plus applicable taxes</td></tr>
      <tr><th>Background IP Licence Fee</th><td>${fld(f.backgroundIpLicenseFee, "monthly Background IP Licence Fee in CAD")} CAD per month (Section 5.5 / Schedule C)</td></tr>
      <tr><th>Operate &amp; support fee</th><td>${f.supportFee?.trim() ? esc(f.supportFee) + " CAD per year (Schedule C)" : line("", "200px") + " (Schedule C)"}</td></tr>
      <tr><th>Payment schedule</th><td>${fld(f.paymentTerms, "payment schedule, e.g. 40% on signing / 40% at build start / 20% on acceptance; net 30")}</td></tr>
      <tr><th>Currency &amp; taxes</th><td>All amounts in Canadian dollars. GST, HST, and PST are added where they apply.</td></tr>
    </table>`;

  const sigBlock = (clientLabel: string) => `
    <div class="sign">
      <div class="box">
        <div class="label">${esc(firm.legalName)} ("Shift")</div>
        <div class="sigline">Signature</div>
        <div style="margin-top:14px">Name: ${line("", "180px")}</div>
        <div style="margin-top:8px">Title: ${line("", "180px")}</div>
        <div style="margin-top:8px">Date: ${line("", "140px")}</div>
      </div>
      <div class="box">
        <div class="label">${clientLabel} ("Client")</div>
        <div class="sigline">Signature</div>
        <div style="margin-top:14px">Name: ${line(f.clientContactName, "180px")}</div>
        <div style="margin-top:8px">Title: ${line(f.clientContactTitle, "180px")}</div>
        <div style="margin-top:8px">Date: ${line("", "140px")}</div>
      </div>
    </div>`;

  const clientName = fld(f.clientLegalName, "Client legal name");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Master Conditional Sale and Custom Software Development Agreement — ${esc(f.clientLegalName || "Client")}</title>
<style>${css}</style>
</head>
<body>
  <div class="toolbar screen-only">
    <span>Fill the highlighted fields, then export. Blue = editable; <b style="color:#f0b3ae">red = still needs a value</b>.</span>
    <span style="display:flex;align-items:center;gap:14px">
      <span class="hint">Set your browser to "Save as PDF" in the print dialog.</span>
      <button onclick="window.print()">Download PDF</button>
    </span>
  </div>

  <div class="page">
    <div class="masthead">
      <span class="brand"><b>Shift</b> AI Partners</span>
      <span class="doctype">Master Conditional Sale &amp;<br/>Custom Software Development Agreement</span>
    </div>
    <h1 class="title">Master Conditional Sale and Custom Software Development Agreement</h1>
    <p class="subtitle">${esc(recital)}</p>

    <div class="parties">
      <div class="party">
        <div class="label">Provider ("Shift")</div>
        <div class="who">${fld(firm.legalName, "Shift legal entity name")}</div>
        <div class="meta">A corporation incorporated under the laws of ${prov}<br/>
        Incorporation no. ${fld(firm.incorporationNumber, "Shift incorporation number")}<br/>
        ${fld(firm.address, "Shift registered address")}<br/>${esc(firm.noticeEmail)}</div>
      </div>
      <div class="party">
        <div class="label">Client ("Customer")</div>
        <div class="who">${clientName}</div>
        <div class="meta">${fld(f.clientAddress, "Client address")}<br/>
        Attn: ${line(f.clientContactName, "160px")}${f.clientContactTitle ? `, ${esc(f.clientContactTitle)}` : ""}<br/>
        ${f.clientContactEmail ? esc(f.clientContactEmail) : line("", "200px")}</div>
      </div>
    </div>

    <p style="margin-top:12px"><b>Effective date:</b> ${fld(f.effectiveDate, "effective date")} &nbsp;·&nbsp; <b>Governing law:</b> ${prov} &nbsp;·&nbsp; <b>Engagement:</b> ${fld(f.projectName, "project / engagement name")}</p>

    <p>This Agreement is entered into as of the Effective Date by and between ${esc(firm.legalName)} ("Shift") and the Client named above ("Client"). It sets out the general terms on which Shift designs, builds, and conditionally sells custom software systems to Client, and incorporates by reference each Statement of Work executed under Schedule A and the Operate, Support &amp; Background IP Licence terms at Schedule C. Neither Party is bound until both have signed this Agreement and at least one Statement of Work.</p>

    <h2>Commercial summary</h2>
    ${commercialSummary}
    <p style="font-size:10pt;color:var(--muted)">Detailed scope is Schedule A; commercial detail is Schedules A and C. The Terms and Conditions that follow, and the Schedules, form part of this Agreement.</p>

    <h2>Terms and conditions</h2>
    ${terms}

    <div class="pagebreak"></div>
    <h2>Signatures</h2>
    <p>The Parties have executed this Agreement as of the Effective Date. This Agreement may be signed in counterparts and electronically.</p>
    ${sigBlock(clientName)}

    <div class="pagebreak"></div>
    <h2>Schedule A — Statement of Work</h2>
    <p style="font-size:10pt;color:var(--muted)">Entered into under, and governed by, this Agreement. Project: ${fld(f.projectName, "project / engagement name")}.</p>
    <div class="sched-body">
      ${f.scheduleAHtml || `<p class="fld needs">[NEEDS INPUT: Schedule A — Deliverable scope of work]</p>`}
      <h3>Fees and payment</h3>
      <table>
        <tr><th>Item</th><th>Amount</th><th>Due</th></tr>
        <tr><td>Build fee (this SOW)</td><td>${fld(f.buildFee, "build fee in CAD")} CAD</td><td>${fld(f.paymentTerms, "payment schedule")}</td></tr>
      </table>
      <h3>Conditions for vesting</h3>
      <p>Unless stated otherwise above, the Conditions for vesting of title under Section 4 are full and final payment of the total Fees for this SOW.</p>
    </div>
    ${sigBlock(clientName)}

    <div class="pagebreak"></div>
    <h2>Schedule B — Background IP Schedule</h2>
    <p style="font-size:10pt;color:var(--muted)">Identifies the principal Background IP (Section 1.3) embedded in the Deliverable. Shift retains ownership of each item listed, and of any Background IP not listed, per Section 5.</p>
    <div class="sched-body">
      <table>
        <tr><th>Component</th><th>Description</th></tr>
        <tr><td>AI orchestration / gateway layer</td><td>The audited gateway routing AI requests, shared across Shift client systems.</td></tr>
        <tr><td>Platform framework &amp; pattern library</td><td>Shift's reusable application framework, agent and skill engine, dashboards, and integration patterns.</td></tr>
        <tr><td>${line("", "160px")}</td><td>${line("", "320px")}</td></tr>
      </table>
    </div>

    <div class="pagebreak"></div>
    <h2>Schedule C — Operate, Support &amp; Background IP Licence</h2>
    <div class="sched-body">
      <p>This Schedule sets out (a) the maintenance and support Shift provides for the Deliverable (the "Operate Services"), and (b) the Background IP Licence Fee payable under Section 5.5. Both are governed by this Agreement.</p>
      <h3>Fees, billing, and renewal</h3>
      <table>
        <tr><th>Item</th><th>Fee</th><th>Billing</th></tr>
        <tr><td>Operate &amp; support</td><td>${f.supportFee?.trim() ? esc(f.supportFee) + " CAD" : line("", "120px")}</td><td>Annual, auto-renewing</td></tr>
        <tr><td>Background IP Licence Fee (Section 5.5)</td><td>${fld(f.backgroundIpLicenseFee, "monthly Background IP Licence Fee in CAD")} CAD</td><td>Monthly</td></tr>
      </table>
      <h3>Services and support hours</h3>
      <p>Operate Services include software warranty and error correction for the Deliverable, email and telephone support during support hours, and ongoing maintenance, updates, and improvements to the Background IP. Support hours: ${line("8:30–17:00 PT, Monday to Friday, excluding statutory holidays", "320px")}.</p>
      <h3>Renewal and suspension</h3>
      <p>The annual Operate fee renews automatically each year on the anniversary of its start date unless either Party gives written notice of non-renewal at least ninety (90) days before. The Background IP Licence Fee is billed monthly for as long as Client uses the Deliverable, and non-payment may result in suspension as set out in Section 5.5.</p>
    </div>

    <div class="pagebreak"></div>
    <h2>Schedule D — Retainer Services (optional)</h2>
    <div class="sched-body">
      <p>This Schedule applies only if the Parties agree retainer-based services. Work is scoped through written Work Orders, each treated as an SOW under Section 2.3 and Section 4, so title to each Work Order's Deliverable vests as it is completed and paid for.</p>
      <table>
        <tr><th>Retainer start date</th><td>${line("", "160px")}</td></tr>
        <tr><th>Monthly capacity</th><td>${line("", "120px")} hours per month</td></tr>
        <tr><th>Monthly retainer fee</th><td>${line("", "120px")} CAD, due in advance on the first of each month</td></tr>
        <tr><th>Overage rate</th><td>${line("", "120px")} CAD per hour, billed in 15-minute increments</td></tr>
        <tr><th>Cancellation</th><td>Renews monthly; either Party may cancel on thirty (30) days' written notice. Cancellation does not affect vesting already achieved for completed, paid Work Orders.</td></tr>
      </table>
    </div>

    <div class="foot">
      Prepared by ${f.preparedBy ? esc(f.preparedBy) : line("", "160px")} · ${esc(firm.operatingName)} (${esc(firm.legalName)}). The firm's standard agreement. Complete every field before signing.
    </div>
  </div>
</body>
</html>`;
}
