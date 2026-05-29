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
