// Phase A proof: run one build⇄critique loop locally against a hardcoded brief.
// No Home, no Drive, no DB — just prove the agent builds, sees, critiques, rebuilds, and halts.
// Run: npm run worker:dev-run
import "dotenv/config";
import { runBuild } from "./loop";

const SAMPLE = {
  client: "Cascade Mechanical (illustrative)",
  industry: "Commercial HVAC / mechanical field service",
  brief: `
## The problem
Dispatch lives in a whiteboard and a group text. The dispatcher cannot see, at a glance, which jobs
are at risk of missing their SLA window, who is free, or who is closest. Techs get double-booked and
emergency calls slip. The owner wants one board that shows the day and lets dispatch reassign a job
in one move.

## User stories
- As a dispatcher, I want to see every job for today by status and SLA risk, so that I act on the at-risk ones first.
- As a dispatcher, I want to assign or reassign a tech to a job in one click, so that I stop double-booking.
- As a dispatcher, I want a job's detail (site, equipment, history, parts) in a side panel, so that I brief the tech without a phone call.
- As an owner, I want to see techs' load and utilization for the day, so that I know if we are over capacity.

## Key features discussed
- Live dispatch board grouped by status (Unassigned, En route, On site, Done) with an SLA-risk badge per job.
- One-click assign/reassign from a tech list; the SLA-risk badge recolors when a job gets a tech and an ETA.
- Job detail panel: site, equipment, service history, parts needed, contact.
- A simple per-tech utilization strip (jobs assigned vs capacity).

## Tabs / sections
1. **Dispatch Board** — today's jobs in columns by status; each card shows site, window, and SLA-risk badge. The working view.
2. **Job Detail** — the selected job: site/equipment/history/parts, and the assign-tech control.

## The interaction to simulate
Click an unassigned job → the Job Detail panel opens → pick a tech → the job moves to "En route", gets an ETA, and its SLA-risk badge recolors from red to green. One clear, working interaction.

## Sample data
Jobs: { id, site name, address, equipment (RTU / chiller / boiler / split), window (e.g. 1–3pm), status, assigned tech, SLA risk (high/med/low) }. 10–14 jobs across the four statuses. Techs: 5–6 with names, current load, skill tags. Clearly illustrative, never real data.

## The "after" picture
The board with three at-risk jobs in red, the dispatcher assigns one, and it flips to green with an ETA. The buyer sees the day get calmer in one click.

## Brand direction
[Shift Edition-06 fallback]
`.trim(),
};

runBuild(SAMPLE)
  .then((r) => {
    console.log("\n=== BUILD COMPLETE ===");
    console.log("runDir:    ", r.runDir);
    console.log("prototype: ", r.prototypePath);
    console.log("rounds:    ", r.rounds, " finalScore:", r.finalScore);
    console.table(
      r.gateHistory.map((h) => ({
        round: h.round,
        overall: h.overall,
        structure: h.structure,
        fidelity: h.fidelity,
        design: h.design,
        interactivity: h.interactivity,
        summary: h.summary.slice(0, 60),
      }))
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("\n=== BUILD FAILED ===");
    console.error(e);
    process.exit(1);
  });
