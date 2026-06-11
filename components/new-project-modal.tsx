"use client";

// "+ New project" — create a project on an existing client.
//
// One engagement = one project (Business model v2), so this is how a follow-on
// subscription or buy-out gets opened against a client. The value field relabels
// by type (monthly price for a subscription, lump sum for a buy-out), and on
// create the right billing schedule is generated automatically. Self-contained:
// exports the trigger Button + the modal together.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, X, ShieldAlert } from "lucide-react";
import { Button, Label, Input, Select, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { TYPE_LABELS } from "@/components/project-type-edit";
import { createProject } from "@/app/(app)/clients/[id]/project-actions";

const TYPE_ORDER = ["discovery_report", "pilot_project", "subscription", "full_build", "buyout"] as const;

function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function plusMonthsLocal(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function valueLabel(type: string) {
  if (type === "subscription") return "Monthly price (CAD)";
  if (type === "buyout") return "Buy-out amount (CAD)";
  return "Project value (CAD)";
}
function valueHint(type: string) {
  if (type === "subscription") return "Billed month-by-month — this is the recurring monthly amount.";
  if (type === "buyout") return "One-time lump sum (e.g. 24× the monthly price, or a set fee).";
  return "Bills 50% on signing / 25% mid / 25% on delivery.";
}

export function NewProjectButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [projectType, setProjectType] = useState<string>("subscription");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState(todayLocal);
  const [targetEndDate, setTargetEndDate] = useState(() => plusMonthsLocal(3));
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setProjectType("subscription");
    setName("");
    setValue("");
    setStartDate(todayLocal());
    setTargetEndDate(plusMonthsLocal(3));
    setDescription("");
    setError(null);
  }
  function close() {
    setOpen(false);
    reset();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await createProject(clientId, {
          name,
          projectType,
          budgetFee: Number(value || 0),
          startDate,
          targetEndDate,
          description: description || undefined,
        });
        close();
        router.push(`/projects/${res.projectId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't create the project");
      }
    });
  }

  const valid = name.trim() !== "" && value !== "" && Number(value) >= 0;

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <FolderPlus size={13} strokeWidth={1.5} />
        New project
      </Button>

      {open && (
        <ModalShell onClose={close}>
          <div
            className="w-full max-w-[560px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-16"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <FolderPlus size={14} strokeWidth={1.5} className="text-track-gold" />
                <Label gold>New project</Label>
              </div>
              <button onClick={close} className="text-bone-mute hover:text-bone">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Type</Label>
                  <Select value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                    {TYPE_ORDER.map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. Ops platform — subscription"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{valueLabel(projectType)}</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  className="tabular-nums"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <span className="text-[11px] text-bone-mute">{valueHint(projectType)}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Start</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Target end</Label>
                  <Input type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Scope (optional)</Label>
                <Textarea
                  rows={3}
                  placeholder="What this engagement covers."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                  <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                  <span className="text-[12px] text-bone-dim">{error}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 flex justify-end gap-2">
              <Button variant="ghost" size="md" onClick={close}>Cancel</Button>
              <Button variant="primary" size="md" onClick={submit} disabled={isPending || !valid}>
                {isPending ? "Creating…" : "Create project"}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
