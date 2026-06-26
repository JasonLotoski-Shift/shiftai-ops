"use client";

import { useState, useTransition } from "react";
import { Card, CardBody, Button, Badge, Textarea } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { saveMemoryBlock, approveMemoryBlock } from "@/app/(app)/firm-knowledge/memory/actions";
import type { MemoryBlockKey } from "@/lib/generated/prisma/enums";
import { Check, Clock, ShieldCheck } from "lucide-react";

export type MemoryBlockItem = {
  key: MemoryBlockKey;
  label: string;
  description: string;
  draftBody: string;
  approvedBody: string | null;
  asOf: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
};

// Soft guidance: recent-memory blocks stay small so they're cheap to keep in
// every prompt. ~1500 tokens ≈ ~6000 chars.
const SOFT_CHAR_LIMIT = 6000;

export function MemoryEditor({ items }: { items: MemoryBlockItem[] }) {
  return (
    <div className="flex flex-col gap-6">
      {items.map((b) => (
        <BlockCard key={b.key} block={b} />
      ))}
    </div>
  );
}

function BlockCard({ block }: { block: MemoryBlockItem }) {
  const [body, setBody] = useState(block.draftBody);
  const [pending, startTransition] = useTransition();

  const approved = block.approvedBody ?? "";
  const dirty = body !== block.draftBody; // unsaved draft edits
  const matchesApproved = body === approved; // what skills currently read
  const overLimit = body.length > SOFT_CHAR_LIMIT;
  const isApproved = !!block.approvedBody && block.approvedBody.trim().length > 0;

  const onSave = () =>
    startTransition(async () => {
      await saveMemoryBlock(block.key, body);
    });

  const onApprove = () =>
    startTransition(async () => {
      // Capture exactly what's on screen, then promote it into AI context.
      await saveMemoryBlock(block.key, body);
      await approveMemoryBlock(block.key);
    });

  return (
    <Card>
      <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="title-md text-bone">{block.label}</span>
          <span className="text-[12px] text-bone-mute">{block.description}</span>
        </div>
        <div className="shrink-0">
          {!matchesApproved ? (
            <Badge tone="orange" className="gap-1">
              <Clock size={11} strokeWidth={1.5} />
              Pending approval
            </Badge>
          ) : isApproved ? (
            <Badge tone="green" className="gap-1">
              <Check size={11} strokeWidth={1.5} />
              Live in AI context
            </Badge>
          ) : (
            <Badge tone="neutral">Empty</Badge>
          )}
        </div>
      </div>

      <CardBody className="flex flex-col gap-3 pt-0">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="A few short lines — the things that changed and where they stand."
          disabled={pending}
        />

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-bone-mute">
            {isApproved && block.asOf ? (
              <>
                Approved {formatDate(block.asOf)}
                {block.approvedByName ? ` · ${block.approvedByName}` : ""}
              </>
            ) : (
              "Not yet approved — skills don't see this block."
            )}
            <span className={overLimit ? "text-signal-warming ml-2" : "text-bone-mute ml-2"}>
              {body.length}/{SOFT_CHAR_LIMIT}
            </span>
          </span>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onSave} disabled={pending || !dirty}>
              Save draft
            </Button>
            <Button size="sm" onClick={onApprove} disabled={pending || matchesApproved} className="gap-1.5">
              <ShieldCheck size={13} strokeWidth={1.5} />
              Approve
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
