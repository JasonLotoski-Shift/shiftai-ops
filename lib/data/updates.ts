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
