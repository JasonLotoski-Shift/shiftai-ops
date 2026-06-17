import type { Entity } from '../../lib/types'

// THE ACCOUNTING PILLAR, in depth · children of ff-acct.
// The pillar in build: the agent fleet that drafts, the A/B/C tier map that
// decides who signs, the monthly close worked end to end, and the SOP catalog.
// Grounded in shiftai-clients/ffwh/01-Discovery (SOP walkthrough + scoping) and
// the accounting-close.html mockup.
export const acctPillar: Entity[] = [
  // ── Agent fleet ───────────────────────────────────────────────────────────
  {
    id: 'ac-fleet',
    parent: 'ff-acct',
    kind: 'box',
    owner: 'shift',
    title: 'Agent fleet',
    subtitle: 'collects, categorizes, drafts · never the final word',
    source: 'scoped',
    childLayout: 'grid',
    about:
      'The agents that do the prep across the accounting cycle. Each routes its output to the tier engine; none releases a Tier B or C artifact without a documented human sign-off.',
  },
  { id: 'ac-intake', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'Intake & chase', subtitle: 'Tier A', source: 'scoped', rule: 'Orchestrates document collection, runs chase sequences, OCRs receipts, files a Monday exception report.' },
  { id: 'ac-categorize', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'Categorization', subtitle: 'Tier A/B', source: 'scoped', rule: 'Per-client deterministic rules → learned rules from corrections → Claude residual. Auto-posts to QBO only above a confidence threshold (95% policy per client); routes the rest to a review queue and learns from every correction.' },
  { id: 'ac-recon', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'Reconciliation', subtitle: 'Tier B', source: 'scoped', rule: 'Matches the parsed statement (source of truth) against QBO; flags unmatched items; drafts adjusting entries for fees, interest, NSF.' },
  { id: 'ac-payroll', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'Payroll run', subtitle: 'Tier B', source: 'scoped', rule: 'Reads pay-period data from Wagepoint; drafts CPP/EI/tax-withheld entries and the remittance instruction. Never initiates the payment · the FINTRAC firewall.' },
  { id: 'ac-qa', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'QA agent', subtitle: 'Tier B', source: 'scoped', rule: 'Runs a 50-point consistency check, cross-references prior periods, validates the balance sheet and sales-tax calcs, flags anomalies.' },
  { id: 'ac-statements', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'Statement package', subtitle: 'Tier B · recommended first slice', source: 'scoped', rule: 'Pulls P&L / BS / CF from the QBO Reports API with prior-period comparatives and key ratios; Claude writes the plain-English variance narrative. Strongest API fit, lowest write risk · the first build slice.' },
  { id: 'ac-yearend', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'Year-end & T2', subtitle: 'Tier C', source: 'scoped', rule: 'Confirms accruals/prepaids/depreciation, builds working papers, maps QBO accounts to CRA GIFI codes, auto-populates the T2 schedules, and stages it inside TaxCycle for Robert’s review and transmission.' },
  { id: 'ac-compilation', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'Compilation (CSRS 4200)', subtitle: 'Tier C', source: 'scoped', rule: 'Two hard gates: a signed management acknowledgment must be in the vault before the report is dated, and the report wording is fixed by the template, not agent-editable.' },
  { id: 'ac-slip', parent: 'ac-fleet', kind: 'box', owner: 'shift', title: 'Slip filing & ROE', subtitle: 'Tier C / B', source: 'scoped', rule: 'Generates valid CRA XML for T4/T4A/T5/T5018 and ROE Web .BLK files; the CPA signs off; a human uploads.' },
  { id: 'ac-meta', parent: 'ac-fleet', kind: 'gate', owner: 'shift', title: 'AI output review (SOP #22)', subtitle: 'Tier C · the compliance spine', source: 'scoped', rule: 'Non-bypassable. No agent releases a Tier B/C artifact without a human review and a documented sign-off: reviewer, timestamp, AI disclosure, model + version, prompt, raw output, draft-vs-final diff, disposition. Retained 7 years.' },

  // ── A / B / C tier map (accounting-specific task assignment) ───────────────
  {
    id: 'ac-tiermap',
    parent: 'ff-acct',
    kind: 'gate',
    owner: 'shift',
    title: 'A / B / C tier map',
    subtitle: 'which accounting tasks need which signature',
    source: 'scoped',
    childLayout: 'grid',
    about: 'Every SOP is assigned a tier. The tier decides whether an agent can act alone, a human must review, or a licensed CPA must sign.',
  },
  { id: 'ac-tierA', parent: 'ac-tiermap', kind: 'box', owner: 'shift', title: 'Tier A · agent autonomous', subtitle: 'no filing, no money movement', source: 'scoped', inside: ['Document collection & chase (SOP #5)', 'Corporate instalment management · calculate, remind, log only (SOP #12)', 'TD1 & payroll-data refresh prompts (SOP #18)', 'Draft statements, memos, engagement letters for human review', 'Categorize transactions above the confidence threshold'] },
  { id: 'ac-tierB', parent: 'ac-tiermap', kind: 'box', owner: 'shift', title: 'Tier B · human review', subtitle: 'agent stages, human approves', source: 'scoped', inside: ['Monthly bookkeeping close (SOP #4)', 'Payroll run & source-deduction remittance (SOP #6)', 'GST/HST (SOP #7), BC PST (SOP #8), WorkSafeBC (SOP #9), EHT (SOP #10)', 'Quarterly business review (SOP #11)', 'ROE issuance'] },
  { id: 'ac-tierC', parent: 'ac-tiermap', kind: 'box', owner: 'shift', title: 'Tier C · licensed sign-off', subtitle: 'non-bypassable CPA gate', source: 'scoped', inside: ['Year-end close & working papers (SOP #14)', 'Compilation engagement, CSRS 4200 (SOP #15)', 'T2 prep, T183CORP gate & EFILE (SOP #16)', 'Slip filing T4/T4A/T5/T5018 (SOP #17)', 'Client acceptance, engagement letters, tax planning, disengagement'] },

  // ── The monthly close · worked end to end (SOP #4) ─────────────────────────
  {
    id: 'ac-close',
    parent: 'ff-acct',
    kind: 'box',
    owner: 'client',
    title: 'The monthly close',
    subtitle: 'SOP #4, Tier B · the heartbeat',
    source: 'in-build',
    childLayout: 'flow',
    childDir: 'LR',
    about: 'The four-week cycle that proves the gate runs every month. The mockup shows all six stages interactive. Nothing posts to the client package until the Tier B human gate clears.',
  },
  { id: 'cl-intake', parent: 'ac-close', kind: 'box', owner: 'client', title: '1 · Intake & chase', subtitle: 'Week 1 · collect, flag missing, strip PII', source: 'in-build' },
  { id: 'cl-cat', parent: 'ac-close', kind: 'box', owner: 'client', title: '2 · Categorize', subtitle: 'Week 2 · auto-post with a confidence score', source: 'in-build' },
  { id: 'cl-recon', parent: 'ac-close', kind: 'box', owner: 'client', title: '3 · Reconcile', subtitle: 'Week 2 · match statement vs QBO, draft entries', source: 'in-build' },
  { id: 'cl-review', parent: 'ac-close', kind: 'gate', owner: 'shift', title: '4 · Review & approve', subtitle: 'Week 3 · Tier B human gate', source: 'in-build', rule: 'Robert reviews the exception queue and the statements. Audit logs reviewer, timestamp, and diff. Nothing posts until this clears.' },
  { id: 'cl-stmt', parent: 'ac-close', kind: 'box', owner: 'client', title: '5 · Statements', subtitle: 'Week 3 · P&L, BS, CF + variance narrative', source: 'in-build' },
  { id: 'cl-pkg', parent: 'ac-close', kind: 'box', owner: 'client', title: '6 · Client package', subtitle: 'Week 4 · batched email, cross-pillar signals', source: 'in-build' },

  // ── SOP catalog reference ──────────────────────────────────────────────────
  {
    id: 'ac-sops',
    parent: 'ff-acct',
    kind: 'box',
    owner: 'shift',
    title: '22 SOPs',
    subtitle: 'the full catalog, by cycle',
    source: 'scoped',
    about: 'Three service lines (bookkeeping, financial statements, corporate tax) across four cycles. Each SOP carries a tier and a trigger.',
    inside: [
      'Onboarding: client acceptance (C), 14-day onboarding (B), engagement letters (C)',
      'Monthly heartbeat: bookkeeping close (B), document chase (A)',
      'Payroll & tax: payroll + source deductions (B), ROE, GST/HST (B), BC PST (B), WorkSafeBC (B), EHT (B)',
      'Advisory & deadlines: quarterly review (B), corporate instalments (A), pre-year-end planning (C)',
      'Year-end & filing: year-end close (C), compilation CSRS 4200 (C), T2 + T183CORP + EFILE (C), slip filing (C)',
      'Compliance spine: records retention (B/C), privacy breach (C), disengagement (C), AI output review (C)',
    ],
  },
]
