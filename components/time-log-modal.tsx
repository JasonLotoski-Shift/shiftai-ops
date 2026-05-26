"use client";

import { useState } from "react";
import { X, Clock } from "lucide-react";
import { Button, Input, Textarea, Label } from "@/components/ui";
import { projects, clientById } from "@/lib/data/seed";
import { cn } from "@/lib/cn";

/**
 * The 15-second time log flow. Accessible from anywhere via the header button.
 * Prototype: doesn't persist; just demonstrates the flow.
 */
export function TimeLogModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function reset() {
    setHours("");
    setDescription("");
    setSubmitted(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      reset();
      onClose();
    }, 900);
  }

  if (!open) return null;

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
              {hours}h to {projects.find((p) => p.id === projectId)?.name}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-5">
            {/* Project picker */}
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={cn(
                  "h-9 px-3 bg-bitumen border border-graphite text-bone text-[14px]",
                  "focus:border-track-gold focus:outline-none",
                )}
              >
                {projects
                  .filter((p) => p.status !== "closed")
                  .map((p) => {
                    const client = clientById(p.clientId);
                    return (
                      <option key={p.id} value={p.id}>
                        {client?.company} — {p.name.split("·")[1]?.trim() ?? p.name}
                      </option>
                    );
                  })}
              </select>
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

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <span className="label text-[10px]">
                ⏎ to log · esc to cancel
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={!hours || !description}>
                  Log {hours || "0"}h
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
