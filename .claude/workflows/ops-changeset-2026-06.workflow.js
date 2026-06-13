export const meta = {
  name: 'ops-changeset-2026-06',
  description: 'Industries taxonomy + Task board + Actions run-status/save-step-1 + Projects view + How-it-works manual. Schema/migrations are PREPARED, never applied. All stages Opus 4.8.',
  phases: [
    { title: 'Schema & migrations', detail: 'Edit schema.prisma + lib/types.ts; write PREPARED (unapplied) migration SQL; adversarial verify additive-safety + the one destructive drop', model: 'opus' },
    { title: 'Core build', detail: 'Industries, Task-board data layer, Projects view, How-it-works manual — parallel, disjoint files', model: 'opus' },
    { title: 'Risky UI & state', detail: 'Task-board drag/scroll/archive/reviewer + Actions run-status & save-step-1 — each adversarially verified', model: 'opus' },
    { title: 'Finalize', detail: 'updates.ts entries, prisma generate + tsc + build, fix pass. No push, no migrate.', model: 'opus' },
  ],
}

// ----------------------------------------------------------------------------
// Structured outputs
// ----------------------------------------------------------------------------
const IMPLEMENT_RESULT = {
  type: 'object',
  properties: {
    filesChanged: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    followups: { type: 'array', items: { type: 'string' } },
  },
  required: ['filesChanged', 'summary'],
}

const VERIFY_RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    checkedFor: { type: 'array', items: { type: 'string' } },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string' },
          file: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'problem', 'fix'],
      },
    },
  },
  required: ['ok', 'issues'],
}

// ----------------------------------------------------------------------------
// Shared context handed to every implementer (self-contained — assume a fresh
// agent with no prior conversation). Repo root is the working directory.
// ----------------------------------------------------------------------------
const SHARED = [
  'PROJECT: Shift AI Ops — Next.js 15 (App Router, RSC by default) + Prisma 7 + Auth.js v5 + Supabase Postgres + Tailwind v4. Repo root: c:/Users/jason/Desktop/Shift/shiftai-ops.',
  '',
  'READ-BEFORE-WRITE (hard rule): open and read every file fully before you edit it. Match the surrounding code style, naming, and idioms. Make the minimal correct change.',
  '',
  'PERSISTENCE RECIPE (use for EVERY new mutation): resolve the actor from the session with partnerActor(partnerId, label) (or agentActor(skill)) from lib/audit.ts; read the BEFORE state when you need a diff; then prisma.$transaction(async (tx) => { ...mutate...; await writeAudit(tx, { actor, action, targetType, targetId, changes }); and await writeActivity(tx, {...}) only when the change is feed-worthy }); then revalidatePath(...). writeAudit signature is writeAudit(db, { actor, action, targetType, targetId?, changes?, ip?, userAgent? }) — db is first and accepts the tx client. AI-deliverable actions additionally write an Artifact row (and an Interaction row when it is outreach). Reviewer pings reuse notifyPartner from lib/messaging.ts.',
  '',
  'GOTCHAS (do not regress): keep export const dynamic = "force-dynamic" on app/(app)/layout.tsx; import the singleton Prisma client from @/lib/prisma — never construct a new PrismaClient; never write to lib/generated/prisma; never import lib/data/seed.ts in production code paths (it is fixtures) — query Prisma instead; keep lib/types.ts in lockstep with prisma/schema.prisma; enum convention — multi-word DB values use @map("hyphenated") and JS sees the underscored identifier (UI does .replace("_","-")); single-word and snake_case-identifier enum values that contain no hyphen need NO @map.',
  '',
  'DO NOT, under any circumstance: run prisma migrate / prisma db push / psql / supabase / any command that touches the database; git push; git commit (leave the tree dirty for review). Local prisma migrate hits the SAME live Supabase as prod — migrations are gated and the human runs them. You may run npx prisma generate (it only regenerates the client from schema.prisma, no DB) and npx tsc --noEmit and npm run build.',
  '',
  'TAXONOMY (already decided with the founder — fixed input):',
  'Vertical enum (Industry) = automotive, motorsport, engineering, construction, architecture, real_estate, manufacturing, heavy_equipment, distribution, logistics, professional_services, healthcare, beverage, other. The first four + other already exist; the other nine are NEW (no @map).',
  'Primary beachheads: automotive, motorsport, engineering, construction, architecture, heavy_equipment, distribution, logistics, professional_services, beverage. Secondary: real_estate, manufacturing, healthcare.',
  'Tier-2 sub-industry is a controlled-vocabulary STRING (not an enum) stored on the existing subIndustry field (Deal/Client/ProspectCompany already have it; Contact gains it). Single value per record.',
].join('\n')

// ----------------------------------------------------------------------------
// Adversarial implement -> verify -> fix helper
// ----------------------------------------------------------------------------
async function buildAndVerify(pkg) {
  const impl = await agent(pkg.implementPrompt, {
    label: 'build:' + pkg.label,
    phase: pkg.phaseTitle,
    model: 'opus',
    schema: IMPLEMENT_RESULT,
  })

  if (!pkg.verifyPrompt) return { pkg: pkg.label, impl, verify: null, fix: null }

  const verify = await agent(
    pkg.verifyPrompt +
      '\n\nThe implementer reported:\n' + JSON.stringify(impl, null, 2) +
      '\n\nAdversarially verify. OPEN AND READ the changed files yourself — do not trust the report. Hunt for: anything broken, missing, half-wired, type-mismatched, a regression in untouched behavior, or a gotcha violated. Default to skepticism. Return ok=false with specific, actionable issues if anything is off.',
    { label: 'verify:' + pkg.label, phase: pkg.phaseTitle, model: 'opus', schema: VERIFY_RESULT }
  )

  let fix = null
  if (verify && verify.ok === false && Array.isArray(verify.issues) && verify.issues.length) {
    log('[' + pkg.label + '] verify found ' + verify.issues.length + ' issue(s) — running fix pass')
    fix = await agent(
      'Fix these verified issues in package "' + pkg.label + '". Open each file, make the minimal correct change, do not add behavior beyond the fix. Honor all gotchas.\n\nISSUES:\n' +
        JSON.stringify(verify.issues, null, 2) +
        '\n\nORIGINAL TASK (for context):\n' + pkg.implementPrompt,
      { label: 'fix:' + pkg.label, phase: pkg.phaseTitle, model: 'opus', schema: IMPLEMENT_RESULT }
    )
  }
  return { pkg: pkg.label, impl, verify, fix }
}

// ============================================================================
// PHASE 1 — Schema & migrations (PREPARED, NOT APPLIED)
// ============================================================================
const SCHEMA_PROMPT = SHARED + '\n\n' + [
  '## YOUR PACKAGE: Schema edits + lib/types.ts + PREPARED migration files',
  '',
  'Edit prisma/schema.prisma to the target state below, mirror it in lib/types.ts, and WRITE prepared migration SQL for human review. DO NOT run any migration. Read the current schema first to get exact line context.',
  '',
  'SCHEMA CHANGES:',
  'M1 Industry enum: keep existing values (automotive, motorsport, engineering, construction, other) and add nine new single-word/snake_case values with NO @map: architecture, real_estate, manufacturing, heavy_equipment, distribution, logistics, professional_services, healthcare, beverage. Keep "other" last.',
  'M2 Contact model: add subIndustry String? (Contact currently has the industry enum but no subIndustry; Deal/Client/ProspectCompany already have subIndustry — match their declaration).',
  'M3 Task model: add dealId String? + deal Deal? @relation(fields:[dealId], references:[id]); contactId String? + contact Contact? @relation(fields:[contactId], references:[id]); archivedAt DateTime?; reviewerId String? + reviewer Partner? @relation("TaskReviewer", fields:[reviewerId], references:[id]). Add back-relations: tasks Task[] on Deal; tasks Task[] on Contact; reviewTasks Task[] @relation("TaskReviewer") on Partner. Add @@index([dealId]) @@index([contactId]) @@index([reviewerId]).',
  'M4 Milestone model: REMOVE deal Deal? and dealId String? (the milestone->deal link), and remove the matching milestones Milestone[] back-relation on Deal. THIS IS THE ONLY DESTRUCTIVE CHANGE — a column drop. It is safe: no fixture and no code path sets a milestone dealId.',
  'M5 Task.milestone relation: add onDelete: SetNull so deleting a milestone nulls its child tasks milestoneId instead of failing on Restrict. (Task.milestoneId is already nullable.)',
  'M6 New model ActionDraft: id String @id @default(cuid()); skill String (the generatedFromSkill value); content Json (the editable step-1 output); status String @default("draft"); createdBy String; nullable clientId/dealId/contactId/projectId each with a relation to Client/Deal/Contact/Project; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; @@index on each FK plus skill. Add actionDrafts ActionDraft[] back-relations on Client, Deal, Contact, Project.',
  '',
  'lib/types.ts: extend the Industry union with the nine new values; add dealId/contactId/archivedAt/reviewerId to the Task UI type; REMOVE dealId from the Milestone UI type; add an ActionDraft type if the UI layers will consume it.',
  '',
  'PREPARED MIGRATIONS (write, do NOT apply): create folder prisma/_prepared-migrations/ (a sibling of prisma/migrations/ so Prisma never auto-scans it). Write one reviewable .sql per logical step, named in order:',
  '001_industry_add_values.sql — nine ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS \'...\'; statements. Note in a comment: Postgres 15 (Supabase) allows ADD VALUE inside a transaction as long as the new value is not USED in the same transaction — which is the case here — so this is safe.',
  '002_contact_subindustry.sql — ALTER TABLE "Contact" ADD COLUMN "subIndustry" TEXT;',
  '003_task_tags_archive_reviewer.sql — ADD COLUMN dealId/contactId/archivedAt/reviewerId on "Task" + the three FK constraints + three indexes.',
  '004_milestone_drop_deal.sql — DESTRUCTIVE: drop the FK constraint then DROP COLUMN "dealId" on "Milestone". Add a prominent comment that this is the destructive step and is safe because no data references it.',
  '005_task_milestone_on_delete_setnull.sql — drop and re-add the Task->Milestone FK with ON DELETE SET NULL.',
  '006_action_draft.sql — CREATE TABLE "ActionDraft" with columns, FK constraints, and indexes.',
  'Also write prisma/_prepared-migrations/README.md: state these are PREPARED, NOT APPLIED; give the run order 001..006; note local prisma migrate hits the SAME live Supabase as prod; recommend the human review each .sql then apply via `npx prisma migrate dev` against the Direct URL (Prisma will generate equivalent SQL from the edited schema — confirm it matches before accepting), keeping 001 isolated if Prisma complains; call out 004 as the one destructive step.',
  '',
  'Verify your own work compiles conceptually but DO NOT run prisma migrate or any DB command.',
].join('\n')

const SCHEMA_VERIFY_PROMPT = [
  'You are an adversarial reviewer of a Prisma schema + prepared-migration change in c:/Users/jason/Desktop/Shift/shiftai-ops.',
  'Open prisma/schema.prisma, lib/types.ts, and every file under prisma/_prepared-migrations/ and check rigorously:',
  '1) Industry enum has exactly the 14 expected values, the 9 new ones carry no @map, and "other" remains.',
  '2) All Task additions (dealId, contactId, archivedAt, reviewerId) have matching relations + back-relations (Deal.tasks, Contact.tasks, Partner.reviewTasks) and indexes; the reviewer relation name "TaskReviewer" is consistent on both sides.',
  '3) Milestone.dealId AND its deal relation AND Deal.milestones back-relation are ALL removed together (no dangling relation referencing a dropped field — that fails prisma validate).',
  '4) Task.milestone has onDelete: SetNull and milestoneId is nullable.',
  '5) ActionDraft exists with all four nullable entity FKs + back-relations on Client/Deal/Contact/Project, and indexes.',
  '6) lib/types.ts matches the schema exactly (Industry union +9, Task type +4 fields, Milestone type -dealId).',
  '7) Prepared SQL: additive everywhere EXCEPT 004 (the documented destructive drop); enum ADD VALUEs are isolated in 001; README present and accurate.',
  '8) CRITICAL: confirm NO migration was applied — prisma/migrations/ has no new applied folder, and no DB command was run. The prepared SQL must live ONLY in prisma/_prepared-migrations/.',
  'Return ok=false with precise issues if any check fails (especially a dangling relation, a missing back-relation, an @map on a single-word value, or any sign a migration was actually applied).',
].join('\n')

// ============================================================================
// PHASE 2 — Core build prompts
// ============================================================================
const P1_INDUSTRIES = SHARED + '\n\n' + [
  '## YOUR PACKAGE: Industries (Tier-1 verticals + Tier-2 sub-industries, search/tag surfaces)',
  'Depends on the schema already being edited (Industry enum expanded, Contact.subIndustry added, lib/types.ts updated). Run npx prisma generate yourself first so the client types include the new fields.',
  '',
  'CREATE lib/industries.ts as the single source of truth:',
  '- The ordered Industry vertical list + industryLabels map (move/extend the existing industryLabels from lib/data/seed.ts and re-export from there for back-compat). Labels: Automotive, Motorsport, Engineering, Construction, Architecture, Real Estate & Property, Manufacturing, Heavy Equipment & Machinery, Distribution & Wholesale, Logistics & Transportation, Professional Services, Healthcare & Medical, Wineries & Beverage, Other.',
  '- verticalTier: a map vertical -> "primary" | "secondary" using the beachhead ranking in SHARED. Use it to sort verticals (primary first) in pickers and filters.',
  '- subIndustriesByVertical: the Tier-2 controlled vocabulary, and subIndustryLabels. Use these lists:',
  '  automotive: OEM & Vehicle Mfg, Parts & Suppliers (Tier 1/2), Dealership Groups, EV & Mobility, Aftermarket & Performance, Fleet & Vehicle Services.',
  '  motorsport: Racing Teams, Performance Engineering, Simulation & Telemetry, Specialty & Custom Vehicle, Track & Event Operations.',
  '  engineering: Engineering Services (civil/structural/mech), Product Design & Development, Robotics & Automation, Aerospace & Defense, Environmental & Surveying, Industrial Equipment.',
  '  construction: General Contracting, Heavy Civil & Infrastructure, Building Products & Materials, Specialty Trades, Construction Technology, Capital-Project Mgmt.',
  '  architecture: Architecture Firms, Interior Design, Urban Planning, Landscape Architecture, BIM & Design Tech.',
  '  real_estate: Commercial RE, Residential Development, Property Management, REITs & Investment, Facilities Management.',
  '  manufacturing: Industrial & Process Mfg, Metals & Fabrication, Plastics & Composites, Electronics & Electrical, Consumer Goods, Technology Hardware.',
  '  heavy_equipment: Equipment OEM, Dealers, Rental, Agricultural Machinery, Construction Machinery, Parts & Service.',
  '  distribution: Industrial Distribution, Building-Products Distribution, Auto-Parts Distribution, Food & Beverage Distribution, Petroleum & Fuel Distribution, Wholesale Trade.',
  '  logistics: Freight & Trucking, 3PL & Warehousing, Fleet Operations, Supply Chain, Marine & Rail, Last-Mile.',
  '  professional_services: Legal Services, Financial Services & Investment, Insurance, Accounting & Advisory, Management Consulting, Marketing & Creative.',
  '  healthcare: Medical Practices & Clinics, Dental Groups, Veterinary, Medical Devices, Long-Term Care, Pharma & Life Sciences, Health Tech.',
  '  beverage: Wineries, Breweries & Distilleries, Beverage Production, Vineyards & Agriculture, Hospitality & Tasting Rooms, Food Production.',
  '  other: (free text, no constrained sub list).',
  '- validateIndustry(value) and validateSubIndustry(vertical, value) helpers.',
  '',
  'REPLACE the duplicated VALID_INDUSTRIES whitelists by importing validateIndustry from lib/industries.ts in: app/(app)/contacts/actions.ts, app/(app)/clients/actions.ts, app/(app)/pipeline/actions.ts, app/(app)/pipeline/[id]/actions.ts, lib/ingest/apply.ts. Also replace the hardcoded INDUSTRIES const in components/deal-edit-modal.tsx, and update the guessIndustry() keyword regex in components/add-to-funnel-panel.tsx so free-text tags map onto the new verticals (e.g. legal/insurance/finance -> professional_services; warehouse/freight -> logistics; wholesale/distribution -> distribution; equipment/machinery -> heavy_equipment; winery/brewery -> beverage; clinic/medical -> healthcare; factory/manufactur -> manufacturing; architect -> architecture; property/realty -> real_estate; keep the existing four mappings).',
  '',
  'FORMS: add a dependent sub-industry <Select> (options = subIndustriesByVertical[chosenVertical], with an empty/none option) to components/add-contact.tsx, components/add-deal.tsx, components/add-client.tsx, components/deal-edit-modal.tsx, components/ingest/ingest-composer.tsx. Persist subIndustry through the matching server actions (extend their inputs).',
  '',
  'SEARCH/TAG SURFACES: on app/(app)/contacts/page.tsx, app/(app)/clients/page.tsx, and components/pipeline-board.tsx, render the sub-industry next to the existing industry badge, and add lightweight vertical + sub-industry filter chips (client-child component if state is needed; keep the page a server component). Align the free-text INDUSTRY_SUGGESTIONS in components/targeting-views.tsx to this new vocabulary.',
  '',
  'Update lib/data/seed.ts industryLabels (or re-export from lib/industries.ts). Optionally assign sub-industries to a few fixtures for demo realism, but do not change fixture industries in a way that breaks the seed guard.',
  'FILE OWNERSHIP NOTE: do not edit prisma/schema.prisma, lib/types.ts (already done), components/sidebar.tsx, components/actions-panel.tsx, components/ui.tsx, or any tasks/projects/how-it-works file — other packages own those.',
].join('\n')

const P2_TASKDATA = SHARED + '\n\n' + [
  '## YOUR PACKAGE: Task-board DATA LAYER (server actions only)',
  'Schema is already edited (Task has dealId/contactId/archivedAt/reviewerId; Milestone lost dealId; ActionDraft exists). Run npx prisma generate first.',
  '',
  'EDIT app/(app)/tasks/actions.ts:',
  '- createTask and updateTask: accept and persist dealId, contactId (task tagging 2b) and reviewerId (2h). Validate FKs exist. Keep the existing milestoneId handling (assign-to-milestone, 2a).',
  '- updateTaskStatus: it currently throws on any status outside the enum. Add two branches: when status is "archive", set archivedAt = now() (do NOT push an invalid enum value into status) — this enables 2g for tasks; when status is "in_review", accept an optional reviewerId arg, store it, and notifyPartner the reviewer (2h). Keep done/status sync intact.',
  '- NEW archiveTask(taskId) / unarchiveTask(taskId) mirroring setMilestoneArchived in app/(app)/projects/[id]/actions.ts.',
  '- NEW promoteTaskToMilestone(taskId): create a Milestone from the task (carry title/owner/category/project/client/dueDate), then either delete the task or convert it — choose the clean approach and re-point any relationship. (2a)',
  '- deleteTask already exists (2e) — leave it.',
  '',
  'EDIT app/(app)/projects/[id]/actions.ts:',
  '- createMilestone: remove the dealId param and write (milestones tag ONLY client/project now — 2c).',
  '- updateMilestone: allow re-scoping client/project (not deal).',
  '- NEW deleteMilestone(milestoneId): with M5 onDelete SetNull, child tasks survive as standalone tasks — confirm and document that in the action. (2e)',
  '- NEW demoteMilestoneToTask(milestoneId): create a Task from the milestone and remove the milestone (inverse of promote). (2a)',
  '- setMilestoneArchived and updateMilestoneBoardStatus already exist — leave as the reference pattern.',
  '',
  'Every new/changed mutation MUST follow the persistence recipe: partnerActor from session, $transaction with writeAudit (and writeActivity when feed-worthy), revalidatePath. Reuse notifyPartner for reviewer pings. Do not touch any .tsx in this package — UI is a separate package. Do not edit schema or types (done).',
].join('\n')

const P2_VERIFY = [
  'Adversarially verify the Task-board data-layer changes in app/(app)/tasks/actions.ts and app/(app)/projects/[id]/actions.ts.',
  'Check: (1) updateTaskStatus no longer throws on "archive" and correctly sets archivedAt instead of corrupting status; the in_review branch stores reviewerId and notifies; (2) createTask/updateTask validate and persist dealId/contactId/reviewerId; (3) createMilestone no longer references dealId anywhere (it was removed from schema — a lingering reference is a compile error); (4) new actions promoteTaskToMilestone/demoteMilestoneToTask/deleteMilestone/archiveTask/unarchiveTask each run inside a $transaction with writeAudit and a correct actor; (5) revalidatePath is called; (6) no new PrismaClient, singleton only. Return ok=false with specifics on any gap, especially a dangling dealId reference or a mutation missing its audit row.',
].join('\n')

const P5_PROJECTS = SHARED + '\n\n' + [
  '## YOUR PACKAGE: Projects tab (4a + 4b) — no new schema',
  'BMv2 RULE (critical): never hard-code the phase literal "run" and never branch on Project.phase in new code. Display engagement kind via projectType + the existing TYPE_LABELS from components/project-type-edit.tsx. (The run->operate rename is pending; phase is display-only.) Do NOT render any money (project value, installments, payouts, rate card) on these views — that would require managing-partner gating; keep it to dates/milestones/status/objectives.',
  '',
  'EDIT app/(app)/projects/page.tsx (list): for each project show a compact timeline with dots and the next 2 milestones. Reuse the EXISTING components/delivery-timeline.tsx (it already draws dots, a today-marker and tooltips from startDate/targetEndDate + a markers[] array) rather than building a new one. Next-2-milestones = project.milestones filtered to status !== "complete" AND dueDate != null AND dueDate >= today, sorted by dueDate asc, take 2 (MilestoneStatus comes back underscored; .replace("_","-") for display). Show projectType via TYPE_LABELS, not phase.',
  '',
  'EDIT app/(app)/projects/[id]/page.tsx (detail): surface the already-on-model-but-unrendered fields objectives, successMetrics[], clientLead (the Contact), and statusNote — tastefully, not crowding. Add a "[documents sent before project]" dropdown sourced GENERICALLY (Pilot Petroleum does not exist; build it for any promoted deal): prisma.artifact.findMany({ where: { clientId: project.clientId, dealId: { not: null } }, orderBy: { createdAt: "desc" } }) — these are the deal-stage docs that convertDeal repointed to the client but not the project. Render title + type + driveUrl + createdAt in the dropdown.',
  '',
  'Keep pages as server components; extract any stateful bit (the dropdown toggle) into a small client child. Do not edit schema, types, sidebar, or any tasks/actions/how-it-works file.',
].join('\n')

const P6_HOWITWORKS = SHARED + '\n\n' + [
  '## YOUR PACKAGE: How-it-works manual (change 5) — fold /deal-process in, then retire it',
  'Decision: grow /how-it-works into ONE rich, fun, visually appealing training manual, fold the animated racing-line track from components/deal-process-map.tsx into it, and retire the /deal-process route (keep the path as a redirect to /how-it-works).',
  '',
  'EDIT components/how-it-works-view.tsx (the client component holding the content): expand it into a guided training manual. Build ON the existing two tabs (How it is built; What happens when I do X) — do not delete them. Add: a "you are here" walkthrough of the firm phases; per-step WHY / what-to-do / how-it-works / what-everything-does panels with progressive disclosure (accordion or hover-expand) using the existing fade-rise keyframe in app/globals.css and the scale/shadow tricks already proven in deal-process-map.tsx. Fold the deal-process interactive STEPS track in as a section. Use only the brand tokens (bitumen/asphalt/graphite/track-gold/bone/diagnostic-steel) so it re-themes for light mode.',
  '',
  'ACCURACY: source step content ONLY from components/deal-process-map.tsx (STEPS goal/points/tools/walkIn/walkOut), skills/_firm/context.md (phases + voice rules: plain/direct, no banned jargon, no em dashes, no "not X but Y", never invent facts), the skills/*/SKILL.md files, lib/types.ts (real DealStage/ProjectPhase enums), and lib/data/updates.ts. Describe the CURRENT live model Discovery -> Build -> Run. DO NOT describe the un-applied Business Model v2 (no Operate/subscription rename in the prose).',
  '',
  'RETIRE /deal-process: turn app/(app)/deal-process/page.tsx into a redirect to /how-it-works. The sidebar deal-process entry is removed by the Task-UI package (it owns components/sidebar.tsx) — coordinate by NOT editing sidebar.tsx yourself; just leave a followup note that the sidebar link must drop /deal-process. You MAY keep components/deal-process-map.tsx as an imported module if you reuse its STEPS data.',
  '',
  'Keep app/(app)/how-it-works/page.tsx a server shell. Do not edit schema, types, sidebar, tasks, projects, or actions files.',
].join('\n')

// ============================================================================
// PHASE 3 — Risky UI & state prompts
// ============================================================================
const P3_TASKUI = SHARED + '\n\n' + [
  '## YOUR PACKAGE: Task-board UI + drag/scroll/archive/reviewer (2a,2b,2c,2d,2e,2f,2g,2h) — REGRESSION-SENSITIVE',
  'The board is components/tasks-board.tsx (one large client component; hand-rolled native HTML5 drag, no library). Server page app/(app)/tasks/page.tsx. The new server actions you call (archiveTask, promoteTaskToMilestone, demoteMilestoneToTask, deleteMilestone, reviewer arg on updateTaskStatus, dealId/contactId on create/update) are built by the Task-data package — write the UI against those signatures.',
  '',
  '2f DROP ZONE: columns have no min-height, so empty space below the cards is outside the droppable box (drops only register over cards / the Add-task button). Give the column wrapper (or its inner list) a tall min-height so the WHOLE column is a drop target. The onDragOver/onDrop handlers are already on the column wrapper and are correct — do not rewrite them, just enlarge the hit area. Add a column-level drag-over highlight (today only the footer affordance highlights, so a correct drop over empty space looks unresponsive).',
  '2f STICKY HEADERS: the headers already have sticky top-0 but there is no bounded-height scroll parent — the whole app scrolls on the document/body. Introduce a vertical scroll container SCOPED TO THE BOARD REGION ONLY (give the board its own min-h-0 + overflow-y-auto inside a height-constrained wrapper on the tasks page). DO NOT add overflow-hidden / h-screen to app/(app)/layout.tsx <main> or the shell — that affects every (app) route and risks clipping/double scrollbars site-wide. Verify other routes still scroll normally.',
  '2g ARCHIVE: the Archive column and setMilestoneArchived already work for milestones; relax the orphan-task guard (the early "if (status === \'archive\') return" for tasks) and call the new archiveTask action so tasks archive too. With the min-height fix the mostly-empty Archive column becomes a real drop target.',
  '2h IN REVIEW: when a card is dropped into In Review, open an obvious reviewer-picker modal (reuse ModalShell). CRITICAL: defer the optimistic move until the modal resolves (or revert cleanly on cancel) so a cancelled reviewer-tag does not leave the card visually moved. On confirm, fire the status change with reviewerId.',
  '2a ASSIGN/PROMOTE/DEMOTE: add a milestone picker to EditTaskModal (updateTask already accepts milestoneId) and add promote-to-milestone / demote-to-task controls on the task and milestone cards, calling the new actions.',
  '2b TASK TAGS: add project/deal/client/contact pickers to the create/edit task modals, persisting via the data-layer actions.',
  '2c MILESTONE TAGS: milestone scope pickers limited to client/project; remove any deal option from the milestone create/detail UI (components/milestone-detail-modal.tsx too).',
  '2e DELETE: add warn-before-delete controls on task cards and milestone cards. Reuse the existing confirm patterns (ModalShell discard guard or the two-click components/subtask-delete.tsx). Wire to deleteTask / the new deleteMilestone. For milestone delete, the warning should say child tasks are kept as standalone tasks.',
  '2d MENU: in components/sidebar.tsx, move the Task Board entry to 2nd in the operate array (immediately under Dashboard, above Pipeline/Projects) and style it bold + white via the existing emphasize -> font-semibold text-bone mechanism (text-bone is the near-white token). ALSO remove the /deal-process entry from the sidebar (it is being retired into How-it-works).',
  '',
  'Keep the page a server component; all state stays in the client board/modals. Do not edit schema, types, server actions, projects, actions-panel, or how-it-works files. Run npx prisma generate first so new field types resolve.',
].join('\n')

const P3_VERIFY = [
  'Adversarially verify the Task-board UI changes in components/tasks-board.tsx, components/milestone-detail-modal.tsx, app/(app)/tasks/page.tsx, and components/sidebar.tsx. Be a drag-and-drop skeptic.',
  'Check hard: (1) the new vertical scroll container is scoped to the board region — confirm app/(app)/layout.tsx <main> / shell did NOT get overflow-hidden or a global height cap (that would regress every route); (2) columns now have a min-height making the whole column droppable, and there is a column-level drag-over highlight; (3) tasks (not just milestones) can be dropped on Archive and call archiveTask; (4) the In Review reviewer modal defers/reverts the optimistic move on cancel — trace the onDrop path and confirm no card is left moved if the user cancels; (5) delete controls on tasks AND milestones have a warn-before-delete and call the right actions; (6) milestone UI no longer offers a deal scope; (7) sidebar: Task Board is 2nd, bold+white, and /deal-process is removed; (8) no untouched behavior (existing milestone board drag, optimistic refresh) regressed. Return ok=false with exact problems.',
].join('\n')

const P4_ACTIONS = SHARED + '\n\n' + [
  '## YOUR PACKAGE: Actions dropdowns — run-status (3a) + save-step-1 for all text-body actions (3b)',
  'ActionDraft exists in the schema. Run npx prisma generate first.',
  '',
  'SHARED COMPONENT components/actions-panel.tsx: add optional fields to ActionBox — skill?, ranAt? (Date), stepOneSavedAt? (Date). In Box(), render a GREEN border + the run date when ranAt is set (3a), and an ORANGE state + the label "step 1 of 2 saved" when stepOneSavedAt is set (3b). Add a new orange BadgeTone to components/ui.tsx (current tones are neutral|gold|steel|red|bone — there is no green or orange; add orange and use an existing greenish token like diagnostic-steel for the run state, or add a green token).',
  '',
  '3a RUN-STATUS: in the three host pages — app/(app)/pipeline/[id]/page.tsx (deal), app/(app)/clients/[id]/page.tsx (client), and the contact detail page — build a map of skill -> latest run date for that entity: prisma.artifact.findMany({ where: { <entityFk>, generatedFromSkill: { not: null } }, select: { generatedFromSkill, createdAt } }) reduced to the max createdAt per skill (the hasPrototype findFirst at pipeline/[id]/page.tsx is the existing precedent). For the Discovery Questionnaire, run-status comes from the DiscoverySurvey table, not Artifact — handle that case. Map each action box key to its real generatedFromSkill value (they differ — e.g. the box key "questionnaire" vs skill "discovery-questionnaire") and pass ranAt into the ActionBox list in components/deal-actions.tsx, components/client-header-actions.tsx, components/contact-actions.tsx.',
  '',
  '3b SAVE STEP 1 (all text-body two-step actions: discovery questionnaire, draft email, draft proposal, discovery report (client + deal), SOW, discovery prep, book meeting): in each modal (discovery-questionnaire-modal, draft-email-modal, draft-proposal-modal, discovery-report-modal, discovery-report-deal-modal, sow-modal, deal-doc-modal) add a "Save draft" action on the step-1 editable view that writes the current editable content to an ActionDraft row (skill = the action skill, content = the editable payload, status = "draft", entity FK set), turning the action box ORANGE with "step 1 of 2 saved". Clicking the orange box reopens the editor preloaded from the saved ActionDraft with the same options (Save / Cancel / Proceed). Clicking OUT of the editor AUTO-SAVES (write/refresh the ActionDraft). Proceeding to step 2 consumes the saved content and then the draft can be cleared or marked consumed. Route the questionnaire through ActionDraft too (its existing step-2 createDiscoveryQuestionnaireForm should read the saved content).',
  '',
  'NEW server actions (in the matching actions.ts files) for ActionDraft: saveActionDraft({ skill, entityFk, content }) (upsert the latest draft per entity+skill), getActionDraft(entityFk, skill), clearActionDraft(id). Each follows the persistence recipe (partnerActor, $transaction, writeAudit). Do NOT touch the task board, projects, sidebar, schema, or types. Projects has no Actions panel — out of scope.',
].join('\n')

const P4_VERIFY = [
  'Adversarially verify the Actions run-status + save-step-1 changes.',
  'Check: (1) the green "ran on DATE" state derives from real Artifact (and DiscoverySurvey for the questionnaire) queries per entity+skill, and the action-key -> generatedFromSkill mapping is correct (mismatched keys would show wrong/empty status); (2) the orange "step 1 of 2 saved" reflects a real ActionDraft row; (3) save / reopen-preloaded / click-out-autosave / proceed-consumes-draft all round-trip through ActionDraft, and saveActionDraft is an UPSERT (not duplicate rows piling up per click); (4) every ActionDraft mutation writes an audit row with a correct actor and runs in a $transaction; (5) the new orange/green tones exist in ui.tsx and the panel branches on them; (6) no regression to the existing one-shot generate->save modal flows. Return ok=false with specifics, especially a wrong skill mapping or drafts that duplicate instead of upsert.',
].join('\n')

// ============================================================================
// PHASE 4 — Finalize
// ============================================================================
const FINALIZE_PROMPT = SHARED + '\n\n' + [
  '## YOUR PACKAGE: Finalize (push-checklist prep — but DO NOT push or migrate)',
  '1) lib/data/updates.ts: add dated entries (date "2026-06-12", newest first at the TOP of the array; tag one of new|improved|fixed; plain English, no jargon, no banned words) for each partner-visible change: expanded industry list with sub-industries + filters; task board (assign/promote milestones, tag deals & contacts, delete, fixed drag over whole column, sticky columns, archive tasks, tag a reviewer on In Review, Task Board moved up the menu); Actions now show when they last ran and let you save step 1 of a two-step action to finish later; richer Projects view with timeline + next milestones + pre-project documents; the new How-it-works training manual.',
  '2) Run npx prisma generate, then npx tsc --noEmit, then npm run build. Fix any type or build errors introduced anywhere in the changeset (you may edit any file to fix). Common expected fixes: lib/types.ts drift, a missing import from lib/industries.ts, an action signature mismatch between the UI and data packages, a lingering Milestone.dealId reference. Re-run until tsc and build are clean.',
  '3) Confirm (do not change) that no view renders firm economics (project value/installments/payouts/rates) — if any slipped in, gate it with currentIsManagingPartner()/requireManagingPartner() or remove it. Confirm app/(app)/layout.tsx still has force-dynamic and no global overflow/height cap was added.',
  'EXPECTED END STATE: code compiles and builds against the edited schema (prisma generate uses schema.prisma, not the DB, and force-dynamic means no DB at build), while the migrations remain UNAPPLIED in prisma/_prepared-migrations/. Do not run prisma migrate, do not commit, do not push. Summarize what is left for the human (run the 6 prepared migrations in order, then push).',
].join('\n')

// ============================================================================
// Orchestration
// ============================================================================
log('Starting ops changeset. Migrations are PREPARED ONLY — nothing will be applied to the database.')

phase('Schema & migrations')
const schema = await buildAndVerify({
  label: 'schema+migrations',
  phaseTitle: 'Schema & migrations',
  implementPrompt: SCHEMA_PROMPT,
  verifyPrompt: SCHEMA_VERIFY_PROMPT,
})

phase('Core build')
const core = await parallel([
  () => buildAndVerify({ label: 'industries', phaseTitle: 'Core build', implementPrompt: P1_INDUSTRIES }),
  () => buildAndVerify({ label: 'task-data', phaseTitle: 'Core build', implementPrompt: P2_TASKDATA, verifyPrompt: P2_VERIFY }),
  () => buildAndVerify({ label: 'projects', phaseTitle: 'Core build', implementPrompt: P5_PROJECTS }),
  () => buildAndVerify({ label: 'how-it-works', phaseTitle: 'Core build', implementPrompt: P6_HOWITWORKS }),
])

phase('Risky UI & state')
const risky = await parallel([
  () => buildAndVerify({ label: 'task-ui', phaseTitle: 'Risky UI & state', implementPrompt: P3_TASKUI, verifyPrompt: P3_VERIFY }),
  () => buildAndVerify({ label: 'actions', phaseTitle: 'Risky UI & state', implementPrompt: P4_ACTIONS, verifyPrompt: P4_VERIFY }),
])

phase('Finalize')
const finalize = await agent(FINALIZE_PROMPT, { label: 'finalize', phase: 'Finalize', model: 'opus', schema: IMPLEMENT_RESULT })

log('Done. REVIEW prisma/_prepared-migrations/ and run the 6 migrations in order (001..006) against the Direct URL before pushing.')

return {
  schema,
  core,
  risky,
  finalize,
  migrationsPrepared: 'prisma/_prepared-migrations/ (001..006) — REVIEW AND RUN MANUALLY, IN ORDER. 004 is the one destructive drop. Nothing was applied.',
  pushChecklist: 'updates.ts done in Finalize; How-it-works updated; no economics surfaced (no gating needed); run prisma migrate, then tsc/build, then push.',
}
