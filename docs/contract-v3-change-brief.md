# Contract v3 — change brief for Steve + BC counsel

> **Status (2026-06-18): APPROVED.** The v3 model was ratified by Jay and the agreement reviewed and approved by BC counsel. These changes are adopted into the live template (`lib/contract/template.ts`). Dispute resolution: **binding arbitration in Vancouver**. The brief below is retained as the record of what was changed.
>
> **Decisions set (Jason, 2026-06-18):** adopt v3's model (client owns the front-end **Deliverable** on payment; Shift retains the **Background IP**, licensed for a recurring fee). **No buy-out.** Resale prohibited, internal use only. Change of control forces re-negotiation. Liability cap raised from the v3 figure. Entity is **SHIFT AI OPS LTD.** (a BC company).

---

## 1. Entity and jurisdiction — Canadianize the template

v3 reads as a US template partly converted. Fix throughout:

- **Party name:** replace every "Shift AI Partners Inc." with **"SHIFT AI OPS LTD."** ("Shift AI Partners" is the operating/brand name; the legal entity is SHIFT AI OPS LTD.). Incorporation number: `[NEEDS INPUT — no BC company number yet]`.
- **Entity descriptor:** "a [State/Province] corporation" → "a corporation incorporated under the laws of **British Columbia**."
- **Governing law (13.1):** set to **British Columbia** and the federal laws of Canada applicable there; courts of British Columbia (or arbitration — see §11 below).
- **Security interest (4.3):** the PMSI concept survives in Canada, but the **filing is wrong.** Replace "UCC-1 financing statement" with a **financing statement under the Personal Property Security Act (British Columbia), registered in the BC Personal Property Registry**, "or the equivalent in the client's jurisdiction." Have counsel confirm PMSI perfection mechanics under the BC PPSA.
- Cover page: set Governing Law to British Columbia; Service Office to the real BC address.

---

## 2. Liability cap (Section 10.2) — replace the v3 figure

Replace "the lesser of (i) … two (2) months … or (ii) CAD $10,000" with:

> Except for (a) a Party's indemnification obligations, (b) breach of Section 8 (Confidentiality), (c) Client's payment obligations, and (d) a Party's gross negligence or willful misconduct, each Party's total aggregate liability arising out of this Agreement will not exceed **the greater of (i) fifty percent (50%) of the total Fees payable under the applicable SOW, or (ii) the Fees paid by Client in the six (6) months preceding the claim**.

- Keep 10.1 (exclusion of indirect/consequential damages) as-is.
- **Confirm:** "greater of" is intended (for a $60K build that yields ~$30K vs ~$21K for six months of recurring fees). Counsel to confirm the gross-negligence/willful-misconduct carve-out is enforceable and whether to add a personal-injury/death carve-out.

---

## 3. IP model — confirm and tighten (Sections 4, 5, 6)

The model is right as drafted (conditional sale of the Deliverable + retained Background IP licensed for a fee). Two changes:

- **Remove buy-out everywhere.** v3 has none — keep it that way. Action item is downstream: reconcile `business-model-v2.md` and the `scope`/`sow` skills, which still reference a buy-out and "license, never title" for the instance. See §9.
- **Resale / internal-use lockdown (Section 6):** v3 already prohibits resale, sublicense, service-bureau, and competing use, and limits use to the client's internal business operations. Confirm 6.2(a) covers **both** the Deliverable and the Background IP (it does) and that "internal business operations of Client and its Affiliates" is the only permitted use. Add the **audit right** (§7.3 below) so the restriction is enforceable.

---

## 4. Change of control — close the loophole and force re-negotiation

**Problem:** v3 Section 13.3 currently says *"either Party may assign … in connection with a merger, acquisition, or sale of substantially all of its assets."* That is the exact door to leave open: an acquirer would inherit the Background IP license for free through M&A. **Delete that carve-out for the Client side** and add a change-of-control clause. Suggested language (counsel to finalize):

> **Change of Control.** A direct or indirect change of control of Client — including a sale of all or substantially all of Client's business or assets, a merger or amalgamation, or a transfer of more than fifty percent (50%) of Client's voting or equity interests — requires Shift's prior written consent. The rights to the Deliverable and the license to the Background IP are personal to Client, are granted for Client's own internal business operations, and do not pass to a successor or acquirer on a change of control without Shift's written consent. On a proposed change of control, the Parties will negotiate in good faith revised terms (including Fees) for the successor's continued use. If the Parties do not agree within sixty (60) days, Shift may terminate this Agreement and all licenses granted under it.

- Amend **13.3 (Assignment)** so the Client may not assign — including on M&A — except with consent and subject to the change-of-control clause above. (Shift's own right to assign to a successor may remain, at counsel's discretion.)
- Cross-reference from Section 6.3 (Transfer Requires Consent) so the two are consistent.

---

## 5. Privacy & data protection — add Shift-side obligations (rewrite Section 9 or add Schedule E)

v3's Section 9 puts the entire privacy burden on the client and gives Shift no affirmative duties. Since Shift **hosts and operates** the system, add Shift-side obligations referencing **PIPA (BC) and PIPEDA**:

- Shift maintains **security safeguards** appropriate to the sensitivity of the personal information in Client Data.
- Shift acts as a **service provider**, processing personal information only on the client's instructions and to perform the Agreement.
- **Breach notification:** Shift notifies the client without undue delay on becoming aware of a security breach affecting Client Data, and cooperates in the response.
- **Sub-processors:** any sub-processor is bound to terms at least as protective; Shift remains responsible for their compliance.
- **Data location / cross-border** processing follows applicable privacy law; the parties agree where data is stored.
- **Return / deletion** of Client Data on termination at the client's direction, except where law requires retention.
- Keep the client's existing compliance + indemnity obligations (9.2, 9.3).

If a client handles health or other sensitive data, counsel should consider a standalone Data Processing Agreement as a schedule.

---

## 6. Add the protections v3 dropped

- **Insurance (new section):** Shift maintains, during the term, **Commercial General Liability** of not less than `[NEEDS INPUT — e.g. $2,000,000]` and **cyber / technology errors-and-omissions** coverage of `[NEEDS INPUT]`; evidence on request. (The Harvard template carried CGL; v3 has none, and a hosting firm should carry cyber/tech E&O.)
- **Business continuity / Background-IP escrow (new section):** because the client's owned Deliverable **cannot run without the Background IP it only licenses**, give the client a continuity right on Shift's insolvency, material uncured breach, or product end-of-life — an escrow release of the Background IP source (and any hosted-environment handover) for the client's internal maintenance only, with no transfer of Background IP ownership. This is the single biggest vendor-risk gap in v3.
- **Warranties (Section 7):** add (a) services performed in a **professional and workmanlike manner**, (b) Shift will **not knowingly introduce malicious code**, and (c) an **express disclaimer of implied warranties** (merchantability, fitness for purpose) beyond those stated, to keep BC Sale-of-Goods/common-law implied terms from creeping in.
- **Effect of termination on Shift's breach before vesting (Section 12.1):** as written, if Shift materially breaches pre-vesting the client loses its license and owns nothing. Add: on **Shift's** uncured material breach before the Vesting Date, the client is entitled to a refund of Fees paid for the unaccepted work, or, at the client's election, vesting of title to the work paid for. (Fairness gap a client's counsel will catch.)
- **Mutual indemnification (Section 7):** v3 indemnifies in one direction (Shift for IP, Client for data). Sophisticated clients require a **mutual** indemnity for third-party claims arising from a party's negligence, willful misconduct, or fraud, or its violation of applicable law. Keep Shift's IP indemnity on top of it. (AutoCanada's counsel replaced the base indemnity with exactly this mutual form. See §10.)
- **Confidentiality upgrade (Section 8):** v3's confidentiality is thin. Bring it to the standard a sophisticated client expects: the **contents** of the Agreement are confidential (not its existence), trade-secret obligations **never expire**, return or destroy and **certify** on termination, permitted disclosure to advisors and contractors on a need-to-know basis, a compelled-disclosure carve-out, and **injunctive relief / specific performance** for breach. (This is what AutoCanada's counsel inserted. See §10.)

---

## 7. Standard terms missing from all three agreements

Add these — most are standard, several are specific to this firm's model:

1. **Open-source / third-party components.** Third-party and OSS components are licensed under their own terms and sit **outside** Shift's infringement warranty (Section 7); the client complies with applicable OSS terms. (A dev shop must have this.)
2. **Feedback + de-identified/aggregated data license.** Shift may use client feedback and **de-identified, aggregated** learnings to maintain and improve the Background IP and its services. Patterns and general data only, never identifiable Client Data. This is the legal basis for the firm's "improvements flow one way" model and currently appears in none of the contracts. **The AutoCanada redline (§10) gives client-accepted wording to copy:** the vendor may use "General Data (data not identifying specific clients or their purchases) to enhance products or provide new services," while the client's specific operational data stays the client's.
3. **Audit / verification right.** Shift may, on reasonable notice, verify the client's use complies with the license scope and the Section 6 restrictions (enforces the resale/internal-use lockdown).
4. **Non-solicitation of personnel.** During the term and for `[12]` months after, the client will not solicit or hire Shift personnel who worked on the engagement (carve-out for general advertising).
5. **Service levels for Operate (Schedule C).** Add an uptime target, support response times by severity, and the remedy (service credits). v3 commits to hours only.
6. **Backup & disaster recovery.** Shift maintains backups and a basic recovery commitment for the hosted environment.
7. **No-waiver** clause and an **order-of-precedence** clause (Agreement vs SOW vs Schedules C/D on conflict).
8. **Dispute-resolution ladder:** good-faith negotiation → mediation → courts of BC or arbitration in Vancouver under the Arbitration Act (BC). (v3 goes straight to litigation; counsel to choose courts vs arbitration.)
9. **Deliverable warranty period:** Shift corrects defects free for `[30–90]` days after acceptance (separate from the Operate/support fee).
10. **Subcontracting** right with flow-down (Shift may use subcontractors and remains responsible for their work).
11. Boilerplate counsel will expect: export-control/sanctions + anti-bribery reps; publicity/reference right (Shift may name the client as a reference unless it opts out); English-language clause; cumulative remedies; further assurances.
12. **Notices mechanics.** v3's notices clause is bare. Add the delivery methods (in person, email, registered mail), a deemed-receipt rule, and business-day / after-hours timing. (AutoCanada's counsel inserted a full notices clause with these.)

---

## 8. v3's own open item

- **Background IP License Fee amount (Schedule C, Section 5):** still undecided (flat vs scaled). This is the recurring revenue lever and ties to the `business-model-v2.md` subscription pricing. A business decision, not a legal one, but it gates finalizing Schedule C.

---

## 9. Downstream reconciliation (firm docs + ops tool)

Adopting v3 changes the firm's stated IP posture (from "license the instance, buy-out available" to "sell the Deliverable, license the Background IP, no buy-out"). To keep the firm consistent:

- Update `../shiftai-firm/planning/business-model-v2.md`: own-the-Deliverable + Background-IP license, remove buy-out.
- Update the `scope` and `sow` skills (`skills/scope/SKILL.md`, `skills/sow/SKILL.md`) so the proposal language matches the contract.
- **Rebuild the ops-tool contract template** (`lib/contract/template.ts`) to generate **v3's structure** (master + conditional sale + Background IP + Schedules A–D), and point the `generate-contract` skill at drafting **Schedule A (the SOW)** instead of "Appendix A." Hold this until v3 is settled with counsel, so the tool emits exactly what counsel approved. The entity name (SHIFT AI OPS LTD.) is already set in `lib/contract/firm-party.ts`.

---

## 10. Signals from the AutoCanada redlines (enterprise automotive client)

Reference: `DrivingIt Agreement - AutoCanada (ACQ redlines Sept 18, 2023).docx` — DrivingIt (Sayvee Creative Inc., Steve's prior company) selling a SaaS service to AutoCanada, **redlined by AutoCanada's counsel**. AutoCanada is a major automotive dealership group, squarely in the firm's ICP, so these redlines show what a sophisticated automotive client negotiates. What their counsel inserted or changed:

- **Indemnity made mutual.** They deleted the one-way indemnity and replaced it with each party indemnifying the other for third-party claims arising from that party's negligence, willful misconduct, or fraud, or its violation of applicable law. → Expect every serious client to require mutual indemnity. (Folded into §6.)
- **Data boundary drawn precisely, de-identified use accepted.** The client kept ownership of its specific operational data (inventory, consumer data), and accepted that the vendor may use **"General Data (data not identifying specific clients or their purchases) to enhance products or provide new services."** → This is the firm's "patterns never data" right, with client-tested wording. (Folded into §7 item 2.)
- **Robust mutual confidentiality added.** A full clause: agreement contents confidential (not its existence), trade-secret obligations never expire, return/destroy + certify on termination, need-to-know disclosure to advisors/contractors, compelled-disclosure carve-out, injunctive relief / specific performance. → v3's Section 8 should be brought to this standard. (Folded into §6.)
- **Detailed notices clause added.** Delivery methods + deemed-receipt + business-day timing. (Folded into §7 item 12.)
- **Governing law dictated by the client.** AutoCanada (an Alberta company) set Ontario law and Toronto forum. → Governing law and forum are negotiable per deal; Shift should push British Columbia but expect a large client to force its own province. Build that into the negotiation playbook, not just the template default.
- **Term cut to month-to-month with 30-day exit.** The client negotiated out of any lock-in on the recurring service. → For Shift's Operate/subscription (Schedules C/D), expect pushback on long commitments; the fixed build Fee is the protected piece, the recurring service will trend toward short notice periods.

Two structural notes: (1) DrivingIt's contract referenced its core Terms on a **public URL** the vendor controls — fine for commodity SaaS, wrong for a custom-build conditional sale; v3's **self-contained** master is the right call, keep it. (2) Even this enterprise redline did **not** add vendor-side privacy safeguards or breach notification — because dealership data is lower-sensitivity than health data. The firm's §5 privacy upgrade still matters for any client touching personal or health information, but for lower-sensitivity verticals a client may not demand it.
