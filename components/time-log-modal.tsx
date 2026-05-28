"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Clock, ShieldAlert } from "lucide-react";
import { Button, Input, Textarea, Label } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  getActiveProjectsForHours,
  logHours,
} from "@/app/(app)/projects/actions";

type ProjectOption = { id: string; name: string; company: string };

/**
 * The 15-second time log flow. Accessible from anywhere via the header button.
 * Fetches active projects via a server action on open so the modal doesn't
 * require every Header caller to pass projects down.
 */
export function TimeLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [projectsErr, setProjectsErr] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load active projects when the modal opens. Re-fetch each open so a freshly
  // converted deal shows up without a page reload.
  useEffect(() => {
    if (!open) return;
    setProjects(null);
    setProjectsErr(null);
    getActiveProjectsForHours()
      .then((rows) => {
        setProjects(rows);
        setProjectId((cur) => cur || rows[0]?.id || "");
      })
      .catch((err: unknown) => {
        setProjectsErr(err instanceof Error ? err.message : "Failed to load projects");
      });
  }, [open]);

  function reset() {
    setHours("");
    setDescription("");
    setSubmitted(false);
    setSubmitErr(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr(null);
    const parsedHours = Number(hours);
    startTransition(async () => {
      try {
        await logHours({
          projectId,
          hours: parsedHours,
          description,
        });
        setSubmitted(true);
        setTimeout(() => {
          reset();
          onClose();
        }, 900);
      } catch (err) {
        setSubmitErr(err instanceof Error ? err.message : "Failed to log hours");
      }
    });
  }

  if (!open) return null;

  const selectedProject = projects?.find((p) => p.id === projectId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-bitumen/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-asphalt border border-graphite"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-graphite">
          <div className="flex items-center gap-3">
            <Clock size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>— Log hours</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {submitted ? (
          <div className="px-5 py-12 text-center">
            <div className="display-md text-track-gold mb-2 inline-block">LOGGED</div>
            <p className="text-[13px] text-bone-dim">
              {hours}h to {selectedProject?.company}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-5">
            {/* Project picker */}
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              {projects === null && !projectsErr && (
                <span className="text-[12px] text-bone-mute">Loading projects…</span>
              )}
              {projectsErr && (
                <span className="text-[12px] text-flag-red">{projectsErr}</span>
              )}
              {projects && projects.length === 0 && (
                <span className="text-[12px] text-bone-mute">
                  No active projects yet — convert a deal first.
                </span>
              )}
              {projects && projects.length > 0 && (
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={cn(
                    "h-9 px-3 bg-bitumen border border-graphite text-bone text-[14px]",
                    "focus:border-track-gold focus:outline-none",
                  )}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.company} — {p.name.split("·")[1]?.trim() ?? p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Hours */}
            <div className="flex flex-col gap-2">
              <Label>Hours</Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                placeholder="2.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label>What did you do?</Label>
              <Textarea
                rows={3}
                placeholder="e.g. Operator interviews — dispatcher shift"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            {submitErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{submitErr}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <span className="label text-[10px]">
                ⏎ to log · esc to cancel
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!projectId || !hours || !description || isPending}
                >
                  {isPending ? "Logging…" : `Log ${hours || "0"}h`}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
