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
    date: "2026-06-28",
    tag: "new",
    title: "A general ledger in Financials: every payment in one place",
    detail:
      "Financials has a new Ledger tab. It lists every money movement in one table: invoices coming in, plus bills, expenses, and contractor payouts going out. Contractor payouts used to live only on the project page; now they roll up into Financials too. Filter by type, money in or out, settled or outstanding, or search a name or project, and group by Entity to see everything for one person or vendor at once (a contractor's payouts and their invoices side by side), by Project, or by Month. Anything paid without an invoice or receipt on file is flagged at the top under “Needs a document” with the amount. From there you can link a contractor payout to the vendor invoice that documents it — or mark it “no invoice required” with a reason — and the flag clears. Because the payout is the cash and the linked invoice is just its paperwork, the two never double-count: the “Money out” figure is one correct number, not the payment counted twice. Export CSV now includes payouts and a column showing which rows are counted as cash. Managing partners only.",
  },
  {
    date: "2026-06-28",
    tag: "new",
    title: "Money emails sort four ways now — incl. reimbursements and USD",
    detail:
      "An email in the ops-AR/AP label is read as one of four things and filed the right way from the review: a vendor bill we owe (Add to AP); a receipt someone paid on their OWN card (Reimburse — pick the partner or contractor, and it's tracked as owed to them until you pay them back); a receipt already paid on a firm card (Log firm-paid, a record only); or a payment on an invoice we sent (Mark paid). USD invoices convert to CAD automatically at a rough rate, and the original USD figure stays on the record and in the bookkeeper CSV. Filing happens through these actions, so a money email can't be marked done without actually landing in the books.",
  },
  {
    date: "2026-06-27",
    tag: "new",
    title: "A Gmail label for bills and payments — they file to AP/AR",
    detail:
      "Make one more Gmail label, ops-AR/AP, and label any vendor bill or payment email with it. Every 6 hours those land on Ingest, read as either a bill we owe (AP) or a payment on an invoice we sent (AR). A bill gets a one-click Add to AP. A payment is matched to the invoice you already issued and offers Mark paid — it never creates a second record. If the email only links out to view the invoice (no amount in the body), it's flagged “needs detail” with the link so you can finish it by hand. Your regular ops-log label goes back to client threads only; bill detection now lives in the new label.",
  },
  {
    date: "2026-06-27",
    tag: "improved",
    title: "Logging an expense is simpler — one type, with a description box",
    detail:
      "Expense and Receipt used to be two separate choices on the AP/AR upload. They're now one: Expense. The receipt is just the photo you attach to it. Each expense also has a short Description box so you can note what it was for (e.g. client dinner with the Acme team), which then shows on the ledger and in the bookkeeper CSV export.",
  },
  {
    date: "2026-06-27",
    tag: "new",
    title: "Firm Knowledge now holds real documents and a decision log",
    detail:
      "Two additions to Firm Knowledge. Upload document takes a PDF, Word, Excel or text file straight into the firm brain — it reads the text, writes a short summary, and files it under a category. It lands as a draft; press Approve for skills and the AI can find it when a question needs it. And a new Decision log records the calls that shape the firm — what was decided, the options weighed, the consequences — so the AI never contradicts a decision it should know about. Both are visible to all partners by default; managing partners can mark an item as MP-only.",
  },
  {
    date: "2026-06-27",
    tag: "new",
    title: "Vendor invoices from email can be filed straight to AP",
    detail:
      "An email labelled ops-AR/AP that looks like a vendor invoice — a bill we owe — is flagged in the Ingest review with the vendor, amount and due date read off the email. One click on “Add to AP” files it as a bill in Financials → AP/AR, ready to pay. (See the ops-AR/AP label entry above for the full picture, including payments.)",
  },
  {
    date: "2026-06-25",
    tag: "new",
    title: "Firm Knowledge now has a recent memory the AI reads",
    detail:
      "Inside Firm Knowledge there's a new Recent memory page — a few short notes (firm state, active engagements, recent decisions, watch list) that every AI action reads as live context, so it always knows where things stand. Write a note and it stays a private draft; press Approve and it goes live to the AI. Keep them short and re-approve when they change. Automatic weekly drafts come in a later phase.",
  },
  {
    date: "2026-06-25",
    tag: "improved",
    title: "Receipts scan themselves, plus a Subscriptions view and CSV export",
    detail:
      "Three additions to the AP / AR tab. Add a photo of a receipt or invoice and it now reads itself — vendor, amount, date and category come back filled in for you to check, instead of typing them by hand (snap, confirm, save). Recurring costs like Miro, Claude, phones and the office get their own Subscriptions list with renewal dates, so that spend is visible at a glance. And an Export CSV button hands the whole ledger — invoices, bills and expenses — to your bookkeeper in one file.",
  },
  {
    date: "2026-06-25",
    tag: "new",
    title: "New Firm Knowledge section — one home for what the firm knows",
    detail:
      "There's a new Firm Knowledge tab (under Firm in the sidebar). It's the start of a single place for the firm's own knowledge — meetings and decisions, how we build, product, brand and sales, learning, and reference. This first version lets you browse firm-wide documents by category, see who looks after each area, and spot anything that's due for a review. Uploading your own documents — and having the AI actually read them — comes in the next phase.",
  },
  {
    date: "2026-06-25",
    tag: "new",
    title: "Financials now tracks money out too — bills to pay and team expenses",
    detail:
      "Financials has a new AP / AR tab (managing partners only). It shows what clients still owe us (invoices we've sent) next to what we owe — vendor bills and team expenses — with aging so you can see what's overdue. Use the Upload button to add a vendor invoice, log an expense, or snap a receipt: pick a photo or PDF and fill in the details, and it files to the firm's Drive automatically. No photo handy? Save it anyway and it's flagged “needs photo”. Mark a bill paid and its file moves to a Paid folder with the payment date in the name. Expense categories cover travel, meals, business development, fuel/mileage and subscriptions. The old Invoice Register now lives inside this tab.",
  },
  {
    date: "2026-06-24",
    tag: "improved",
    title: "Faster page loads, and no more frozen-looking screens between tabs",
    detail:
      "Clicking from one tab to another now shows an instant loading placeholder instead of leaving the old page sitting there, so the tool feels responsive right away. Under the hood it also fetches its data faster, so pages finish loading more quickly. Nothing changes in how you use it — it's just quicker.",
  },
  {
    date: "2026-06-24",
    tag: "improved",
    title: "Discovery prep now saves as a clean, branded web page",
    detail:
      "Generate a discovery prep on a deal and it now files to Drive as a styled HTML page in the firm's colours, not a plain markdown file — open it in a browser and it reads like a proper brief. Same content and the same [NEEDS INPUT] safety check; just a better-looking deliverable. One thing to know: while you're editing the draft in the tool you'll see the underlying HTML, and the styling shows up in the saved file.",
  },
  {
    date: "2026-06-24",
    tag: "new",
    title: "Name a deal, and give a contact more than one company",
    detail:
      "Two changes. Deals can now have their own name — set it when you add a deal (or under Edit) and it becomes the deal's heading; leave it blank and it still shows the company, like before. The company is the deal's own field and doesn't have to match the contact's. And a contact can now wear more than one hat: open Edit details on a contact and add as many company + role rows as you need, with one marked Primary (the main one used across the tool). Handy for someone who's, say, CEO of two companies.",
  },
  {
    date: "2026-06-24",
    tag: "new",
    title: "Tell us what to build or fix — the new Requests & Fixes board",
    detail:
      "There's a new Requests & Fixes tab (under Other in the sidebar). Anyone can file one: a title, a description, which part of the app it's about (pick the tab, then the section inside it if there is one), and a type — bug fix, new feature, improvement, or broken. Items sit on a simple board — Open, In progress, Done, Declined — and anyone can move one along. Use it for anything you'd otherwise just mention in passing.",
  },
  {
    date: "2026-06-23",
    tag: "improved",
    title: "Read every email on a client's Timeline, and email threads stop piling up",
    detail:
      "Every client and pipeline deal now has a Timeline tab: the full text of each email, meeting note, and document, newest first — expand any entry to read the exact words a client wrote, right in the tool (no more hunting in Drive). When you label a Gmail thread, replies now fold into ONE growing review card instead of creating a separate ingest per message. Documents keep a history: re-upload a new version with the Replace button and the older versions tuck under one record instead of cluttering the list as look-alikes. And tasks with no real deadline now show “No date” instead of looking overdue — the board's due dates mean something again.",
  },
  {
    date: "2026-06-23",
    tag: "new",
    title: "Record who sourced a deal — and see the commission flow through",
    detail:
      "On a deal you can now record up to two people who get paid for bringing in the work — a partner or an outside referrer — each on 1 to 10% of the deal value or the total 6 or 12-month value. When the deal converts, the commission carries onto the project automatically; if it's a subscription, a new On-going Service Contract is created with a future start date and the recurring commission is tracked month by month. There's a new Service Contracts tab under Projects for the recurring side. Commission figures are visible to managing partners only.",
  },
  {
    date: "2026-06-23",
    tag: "new",
    title: "Financials now shows a forecast and per-partner economics",
    detail:
      "Financials adds a forecast: your pipeline weighted by win probability, the subscription run-rate (MRR and ARR), a projected cash-in calendar for the next 12 months, and a firm-wide commission line. A new managing-partners-only Partner economics view breaks down each partner's take-home (owed and paid), origination earnings, and commission.",
  },
  {
    date: "2026-06-23",
    tag: "improved",
    title: "Sharper discovery survey, lead filters, and a tidier Actions menu",
    detail:
      "The discovery questionnaire now researches the whole company across every part of the business before it writes questions, so it learns more than just what came up on the call: a handful of sharp questions on the call topics, plus broad coverage everywhere else. Promoted and AI-found leads can now be filtered by industry, who surfaced them, who's claimed them, or a name/keyword search. And the deal Actions menu puts Follow-up email and Book a meeting up top, with the rest as tighter, easier-to-scan buttons.",
  },
  {
    date: "2026-06-22",
    tag: "improved",
    title: "Ingest matches better and proposes fewer, cleaner tasks",
    detail:
      "Ingest now figures out which client, deal, and project an email or note belongs to far more reliably. It matches on the company's email domain (so a new person at a known client still lands on the right record), looks across everyone linked to a deal — not just the main contact — and pre-fills the client's project when there's only one active. Labeled Gmail threads with several people on them no longer get dropped as “unassigned.” On the review screen, proposed tasks now start unchecked — you tick the few worth keeping (or turn a key point into a task in one click) instead of getting a long pre-checked list. A task whose owner the note didn't name now stays unassigned rather than quietly landing on whoever's reviewing, and near-duplicate tasks (“Send proposal” vs “Send the proposal”) are caught.",
  },
  {
    date: "2026-06-22",
    tag: "improved",
    title: "Contracts now generate as an editable Google Doc",
    detail:
      "Generate contract now files the agreement as a native Google Doc in the client's Drive folder — open it to redline, comment, fill the blank lines, and share or export to PDF, instead of a fill-in-the-browser web page. The Doc comes out on the firm letterhead — proper margins, Inter type, and a SHIFT AI header and footer — names the firm correctly (SHIFT AI OPS LTD.), and fills in the firm address. Fields the client completes — their address, the milestone dates, the hosting provider — show as blank lines to fill in at signing. The insurance section is gone for now, since the firm has no policy yet. Anything the firm still owes — the fees, the engagement name — is highlighted and still blocks saving until it's real.",
  },
  {
    date: "2026-06-19",
    tag: "improved",
    title: "Generate a contract straight from a deal, not just a client",
    detail:
      "The Generate contract action now lives on the deal too, as its own step after the proposal. A deal only becomes a client once the contract is signed, so this is where you draft the agreement to send. It works the same as on a client: fills the counsel-approved BC template with the parties, fees, and dates, drafts Schedule A from the deal's scope of work, and files a fillable contract to the deal's Drive folder.",
  },
  {
    date: "2026-06-18",
    tag: "new",
    title: "Generate a contract from a client, ready to fill and export to PDF",
    detail:
      "On a client, “Generate contract” drafts the firm's standard agreement: a Master Conditional Sale and Custom Software Development Agreement where the client buys the custom build and Shift keeps the reusable engine underneath it. You enter the parties, the build fee, the monthly Background IP licence fee, the payment schedule, and the effective date, and Claude writes Schedule A (the Deliverable) from the approved Statement of Work. The legal terms are a fixed template, researched for a BC corporation (governing law, privacy, intellectual property, liability, escrow), so the wording stays the same on every contract and only the deal-specific parts change. It saves as a fillable web page in the client's Drive folder: open it, fill any remaining fields right in the browser, and use the Download PDF button. The legal terms are counsel-approved; the tool still will not save while any [NEEDS INPUT] field is blank, including Shift's own legal details.",
  },
  {
    date: "2026-06-18",
    tag: "new",
    title: "The proposal is now one flow: a scope of work, then a deck built from it",
    detail:
      "“Draft proposal” is now “Draft scope (SOW)” — a high-level scope of work built from the prototype: what we'll build, the foundation we set up first (the environment, the data and API connections, access), the phases, what the client owns, what we need from them, the timeline, and the fixed fee. Then “Build deck” takes that approved scope plus the prototype and builds the client-facing pitch deck the same way the prototype builds itself — it drafts, looks at its own work, and improves it over a few rounds in its own tab, with a live “Demo prototype” button baked in. The deck waits until both a prototype and a scope exist. And the deal's actions are now laid out as numbered steps — Discovery, Prototype, Proposal — with an (i) on every action you can hover to see exactly what it does and what happens when you run it.",
  },
  {
    date: "2026-06-18",
    tag: "improved",
    title: "Download a document straight from a deal",
    detail:
      "Each document on a deal now has a download button next to it — grab the file as-is (the HTML, PDF, Markdown, whatever it is) without opening Drive first. Opening it in its own tab still works too.",
  },
  {
    date: "2026-06-18",
    tag: "improved",
    title: "Documents open ready to read, not as raw code",
    detail:
      "Opening an HTML document from a deal's Documents list now shows the finished page in its own tab, instead of a wall of code. Other files — PDFs, decks, sheets — still open in Drive as before, and nothing about how files are saved changes.",
  },
  {
    date: "2026-06-18",
    tag: "improved",
    title: "Prototypes now come with a light/dark theme switch",
    detail:
      "Every prototype the builder makes now ships in both a light and a dark version, with a switch in its top bar so you (or the client) can flip between them. It opens in whichever fits the client's brand — dark for deeper, moodier palettes, light for cleaner, brighter ones — and remembers the choice. Handy when you're showing the prototype on a bright screen in a room, or the client just prefers one look.",
  },
  {
    date: "2026-06-18",
    tag: "improved",
    title: "Build prototype now picks where to start and writes a sharper brief",
    detail:
      "When you click “Build prototype”, the tool reads the discovery report and your discussion notes and proposes which problem to prototype first — pre-selecting the obvious winner, or asking you when it's a close call — instead of you typing it into a blank box. The brief it drafts is deeper: it leads with the one “magic moment” (the single click where the AI does the hard thing they hate) and says where the prototype should use real visuals like a live map or board. So what comes back feels built for them, not generic. You still review and edit the brief before anything builds.",
  },
  {
    date: "2026-06-18",
    tag: "improved",
    title: "Accepting an estimate now sets the deal's value, and you can delete a deal",
    detail:
      "Three small pipeline changes: (1) when you mark an estimate accepted, the deal's value updates to the estimate total — the accepted scope is the number that shows on the board. (2) The deal's value field takes any exact dollar amount now, not just round thousands. (3) A deal has a Delete button (next to Edit) for mistakes and dead leads — it removes the deal and everything on it after you confirm; files already saved to Drive stay in Drive. Signed deals can't be deleted (they've become clients).",
  },
  {
    date: "2026-06-18",
    tag: "new",
    title: "Build prototype now builds itself, looks at its own work, and takes your notes",
    detail:
      "On a deal, “Build prototype” now hands the approved brief to a builder that writes the prototype, screenshots it in a real browser, clicks through the interaction to check it actually works, and improves it over a few rounds until it's good — opening in its own tab so the tool stays free while it runs. When it's done you can leave one note (e.g. “add a map of the routes, lead with the at-risk sites”) and it does one more pass on that, then you approve. Prototypes that need a map now use a real interactive map.",
  },
  {
    date: "2026-06-17",
    tag: "new",
    title: "Leave team notes on any architecture card",
    detail:
      "Open a card in the Architecture map and the panel now has a Team notes section — add a note, see who wrote it and when, and delete any note. Cards that have notes show a small count, so you can see where the conversation is at a glance. Notes are shared across the whole team.",
  },
  {
    date: "2026-06-17",
    tag: "new",
    title: "The firm's architecture map is now a tab",
    detail:
      "Architecture (in the sidebar, under Other) opens the whole firm on one canvas — every zone, who owns what, and the rules that hold it together. Click any box with a ＋ to open it and drill in; click a connection to jump to its other end. Same map from the strategy work, now living inside the tool.",
  },
  {
    date: "2026-06-15",
    tag: "new",
    title: "Build a discovery report any time — no questionnaire required",
    detail:
      "The discovery report is now its own button on a deal, alongside Discovery prep and the questionnaire. If the client filled out the questionnaire, it builds from their answers. If they didn't — you ran off a recorded call, your notes, or research — it reads the whole deal Drive folder (transcripts, notes, files) and builds a best guess instead. Anything it infers is labelled estimated, and you review the draft before it goes anywhere.",
  },
  {
    date: "2026-06-15",
    tag: "fixed",
    title: "Ingesting a long document works now",
    detail:
      "Dropping a big, detailed file into the ingest composer (like a full SOP walkthrough) used to fail with a vague error. The extraction was getting cut short on long documents. It now has the room to read the whole thing.",
  },
  {
    date: "2026-06-13",
    tag: "new",
    title: "You can delete a document now",
    detail:
      "Hover any document on a deal, project or client and a trash icon appears. Click it, confirm once, and the document is removed — including the underlying file in Drive. Deletion is permanent, so the confirm is there on purpose. Any tasks hanging off that deliverable go with it.",
  },
  {
    date: "2026-06-13",
    tag: "new",
    title: "Industries got wider — and a sub-industry on every record",
    detail:
      "The industry list now covers all the firm's verticals — automotive, motorsport, engineering, construction, architecture, heavy equipment, distribution, logistics, professional services, wineries & beverage, plus real estate, manufacturing and healthcare — with the primary beachheads listed first. Every contact, deal and client also gets a sub-industry (e.g. Dealership Groups under Automotive, Heavy Civil under Construction): pick the vertical and the matching sub-types appear. Contacts, Clients and the pipeline board show the sub-industry next to the industry tag and have quick filter chips to narrow by vertical or sub-type.",
  },
  {
    date: "2026-06-13",
    tag: "improved",
    title: "How it works is now a training manual, and the deal process moved inside it",
    detail:
      "How it works opens on a new Start here tab: a guided walkthrough of the three phases an engagement runs (Discovery, Build, Run), each one opening to why it matters, what you do, how the tool does its part, and what every record is for. The deal-process track (the racing line from finding a lead to a signed deal) is now a tab in the same page, so the whole picture lives in one place. The separate Deal Process page is retired; its link now lands you here.",
  },
  {
    date: "2026-06-12",
    tag: "improved",
    title: "Task Board does a lot more — and moved up the menu",
    detail:
      "Task Board now sits right under Dashboard, where you'll reach for it. On the board you can assign a milestone to a partner and promote a loose task into a milestone, tag a task with the deal or contact it belongs to, and delete a task or a milestone (with a confirm first). Drop a task into In Review and you're asked who should review it. Drag is easier — a card now drops anywhere over a column, not just onto another card — and the column headers stay put while the cards scroll. You can also archive a task (it drops off the board after 7 days but stays in the system), the same way milestones already archive.",
  },
  {
    date: "2026-06-12",
    tag: "improved",
    title: "Actions show when they last ran — and let you finish a two-step action later",
    detail:
      "On a deal, contact, or client, each action in the Actions panel now shows when it last produced something (\"last ran\" with the date, in green) so you can see at a glance what's already been done. For the two-step actions — the ones where you review and edit a draft first, then build the finished piece — you can now save step 1 and come back to it. A saved step shows in orange and reopens with your edits already in place.",
  },
  {
    date: "2026-06-12",
    tag: "improved",
    title: "A fuller picture on the Projects page",
    detail:
      "The Projects list now shows more on each project: a compact timeline with the next milestones plotted on it, the next milestones spelled out so you know what's coming, and any documents created back at the deal stage (discovery prep, the proposal, the discovery report) carried onto the project — so the work that led into the engagement is right there, not left behind on the deal.",
  },
  {
    date: "2026-06-12",
    tag: "improved",
    title: "Discovery questionnaire now reads the whole deal folder — and replaces the old survey",
    detail:
      "The Discovery questionnaire used to draft from the deal record and the one-line interaction summaries. It now reads every file in the deal's Drive folder — full call transcripts, notes, docs, screenshots — so the questions reference what the client actually said. The old Survey action (on deals and clients) is retired: it produced a markdown file with no way to collect answers. The questionnaire covers that step end-to-end — you review the questions, it becomes a live Tally form, and the answers land back on the deal automatically. The dashboard tile now points at the questionnaire too.",
  },
  {
    date: "2026-06-11",
    tag: "improved",
    title: "Build prototype now reads everything — and you approve the brief first",
    detail:
      "Build prototype used to see only the deal record and a few screenshots. It now reads every file in the deal's Drive folder — call transcripts, the discovery report, survey responses, call notes — and looks up the client's brand colors from their website. It first drafts a prototype brief (the problem, user stories, key features, the tabs to build) that you review and edit before anything gets built; the brief saves to a new Prototype folder in the deal's Drive as a .md you can reuse. The build itself is bigger too: a multi-tab, clickable prototype with realistic mockup data, in the client's colors (Shift's look when we can't find theirs).",
  },
  {
    date: "2026-06-11",
    tag: "fixed",
    title: "Enrich a lead Apollo can't find — just add the website",
    detail:
      "Enrich and Find more people used to dead-end on smaller companies Apollo doesn't list (you'd see \"couldn't resolve a domain\"). Now a lead with no domain shows an \"Add website\" box — paste the company's site and both work straight away. Enrich also reads a website you've added (it didn't before), and if the lookup fails because Apollo itself is down or misconfigured, the message now says so instead of blaming the company.",
  },
  {
    date: "2026-06-11",
    tag: "new",
    title: "Check Tally too — and a 6-hourly backstop for questionnaires",
    detail:
      "There's now a “Check Tally” button alongside Check Gmail and Check Fireflies on Ingest, plus a 6-hourly sweep. The Tally webhook still delivers questionnaire responses instantly; this is the safety net that re-pulls any that didn't come through, and saves them to the deal/client just like a live submission.",
  },
  {
    date: "2026-06-11",
    tag: "new",
    title: "Find more people at a target company — for better cold outreach",
    detail:
      "Open a lead and hit “Find more people”: it searches Apollo for decision-makers and scrapes the company's own team/about pages, then adds everyone net-new to the people list with their title (and LinkedIn where the site shows it). It also tells you how many contacts you already have at that company. It spends no credits — reveal a work email per person with the existing Reveal button (1 credit each).",
  },
  {
    date: "2026-06-11",
    tag: "new",
    title: "Screenshots and files you ingest are saved to Drive — and feed the AI",
    detail:
      "Drop a screenshot or file into Ingest for a client or deal and a copy now lands in that client/deal Drive folder (and shows in Deliverables), not just the extracted text. Those screenshots also become visual input: when you generate a discovery report or a prototype, the AI sees the client's actual tools and spreadsheets, not just what was typed about them.",
  },
  {
    date: "2026-06-11",
    tag: "improved",
    title: "Leads now build a real company picture — and tell you how to sell to them",
    detail:
      "Opening an AI Found or Promoted lead used to show a score and a one-line rationale. Enrich now also builds the same company profile deals get (description, systems, pain points, key facts, sourced from the web) plus a new selling view: how they map to what Shift AI does, what they likely need from us, and the angle to open with. Cold email drafts use it, and when a lead joins the pipeline the profile carries onto the deal automatically.",
  },
  {
    date: "2026-06-11",
    tag: "fixed",
    title: "Big contact scans now finish — and show live progress",
    detail:
      "Scanning a large import (thousands of contacts) used to stall at “scoring” and never produce a report. The results step is now fast and self-healing: if anything interrupts it, the next progress check picks up where it left off. The progress bar also shows real counts while results land. Stuck scans from before this fix will complete on their own the next time you open the Import page.",
  },
  {
    date: "2026-06-11",
    tag: "improved",
    title: "Actions are easier to spot on deal, contact, and client pages",
    detail:
      "The Actions panel under the title now shows open by default with a clear gold button, instead of hiding behind a faint text toggle. You can still collapse it.",
  },
  {
    date: "2026-06-11",
    tag: "new",
    title: "Check Gmail and Fireflies on demand — right from Ingest",
    detail:
      "Gmail and Fireflies now sweep every 6 hours (was hourly), and there are “Check Gmail” and “Check Fireflies” buttons at the top of the Ingest page. Just had a call? Hit Check Fireflies and the meeting lands for review in seconds instead of waiting for the next sweep.",
  },
  {
    date: "2026-06-11",
    tag: "improved",
    title: "Smarter duplicate checks when adding contacts and tasks",
    detail:
      "Adding a contact now checks the whole book first — by email, by company + name, and by close-but-not-exact name matches. An exact or strong match is flagged before you create a second copy: you see who's already on file, can open them, or add anyway. Ingest does the same, and it now recognises the same person on a new email address. Task duplicate-checks at ingest also catch near-misses like \"Send proposal\" vs \"Send the proposal\" — flagged as a possible duplicate (unchecked by default, re-check to add anyway).",
  },
  {
    date: "2026-06-11",
    tag: "fixed",
    title: "Lead enrichment now tells you when something didn't work",
    detail:
      "Enriching a promoted lead used to fail silently — it would run and appear to do nothing. It now reports what went wrong (a company it couldn't find a website for, a service that's misconfigured, or out of credits) right on the Enrich button.",
  },
  {
    date: "2026-06-11",
    tag: "new",
    title: "Cold email sent — a holding tab so outreach doesn't flood the board",
    detail:
      "After Claude drafts a cold email on a lead, you now pick where it files: straight onto the pipeline board (as before), or into the new Cold email sent tab — plus Copy and Save draft. Leads in the cold tab wait there with the send date and days-waiting; when one replies, “Replied → add to funnel” creates the contact and a deal at Qualified, and “No reply” sets it aside. The board only carries real conversations.",
  },
  {
    date: "2026-06-11",
    tag: "new",
    title: "Claim a lead, or hand it to a partner",
    detail:
      "AI Found and Promoted leads now show who surfaced them right under the company name, and any partner can claim a lead in one click from the card — or assign it to someone else from the lead page. The owner shows on the card, the lead page, and the cold-email tab, so two partners don't chase the same company.",
  },
  {
    date: "2026-06-11",
    tag: "new",
    title: "Deal documents now file into a proper Drive folder — with links on the deal",
    detail:
      "Docs generated at the deal stage (discovery prep, proposals, discovery reports, prototypes, questionnaire responses) used to land loose in the Shared Drive root. Each deal now gets its own folder under 00-Pipeline, created the first time you save a doc, and the deal page has a Documents card listing every file with its date and a click-through to Drive. When a deal converts, the whole folder moves into the new client's folder automatically and the docs join the client's Deliverables tab. Existing pipeline deals have been backfilled — folders created, loose files moved in, links unchanged.",
  },
  {
    date: "2026-06-11",
    tag: "improved",
    title: "Pop-up forms warn before they throw away your work",
    detail:
      "Clicking outside a form pop-up (new deal, new contact, ingest, drafts, and the rest) used to silently close it and lose everything you'd typed. Now a confirm steps in first — Keep editing (green) or Close — discard (red).",
  },
  {
    date: "2026-06-11",
    tag: "improved",
    title: "Key facts show in full, in a scrollable window",
    detail:
      "Key facts (and the other profile lists) on deals, clients, and contacts now show every item with a count, inside a capped window you scroll — long records no longer stretch the whole page.",
  },
  {
    date: "2026-06-10",
    tag: "new",
    title: "Send a discovery questionnaire after a call — it builds the report",
    detail:
      "On a deal you can now generate a deep, business-specific questionnaire from the discovery call — 30–45 questions about their actual operation, tools, and bottlenecks — review and edit it, and create a real form with one click. The link drops into the follow-up email. When the prospect fills it out, the answers save straight to the deal (and carry to the client on convert), land a copy in their Drive folder, and notify you. “Build discovery report” then turns those answers into the client-facing report. (Needs the form-tool keys set before it goes live.)",
  },
  {
    date: "2026-06-10",
    tag: "new",
    title: "People on deals and clients — who's connected, and their role",
    detail:
      "A contact can now be linked to any deal or client with how they're connected (works there, introduced us, advisor) and — where it matters — their pull in the buying decision (decision-maker, champion, budget holder, and so on), with one person marked as the main contact. Deals also carry the same company profile a client gets (website, socials, size, the systems they run, their pain points) with the same enrich-from-web. And Ingest can now propose new people and links straight from an email or meeting — all behind the same review-and-approve gate, nothing written until you say so. On convert, a deal's people and profile carry over to the new client.",
  },
  {
    date: "2026-06-10",
    tag: "improved",
    title: "AI drafts now follow a tighter writing rule",
    detail:
      "Every client-facing draft (emails, outreach, proposals, SOWs, surveys, reports, prototypes) now follows a firm-wide rule: bite-sized and fact-based, lead with the number, cite sources, no storytelling hooks, and no “not X, but Y” phrasing. Drafts should read like a partner wrote them, with less editing before send.",
  },
  {
    date: "2026-06-09",
    tag: "new",
    title: "A visual map of the deal process",
    detail:
      "Under Other there's a new Deal Process page: the whole road from finding a lead to a signed engagement, drawn as one track — the three client meetings (Discovery, Discussion, Proposal) and the work that happens between them. Hover any step and the panel beside it expands with what that step is for, what you walk in and out with, and which part of this tool does the work.",
  },
  {
    date: "2026-06-09",
    tag: "improved",
    title: "Quick Actions tidied: discussion doc retired",
    detail:
      "The “Draft discussion doc” action (dashboard and client pages) is gone — it overlapped with Discovery prep, which is the one internal meeting-prep brief going forward. Existing saved discussion docs in Drive are untouched.",
  },
  {
    date: "2026-06-09",
    tag: "improved",
    title: "Ingest reads your attachments, files, and images",
    detail:
      "Ingest now reads the content of PDF, Word, Excel, HTML, Markdown, and text files — and reads images (screenshots, photos, scans) with Claude's vision — not just the email body or pasted notes. Drop a file or image into the composer, or just label an email with attachments: Claude reads them too and folds them into what it proposes. Large files are capped, and anything it can't read is flagged rather than silently dropped.",
  },
  {
    date: "2026-06-09",
    tag: "new",
    title: "Cross-reference an Ingest item before you approve it",
    detail:
      "Reviewing a meeting, email, or uploaded file on Ingest now has a “Cross-reference records & tasks” button. It works out which client or deal the item belongs to — handy when an email arrived without a match — and fills that in for you, and it flags any action item that's already an open task, unchecking it so you don't add a duplicate. Nothing is written until you approve, as always.",
  },
  {
    date: "2026-06-09",
    tag: "new",
    title: "A System status tab in Settings",
    detail:
      "Settings now has a System status tab (everyone can see it) that shows whether the tool's automation is healthy: Claude actions in the last 24h with any errors and a rough cost, the Fireflies and Gmail sweeps' last runs, your Gmail connections, a live Google Drive check, and a feed of recent activity with failures in red. If a scheduled sync or an integration fails, the responsible partner also gets a message — so a quiet breakage doesn't go unnoticed.",
  },
  {
    date: "2026-06-06",
    tag: "new",
    title: "Statement of Work drafts, as a Google Doc",
    detail:
      "A new Statement of Work action on a client drafts a contract-grade SOW: scope and acceptance, the build + subscription + buy-out terms, and the firm's IP and ownership model. It files to the client's Drive folder as a Google Doc you and counsel redline. It is a draft, never signature-ready: it stamps a DRAFT banner, tags the binding wording for counsel, and won't save until every fee, party, and date is real.",
  },
  {
    date: "2026-06-06",
    tag: "new",
    title: "Link an Ingest item to a pipeline deal",
    detail:
      "When you review a meeting, email, or uploaded file on Ingest, you can now pick a pipeline deal to link it to. Approving logs the summary against that deal's main contact, so the touch shows up on the deal — handy for calls and emails that belong to a deal you haven't signed yet. Works for Fireflies, Gmail, and uploads.",
  },
  {
    date: "2026-06-06",
    tag: "new",
    title: "Settings nudges you to connect Gmail for email logging",
    detail:
      "If you haven't connected your Gmail yet, Settings now shows a red “Connect Gmail” tag in the sidebar. On the Settings page there's an info icon next to Email logging that walks you through it step by step: make a label called “ops-log”, connect, then label any client thread you want logged. We only ever read threads you've labeled — never your whole inbox — it's read-only, and we check once an hour.",
  },
  {
    date: "2026-06-06",
    tag: "improved",
    title: "Ingest won't create duplicate tasks, and names them simpler",
    detail:
      "When you approve a meeting, email, or dropped file on Ingest, any task or milestone that's already open on the same client or project is skipped instead of added again — so two sources mentioning the same thing don't double it up (you'll see how many were skipped in the activity feed). Task and milestone names are also shorter now: just the thing (“Pilot SOW”, “Prototype V2”) instead of a sentence with a verb and a date.",
  },
  {
    date: "2026-06-06",
    tag: "improved",
    title: "Firm economics are managing-partner only",
    detail:
      "The rate card and firm economics in Settings — bill/pay rates, margins, and the revenue splits — now show only to managing partners. Everyone still has their own Settings (like connecting Gmail); the firm-money parts are just hidden for non-managing partners.",
  },
  {
    date: "2026-06-06",
    tag: "new",
    title: "Meetings auto-log from Fireflies",
    detail:
      "Record a client call in Fireflies and put “Shift” in the meeting title — when the transcript is ready it's matched to the client and queued on Ingest for you to approve (summary, action items, enrichment). Calls with only the team on them, or without “Shift” in the title, are skipped so standups don't clutter the queue.",
  },
  {
    date: "2026-06-06",
    tag: "new",
    title: "Log client emails by labeling them in Gmail",
    detail:
      "Connect your Gmail in Settings, then label any client thread “ops-log”. Those emails — sent and received — get matched to the client and queued on Ingest for you to approve, the same review step as meetings. It only ever reads threads you label, never your whole inbox, and you can disconnect anytime.",
  },
  {
    date: "2026-06-06",
    tag: "fixed",
    title: "Invoices no longer add HST",
    detail:
      "Invoices used to tack on 13% HST and show it as the total. The firm isn't tax-registered, so that line is gone — the invoice total is now just the amount billed.",
  },
  {
    date: "2026-06-05",
    tag: "new",
    title: "Discovery report: a client-facing deck in their brand",
    detail:
      "After discovery, a one-click Discovery report on a client builds a browser-ready deck: it plays back what they told us, lays out the build as an idea to react to, shows the time saved, and ends by confirming they see the value. It renders in the client's own brand colors (in Shift's type and layout) when we have them, and carries no pricing; that stays in the proposal. Edit it, then it files to Drive.",
  },
  {
    date: "2026-06-05",
    tag: "improved",
    title: "Enrich now grabs a company's brand colors",
    detail:
      "Enrich-from-web also reads a company's brand colors off their site and saves them on the record, so client-facing decks can be tailored to their brand. Like every enriched fact, you approve it and it never overwrites what's already there.",
  },
  {
    date: "2026-06-05",
    tag: "new",
    title: "Subscription and buy-out engagements",
    detail:
      "Projects now include two new types: Subscription and Buy-out. A subscription bills month-by-month — the project opens with month 1, and you add the next month when you bill it (no fixed end date). A buy-out is a single lump sum (e.g. 24× the monthly price, or a set fee) and is exempt from the internal 10/15/75 split — the whole amount counts as firm capture. Each new engagement is its own project on the client.",
  },
  {
    date: "2026-06-05",
    tag: "new",
    title: "Open a new project on a client",
    detail:
      "The “+ New project” button on a client now works. Pick the type, name it, set the value (a monthly price for a subscription, the lump sum for a buy-out, or the fee for a build), and it opens with the right billing schedule already in place.",
  },
  {
    date: "2026-06-05",
    tag: "improved",
    title: "Back-date when an invoice was sent or paid",
    detail:
      "Marking an invoice Sent or Paid now lets you pick the real date — so an invoice you emailed last week, or a cheque that cleared on Tuesday, records on the day it actually happened, not the day you logged it. The sent date shows on the invoice.",
  },
  {
    date: "2026-06-05",
    tag: "new",
    title: "Settings — the firm rate card",
    detail:
      "The Settings page is live. It holds the firm rate card — the four standard tiers and their bill/pay rates that seed every estimate and project — editable in one place, plus a read-only summary of the 10/15/75 split and how each engagement type bills.",
  },
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
