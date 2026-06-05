// What's new — the ops tool changelog.
//
// Dev-authored. Add an entry here when a change actually matters to the
// partners using the tool — a new thing they can do, something that got
// better, or a fix they'd notice. Skip routine internal work.
//
// Keep entries plain English and short: one headline, one optional line of
// detail. No jargon. Newest first (the page sorts by date, but keep this
// list tidy by adding to the top).

export type UpdateTag = "new" | "improved" | "fixed";

export type Update = {
  /** ISO date "YYYY-MM-DD" — when it shipped. */
  date: string;
  /** What kind of change it is. */
  tag: UpdateTag;
  /** Short plain-English headline, e.g. "Pipeline is now drag-and-drop". */
  title: string;
  /** Optional one line of extra context. Keep it simple. */
  detail?: string;
};

export const updates: Update[] = [
  {
    date: "2026-06-05",
    tag: "improved",
    title: "Shift icon in the browser tab",
    detail:
      "The tool now shows the SA! mark on a white circle as its browser-tab and bookmark icon, so it's easy to spot among your open tabs.",
  },
  {
    date: "2026-06-04",
    tag: "improved",
    title: "Targeting polish",
    detail:
      "A finished search now keeps its result on the segment card after you navigate away, and you can group the Filtered leads by segment just like the New ones.",
  },
  {
    date: "2026-06-04",
    tag: "improved",
    title: "Lead search casts a wider net — and finds far more companies",
    detail:
      "Running a search on a segment now works in two stages. First it pulls a wide, free list of matching companies (up to 150), orders them by signals it already has — companies that are growing their headcount rise to the top, and revenue inside your band breaks ties. Then it does the deeper, slower work (site scrape, contacts, fit rating) only on the best ~40, so you get more and better-matched leads for the same run. A work email is only revealed once a lead clears the bar, so credits aren't spent on weak fits. Each finished run also tells you roughly how many matching companies are still left to explore, so re-running a segment keeps reaching new ones.",
  },
  {
    date: "2026-06-04",
    tag: "improved",
    title: "Optimizing a segment re-checks the leads it filtered before",
    detail:
      "When you tune and optimize a segment, the next search takes a fresh look at companies it previously set aside (the ones it filtered out on the old criteria, that you never reviewed) and re-judges them against the new criteria — so a tweak can rescue good leads that just missed last time, instead of only ever looking at brand-new companies. A filtered lead you move back up to AI Found by hand now also reveals its best contact's email on the spot.",
  },
  {
    date: "2026-06-04",
    tag: "improved",
    title: "Page actions are tucked into one tidy “Actions” menu",
    detail:
      "On a pipeline company, a contact, or a client, the row of buttons up top is now a single Actions menu just under the title. Open it and each action shows in a box that says what it does — Discovery prep, Follow-up email, Draft email, Enrich, Build prototype, Ingest, and the rest. The main buttons stay where they were (Convert → Client on a deal, + New project on a client, Edit). The project page's Ingest button was retired in the same tidy-up.",
  },
  {
    date: "2026-06-04",
    tag: "new",
    title: "Task Board: archive milestones, and delete a sub-task",
    detail:
      "Milestones now have an Archive column on the Task Board. Drag a milestone there (or hit Archive in its detail) to get it off your active columns — archived milestones drop off the board on their own after 7 days, but stay in the system. You can also delete a sub-task off a milestone now, either on the project page or in the board's milestone detail.",
  },
  {
    date: "2026-06-04",
    tag: "fixed",
    title: "A stuck “Scan running” banner can now be cleared",
    detail:
      "If a contact scan stalls partway, the Import banner no longer spins forever. It flags the scan as stalled and gives you a Dismiss button so you can clear it and run a fresh one.",
  },
  {
    date: "2026-06-04",
    tag: "improved",
    title: "The sidebar is reorganised — four clear groups",
    detail:
      "The left menu is grouped by what you're doing. Up top: Dashboard, Pipeline, Projects, Task Board — the day-to-day. A new collapsible Import group holds the three ways leads come in — Contacts (your uploads), AI Targeting (the lead hunt), and Ingest. Firm gathers Financials, your Contacts and Clients lists, Messages, and Library. Other holds What's new, How it works, Agents & MCPs, and Settings. A few names changed to say what they are: \"Import Contacts\" is now just Contacts, \"Targeting\" is AI Targeting, and the two list pages read \"Contacts List\" and \"Clients List\".",
  },
  {
    date: "2026-06-04",
    tag: "new",
    title: "The Agents & MCPs tab now shows the live MCP server",
    detail:
      "The MCPs view used to show a planned surface — it's now the real, running server. Claude Code and scheduled agents read firm state (clients, projects, contacts, pipeline, deliverables) and write it back (register a deliverable, create a task, log an interaction, update a project's status) through it. Every write lands an audit-log row and a feed entry, tagged AGENT · MCP, exactly like a partner's action. The event stream that fires a skill on its own is the next piece, still to build.",
  },
  {
    date: "2026-06-04",
    tag: "improved",
    title: "Clearer lead tags, and promoted leads tidy up as you work them",
    detail:
      "Leads now carry the right source tag: ones you promote from your imports show \"Imported\", and the agent's discoveries show \"AI Found\" (instead of both reading \"Outbound\"). On the Promoted Leads tab, once you enrich a lead its Enrich button becomes an \"Enriched\" marker, and once a lead is added to the funnel it greys out and drops to the bottom so the ones still to work stay on top.",
  },
  {
    date: "2026-06-04",
    tag: "improved",
    title: "Import Contacts: set your own scan criteria, and every scan is its own saved report",
    detail:
      "Before scanning your imported list you now set what a good company looks like — industries, company size, revenue, location, and keywords — seeded from one of your Targeting segments and editable for that scan. Each scan saves as its own report tab with the ranked contacts, so you can compare runs instead of overwriting the last one. Delete a report you don't need, and select-and-delete contacts from the master list. Promote the strong ones to Pipeline leads straight from a report.",
  },
  {
    date: "2026-06-03",
    tag: "new",
    title: "Import your contacts, scan them for fit, and push the best into the pipeline",
    detail:
      "A new Import Contacts tab lets you upload a contact export (LinkedIn connections, Google Contacts, or any CSV). The tool reads the columns for you, cleans and de-dupes the rows, and shows them in a private list only you can see. Hit \"Scan contacts\" and the agent rates every one 1–10 against your target segments — flagging each person as a decision-maker you could sell to, or a senior connector who could introduce you to one. Name-only rows are set aside as \"needs identification\" so you don't spend anything chasing them. Tick the ones worth pursuing and \"Add to Pipeline Leads\": they show up in a new Promoted Leads tab on the Pipeline (next to AI Found Leads), where an Enrich button runs the Apollo + Firecrawl search to pull company details and reveal a work email — then you add them to the funnel like any other lead.",
  },
  {
    date: "2026-06-03",
    tag: "new",
    title: "Run a lead search — the agent finds and rates companies for you",
    detail:
      "Each targeting segment now has a working \"Run search\" button. Click it and the agent goes out, finds companies that match your segment, rates each one for fit, pulls in contacts, and drops them into AI Found Leads. The run takes a couple of minutes — the card shows \"Searching…\" while it works, then \"Found N → View\". On any found lead you can now reveal a specific contact's email on demand, and a new \"Apollo credits\" meter at the top of Targeting shows how many emails you've revealed this month. Each segment also lets you choose whether to reveal just the best-fit contact's email per company or every contact's (uses more credits).",
  },
  {
    date: "2026-06-03",
    tag: "improved",
    title: "Sending a cold email now puts the lead straight on your board",
    detail:
      "When you send a cold intro to a found lead, it now lands on the pipeline as a deal — same as adding it to the funnel — marked \"awaiting reply\". When the prospect writes back, open the deal and hit \"Mark replied\" to move it to Qualified. The AI Found Leads tab is simpler too: just New and Filtered, since emailed leads now live on the board.",
  },
  {
    date: "2026-06-03",
    tag: "new",
    title: "Cold-email your AI Found Leads, and three clear lanes to work them",
    detail:
      "Open a found lead and Claude drafts a short, personalized cold intro to the person you pick — edit it, then mark it sent. The AI Found Leads tab now splits into New, Contacted, and Filtered lanes: new leads to review, the ones you've emailed (with the send date), and the ones you've set aside. Declined a lead by mistake? Restore it back to the queue in one click. Each targeting segment also shows how many found leads are waiting and links straight to them.",
  },
  {
    date: "2026-06-03",
    tag: "new",
    title: "AI Found Leads now land in the pipeline",
    detail:
      "A new tab on the Pipeline shows companies the lead agent surfaced, ranked by how well they fit your targeting. Open one to see the firmographics and the people, then add it to your funnel as a contact and deal — or decline it to set it aside.",
  },
  {
    date: "2026-06-03",
    tag: "improved",
    title: "Targeting builder — a guided, sectioned segment editor",
    detail:
      "Building a segment is now point-and-click instead of typing lists. Fields are grouped into collapsible sections (Identity, Firmographics, Who we sell to, Signals & references). Industries, signals, and disqualifiers are quick-add chips with suggestions; geographies come from a searchable list where you star one as the priority; you pick who you sell to as Department + Seniority rows; revenue and employee size offer one-click preset bands with formatted hints; and a live \"search intent\" line at the bottom reads back, in plain English, exactly who this segment will hunt.",
  },
  {
    date: "2026-06-03",
    tag: "new",
    title: "Targeting — define who the Lead Agent hunts for",
    detail:
      "A new Targeting page lets you build and edit target segments (industries, revenue and size bands, geographies, buyer personas, buying signals, disqualifiers, anchor companies) and switch each one on or off. Four starter segments — Automotive, Motorsport, Engineering, Construction — are ready to tune. These define the ideal customers the Lead Agent will go find.",
  },
  {
    date: "2026-06-02",
    tag: "new",
    title: "Proposal engine — interactive prototype + presentation deck",
    detail: "At the Proposal stage, two new actions on a deal: Build prototype runs a multi-step workflow (frame the problem → spec the screens → write the HTML) into a single interactive prototype that shows how we'd solve their problem; Build deck produces a formal HTML presentation (scope, timeline, deliverables, price) with a \"Demo prototype\" button linking it. Preview both in the browser, edit before you save — and the deck waits until a prototype exists. Both file to Drive as self-contained .html.",
  },
  {
    date: "2026-06-02",
    tag: "new",
    title: "One-click drafts for every deal stage",
    detail: "A deal page now has stage Quick Actions: a Discovery prep brief (internal — how to run the call and earn the next one), a post-call Survey, a Follow-up email, and a Book-a-meeting note — plus Draft proposal. Each is emphasized on the stage it belongs to, drafts from the deal's history, and won't invent facts (a [NEEDS INPUT] marker blocks saving). Everything files to Drive and lands as a reviewable Artifact on the deal.",
  },
  {
    date: "2026-06-02",
    tag: "new",
    title: "New \"Discussion Call\" stage + color-coded leads",
    detail: "The pipeline now has a Discussion Call column between Discovery Call and Proposal — the step after discovery where you send a survey, follow up, and book the next meeting. Lead cards also carry a left-edge color by source (intro, outbound, referral, event, inbound), with a legend above the board. Set a contact's source category when you add them.",
  },
  {
    date: "2026-06-02",
    tag: "new",
    title: "Agents page is now Agents & MCPs",
    detail: "The Agents tab is now Agents & MCPs, with three views: Agent plans, Agent (skills), and a new MCPs view. MCPs shows the planned MCP surface from the contract and lets the team draft their own MCP plans — promote a good one to the plan when it's ready.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Edit a deal's value, stage, and details",
    detail: "A deal page now has an Edit button — change the estimated value, stage, industry, close-target date, company, or notes in one place. Moving the stage resets the board's aging clock. Signing still goes through Convert → Client so the engagement gets scaffolded.",
  },
  {
    date: "2026-06-01",
    tag: "fixed",
    title: "Ingest can now target a pipeline deal",
    detail: "The Ingest composer's target pickers now include \"Add deal…\" alongside contact, client, and project — so a call or email about an open deal can update the deal (and propose a stage move) like any other record.",
  },
  {
    date: "2026-06-01",
    tag: "improved",
    title: "Ingest detects the target client from the text",
    detail: "\"Detect from text\" no longer needs a known email address. It now reads the title, notes, and email for client and deal names — and the people you've met — and suggests them as targets, leading with the client.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Billing is now Financials — with a firm revenue view",
    detail: "The sidebar's Billing is now Financials. It opens on a firm-wide rollup — contracted, invoiced, received, outstanding, and the firm's internal take — and breaks revenue down by project. The raw invoice register is one click away.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Billing moved to its own tab on each project",
    detail: "A project now opens on Overview — scope, milestones, deliverables, and a high-level billing card (value, received, which stages have been invoiced). The full breakdown — schedule, economics, payouts, commission — lives under the new Financials tab. The Overview card links straight to it.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Standard rate card by tier",
    detail: "Economics lines now default to the firm's standard rates — Managing Partner, Senior, Intermediate, Junior. Pick a tier and the bill and pay rates fill in; override either if a rate was renegotiated.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Commission on the first contract",
    detail: "Set a commission % (10% by default) and who sourced the contract — split between up to two people. It's paid on the first contract for a client; on a retainer or later contract it rolls into the firm's reserve. Shown in the project's firm-economics breakdown, never on the client invoice.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "See where every billed dollar goes",
    detail: "Each project's Financials tab shows the internal split of labour revenue — commission, firm pool, what the team is paid, and the firm reserve — and reconciles it against the client price. Direct costs (travel, tools) bill straight through at cost.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Log an invoice you sent by hand",
    detail: "Sent an invoice outside the tool? On Raise invoice, tick \"I already sent this manually\" and it records as sent without generating a document — so the ledger stays accurate while you move more billing into the tool.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Estimate the contract before the proposal",
    detail: "On a deal, build an estimate — hours by tier at standard rates — to size the contract value before you propose. When the deal is won, the accepted estimate becomes the project's economics automatically.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Monthly billing for retainers",
    detail: "Projects can now bill on a monthly even split across the contract instead of 50/25/25 — pick the schedule type on the project's Financials tab. Pilots and projects still default to 50/25/25.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Invoices is now Billing — money in and money out",
    detail: "The Invoices tab is now Billing. It tracks both sides: what you invoice the client, and what you owe the team. The landing page shows every active project with its value, invoiced, received, owed to the team, and paid out — click through to a project to act on it.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Projects auto-generate a 50/25/25 payment schedule",
    detail: "When you convert a deal, the project opens with the firm's standard billing schedule already in place — 50% on signing, 25% at the mid-point, 25% on delivery — adding up to the project value. Change the value later and you're offered a one-click regenerate (already-invoiced stages are never touched).",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Consultant roster + project economics",
    detail: "Keep a roster of the people you pay (name, role, fixed pay rate) under Billing → Consultant roster. On each project, add economics lines — who's on it, their hours, what we pay them, and what we bill the client. It totals cost vs. billable and shows the margin, and flags when the billable total drifts from the project value.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Drop in a scope doc, get the pricing",
    detail: "On a project, paste a scope/pricing document into Scope-pricing ingest. It reads only the pricing — people, hours, rates — and proposes economics lines for you to review and approve. Nothing is saved until you say so.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Track who's been paid",
    detail: "Each project has a team-payout ledger: what each consultant is owed per billing stage, split from their cost. Mark a payout paid (e-transfer, wire, cheque) and confirm receipt. It flags when you've paid someone before the client paid that stage.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Billing change log",
    detail: "Every change to an invoice, the schedule, economics, or a payout is recorded — who did it, what changed, and when — and shown as a thread on the invoice and the project. Edit a draft invoice's amount or due date right on the invoice.",
  },
  {
    date: "2026-06-01",
    tag: "improved",
    title: "Clearer colours on the delivery timeline",
    detail: "Milestones are gold, billing installments are orange, an invoice sent shows a light-green ring, and an invoice paid shows a deeper-green dot with a check in it — so you can read the timeline at a glance.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Rename a project and change its dates",
    detail: "On a project page, hover the title to rename it — the new name shows up everywhere the project appears (projects list, task board, invoices, the client page). Hover the timeline dates to change the start or target-end date in place.",
  },
  {
    date: "2026-06-01",
    tag: "improved",
    title: "The board runs on milestones now",
    detail: "The Tasks tab is the Task Board. Milestones are cards on it — open one to see its sub-tasks, who's on each, the overall owner, and a bar showing how done it is; set each sub-task's stage from there. A milestone with no owner shows red until you assign it; one with an unassigned sub-task shows amber. Tasks that don't belong to a milestone are the only ones that move across the columns on their own. A milestone or task tied to a project, client, or deal shows a link icon you can click to jump straight there. Every column has an Add task at the bottom.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Tasks are now a board",
    detail: "The Tasks page is a board — To Do, In Progress, In Review, Done. Drag a card to move it. Each card is coloured by category (Firm, Projects, Pipeline, Other), shows the milestone it belongs to and the project or client it's tied to, and who it's assigned to. Filter by partner or category. Everyone sees every task and milestone. You can add a firm milestone (BD, Admin) right from here, not just on a project.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Milestones hold their own tasks",
    detail: "A milestone is now an epic you can open up: assign it to a partner, give it a date (or leave it undated), and add tasks under it that you hand out to the team. Edit a milestone's title, owner, status, or date right in place.",
  },
  {
    date: "2026-06-01",
    tag: "new",
    title: "Set a project's type",
    detail: "Each project now has a type — Discovery Report, Pilot Project, Monthly Project, or Full Build — shown by the title and changeable any time. New projects from a converted deal start as a Discovery Report; pick a different type during convert if it fits.",
  },
  {
    date: "2026-06-01",
    tag: "improved",
    title: "A real delivery timeline",
    detail: "The project timeline runs full-width across the top, with milestones numbered M1, M2… and billing dates B1, B2… in date order, plus dots for when each invoice was sent and paid. Hover any marker for the detail; click a date to change it. Anything without a date is listed below instead of on the bar.",
  },
  {
    date: "2026-06-01",
    tag: "improved",
    title: "A clearer money picture on every project",
    detail: "The project shows its value and what's been received up top, and expands to invoiced, invoices missing (a billing date has passed with nothing sent), remaining to bill, and extras. Mark a billing line as an Extra (out-of-scope work) and it's tracked separately instead of eating into what's left to bill. The billing schedule lives in this same panel.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Ingest, rebuilt — log anything, update the right records",
    detail: "Meeting ingest is now just Ingest. Hit + Ingest, pick what you're logging (an interaction, meeting, email, or document), choose which records it touches — Claude suggests them or you pick, and you can pick more than one — then paste the content, an email thread, or drop a file. Claude reads it and proposes updates across the contact, client, project, and deal at once. You add a new contact right there if they're not in the tool yet.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Ingest can correct records — and shows you exactly what changes",
    detail: "When ingest wants to replace something already on a record, it shows the old value with a line through it next to the new one, and nothing is overwritten until you approve that specific change. Every addition is approved one by one too. It can also reassign an existing task to a different partner. Still: nothing is written until you say so.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Start an ingest from any record",
    detail: "A + Ingest button on a contact, client, or project opens the composer already focused on that record — so logging a call straight from the person's page takes the content and updates them (and anything related) in one go.",
  },
  {
    date: "2026-05-31",
    tag: "fixed",
    title: "Projects show their fee — and you can edit it",
    detail: "Converted deals now carry their value across as the project fee instead of starting at $0, and you can click to change a project's fee right on the page.",
  },
  {
    date: "2026-05-31",
    tag: "improved",
    title: "The fee shows on the delivery timeline",
    detail: "The project timeline now shows the fee and plots each billing installment along it by its due date, so the money and the schedule line up at a glance.",
  },
  {
    date: "2026-05-31",
    tag: "fixed",
    title: "Deal value takes any amount",
    detail: "The estimated value on a new deal no longer jumps in $1,000 steps — type the exact figure.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Claude keeps you posted",
    detail: "Each partner now has a Claude conversation at the top of Messages — your own notice board. When someone hands you a task, a deliverable lands on a project you lead, or something's waiting for your approval, a note shows up here, colour-coded and tagged by type, and you can sort it. It's a read-only inbox; your channels and DMs work the same as before.",
  },
  {
    date: "2026-05-31",
    tag: "improved",
    title: "A red dot when something needs you",
    detail: "Messages shows a red dot in the sidebar (and on each conversation) when there's something unread, and What's new goes bold with a dot when there are entries you haven't seen. Open them and the dot clears.",
  },
  {
    date: "2026-05-31",
    tag: "improved",
    title: "Tie a task to a project or deliverable",
    detail: "When you add a task you can now point it at a project — and, if you want, a specific deliverable on that project — so it's filed against the work it belongs to, not just a name in a box.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Enrich a contact or company from the web",
    detail: "Alongside the enrich that reads your logged history, there's now an Enrich from web button on contacts and clients. Claude searches the public web and proposes facts — role history, company size, headquarters, ownership — with its sources, for you to approve one by one. It still never writes anything until you say so.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Add a client without a deal",
    detail: "A New client button on the Clients page creates an engagement directly — for work that never went through the pipeline. Pick the company, contract value, primary contact and lead, and it sets up the client and its Drive folder, the same as converting a deal.",
  },
  {
    date: "2026-05-31",
    tag: "improved",
    title: "How it works, rebuilt — and a new \"What happens when I do X\"",
    detail: "The How it works page is rewritten and easier to read, with a new tab that walks through what actually happens behind each action — ingesting a meeting, converting a deal, drafting a doc, raising an invoice, enriching a record — as a simple step-by-step map. A quick way to see what the tool does on your behalf.",
  },
  {
    date: "2026-05-31",
    tag: "fixed",
    title: "Removed a button that did nothing",
    detail: "The New button at the top right of the screen had no purpose — it's gone.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Plan how a project bills",
    detail: "Each project now has an invoicing structure — a list of installments with a label, an amount, and when each one is due (on signing, at a milestone, or a set date). The running total shows against the project fee so you can see the whole contract is accounted for.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Raise an invoice straight from a project",
    detail: "A Raise invoice button on the project picks one of your planned installments — or you type the amount you actually billed — and drops a draft into Invoices. Open it and hit Generate to send it and file the invoice to the client.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "See a project's timeline at a glance",
    detail: "Every project shows a timeline bar from start to target end, with a marker for today and each milestone plotted along it — so you can see how far along delivery is at a glance.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Add milestones and deliverables by hand",
    detail: "You can now add a milestone or a deliverable to a project directly — type it in and it's there.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Hang tasks off a deliverable",
    detail: "Pick a deliverable on a project, add a task to it, and assign it to a partner. It lands in their tasks — and your chat with them — like any other handed-off task.",
  },
  {
    date: "2026-05-31",
    tag: "new",
    title: "Drop a document onto a project",
    detail: "Drop a file, an email thread, or pasted notes onto a project. Claude reads it and proposes updates — new milestones, tasks, facts about the people — and holds them for your review. Nothing is added until you approve it, item by item.",
  },
  {
    date: "2026-05-31",
    tag: "improved",
    title: "New deals tidy their own notes",
    detail: "The note you jot down when adding a deal gets cleaned into a short summary, and any lasting facts about the contact are added to their record — never overwriting what's already there. When the deal converts to a client, that context carries over.",
  },
  {
    date: "2026-05-31",
    tag: "improved",
    title: "Add a contact without leaving the new-deal form",
    detail: "Adding a deal for someone who isn't in the tool yet? Choose Add a new contact right in the deal form, fill in their details, and they're created and selected on the spot — no trip to Contacts and back.",
  },
  {
    date: "2026-05-31",
    tag: "improved",
    title: "A cleaner, calmer look across the tool",
    detail: "The whole tool got a visual refresh. Cards now lift gently off the page, the hard gridlines between sections are gone, and every screen reads calmer and less boxy. The pipeline board is tidier, buttons and labels are easier to read, and there's a light mode and a dark mode — switch with the toggle at the top right.",
  },
  {
    date: "2026-05-31",
    tag: "fixed",
    title: "Empty screens read as calm, not broken",
    detail: "Right after the new look shipped, Clients, Projects, and Invoices errored when there was nothing in them yet — fixed. Empty lists, boards, and channels now show a short note about what will appear there, and a $0 reads as a quiet \"nothing yet\" instead of looking like a problem.",
  },
  {
    date: "2026-05-29",
    tag: "new",
    title: "Add a deal to the pipeline",
    detail: "Use New deal on the Pipeline page to put a lead in the funnel: search for the contact, set the stage, value, and target close, and it lands on the board. New to a lead? Add the contact first, then add the deal.",
  },
  {
    date: "2026-05-29",
    tag: "fixed",
    title: "The pipeline board fits your screen",
    detail: "The stage columns now stretch to fill a wide window and shrink to stay readable on a narrow one, so Discovery through Signed all stay in view instead of getting cut off.",
  },
  {
    date: "2026-05-29",
    tag: "new",
    title: "Meeting ingest — notes become records",
    detail: "Under Meeting ingest, drop in a notes file or paste a transcript. Claude pulls out a summary, action items, and facts about the people and company, and holds them for your review. Nothing is written until you approve it, item by item. (Fireflies auto-import plugs into this same queue once it's connected.)",
  },
  {
    date: "2026-05-29",
    tag: "new",
    title: "Message the team in the tool",
    detail: "A new Messages area with firm channels (#general, #pipeline, #deals) and direct messages. Assign someone a task and it shows up in your chat with them as a card you can tick off — the same task, in one place.",
  },
  {
    date: "2026-05-29",
    tag: "new",
    title: "Agents tab",
    detail: "Draft what an agent should do — its goal and key tasks — before it's built. The Live skills view shows exactly how each AI action thinks: the real instructions behind every Quick Action, in plain sight.",
  },
  {
    date: "2026-05-29",
    tag: "new",
    title: "Add a contact in seconds",
    detail: "A new Add contact button on the Contacts page (and from the dashboard) captures a new person fast — name, company, who's leading the relationship — and drops you straight onto their record.",
  },
  {
    date: "2026-05-29",
    tag: "improved",
    title: "AI enrich reads the history, never guesses",
    detail: "AI enrich on a contact now reads their logged calls and emails and proposes facts to add — persona, how they communicate, key facts — for you to approve. It only uses what's actually been logged; it won't invent anything.",
  },
  {
    date: "2026-05-29",
    tag: "improved",
    title: "Fresh start on real data",
    detail: "The sample data is cleared — the tool is now running on the real firm. Your pipeline, contacts, and clients start from a clean slate, so what you see is real.",
  },
  {
    date: "2026-05-29",
    tag: "improved",
    title: "Quick Actions launch from the dashboard",
    detail: "The dashboard Quick Actions now work end-to-end — click one, pick the contact, deal, or client, and the real action opens on that record. No more placeholder.",
  },
  {
    date: "2026-05-29",
    tag: "new",
    title: "Three new Quick Actions",
    detail: "Alongside Draft email and Draft proposal, you can now Draft a client survey, Draft a discussion doc for an upcoming conversation, and Upload client files — drop in meeting notes (e.g. Fireflies) and they're filed to the client and logged.",
  },
  {
    date: "2026-05-29",
    tag: "improved",
    title: "Invoices bill a single fixed fee",
    detail: "Log hours is gone, and invoices now show one fixed-fee line item instead of hours and a rate — matching how the firm actually prices work.",
  },
  {
    date: "2026-05-29",
    tag: "new",
    title: "Pipeline cards show their age",
    detail: "A deal's card turns from green to orange to red the longer it sits in one stage — stepping about every two weeks. Drag it forward and it resets to green. The board now shows at a glance which deals have stalled.",
  },
  {
    date: "2026-05-28",
    tag: "improved",
    title: "Draft email now writes the email for you",
    detail: "The Draft email action reads the contact's record and recent history and writes the draft in the firm's voice. It never invents a price, date, or name — anything it's missing comes back flagged for you to fill, and a draft can't save or send until you do. Edit it however you like, then save or send.",
  },
  {
    date: "2026-05-28",
    tag: "new",
    title: "Drag deals across the pipeline",
    detail: "Move a deal between stages by dragging its card. When you drop it, the tool offers to set up the next task with a head start on the details.",
  },
  {
    date: "2026-05-28",
    tag: "new",
    title: "Tasks have their own page",
    detail: "Find everything to do under Tasks in the sidebar. Assign tasks to each other, and add context so anyone picking it up knows what it's for.",
  },
  {
    date: "2026-05-28",
    tag: "improved",
    title: "The activity feed is live",
    detail: "Moving a deal, completing a task, sending an email — it shows up on the dashboard as it happens, so the whole team sees the firm's pulse.",
  },
  {
    date: "2026-05-28",
    tag: "new",
    title: "What's new page",
    detail: "This page. A running, plain-English log of changes to the tool that matter to you.",
  },
  {
    date: "2026-05-28",
    tag: "improved",
    title: "Dashboard feed items now click through",
    detail: "Activity rows link straight to the deal, project, or invoice they're about.",
  },
  {
    date: "2026-05-27",
    tag: "new",
    title: "How it works reference",
    detail: "A walkthrough of how the ops tool is put together, under Reference in the sidebar.",
  },
  {
    date: "2026-05-27",
    tag: "new",
    title: "Draft an email from a contact",
    detail: "Quick Action drafts the email, saves it, and logs the interaction — all in one step.",
  },
  {
    date: "2026-05-26",
    tag: "new",
    title: "Convert a deal to a client",
    detail: "Closing a deal creates the Drive folder, the client, and the project in one move.",
  },
];
