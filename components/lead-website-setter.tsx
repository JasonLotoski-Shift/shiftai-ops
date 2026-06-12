"use client";

// Shown on a lead when there's no real domain (Apollo couldn't resolve a small
// company from its name). Paste the website → it's stored with the derived domain
// so Enrich and Find more people have something to work against.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, ShieldAlert } from "lucide-react";
import { Card, Button, Input, Label } from "@/components/ui";
import { setLeadWebsite } from "@/app/(app)/pipeline/leads/actions";

export function LeadWebsiteSetter({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    startTransition(async () => {
      try {
        await setLeadWebsite(leadId, value.trim());
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save the website");
      }
    });
  }

  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Globe size={14} strokeWidth={1.5} className="text-track-gold" />
        <Label gold>No website on file</Label>
      </div>
      <p className="text-[12px] text-bone-mute leading-relaxed">
        Apollo couldn&apos;t find this company by name (common for smaller firms). Add its website and Enrich +
        Find more people will have a real domain to work with.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="acme.com"
          className="h-8 flex-1"
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) save();
          }}
        />
        <Button variant="primary" size="sm" onClick={save} disabled={pending || !value.trim()}>
          {pending ? "Saving…" : "Save website"}
        </Button>
      </div>
      {err && (
        <span className="flex items-center gap-1 text-[11px] text-flag-red">
          <ShieldAlert size={11} strokeWidth={1.5} />
          {err}
        </span>
      )}
    </Card>
  );
}
