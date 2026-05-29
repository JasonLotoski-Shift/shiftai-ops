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
