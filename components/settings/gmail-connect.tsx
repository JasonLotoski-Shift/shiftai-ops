"use client";

// Per-partner "Connect Gmail" card on Settings. Connect → consent → the callback
// stores an encrypted refresh token; the poller logs threads you label. The
// status banner is driven by ?gmail=connected|error (passed from the server
// page, so no useSearchParams / Suspense needed).

import { useTransition, useState } from "react";
import { Mail, Check, ShieldAlert } from "lucide-react";
import { Card, CardHeader, CardBody, Button } from "@/components/ui";
import { startGmailConnect, disconnectGmail } from "@/app/(app)/settings/gmail-actions";

export function GmailConnect({
  connected,
  email,
  label,
  statusFlag,
}: {
  connected: boolean;
  email: string | null;
  label: string;
  statusFlag: string | null;
}) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function connect() {
    setErr(null);
    start(async () => {
      try {
        window.location.href = await startGmailConnect();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't start the Gmail connect.");
      }
    });
  }

  function disconnect() {
    setErr(null);
    start(async () => {
      try {
        await disconnectGmail();
        window.location.assign("/settings");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't disconnect.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-0.5">
        <h2 className="title-md">Email logging</h2>
        <span className="text-[11px] text-bone-mute">
          Connect your Gmail so any thread you label <span className="text-bone">{label}</span> is logged to the
          matching client — for review on Ingest. Read-only; only labeled threads are ever read.
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-4 pt-0">
        {statusFlag === "connected" && (
          <Banner ok>Gmail connected. Label client threads <span className="text-bone">{label}</span> and they&apos;ll appear on Ingest.</Banner>
        )}
        {statusFlag === "error" && (
          <Banner>Couldn&apos;t connect Gmail — try again, and be sure to grant read access.</Banner>
        )}
        {err && <Banner>{err}</Banner>}

        {connected ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[13px] text-bone-dim">
              <Check size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
              Connected as <span className="text-bone">{email}</span>
            </div>
            <Button variant="ghost" size="sm" disabled={busy} onClick={disconnect}>
              {busy ? "Working…" : "Disconnect"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-bone-dim">Not connected.</span>
            <Button variant="primary" size="sm" disabled={busy} onClick={connect}>
              <Mail size={13} strokeWidth={1.5} />
              {busy ? "Starting…" : "Connect Gmail"}
            </Button>
          </div>
        )}

        <p className="text-[11px] text-bone-mute leading-snug">
          We never read your whole inbox — only threads you tag <span className="text-bone">{label}</span>. Logging is
          review-first: every email becomes a pending item on Ingest that you approve. Disconnect anytime.
        </p>
      </CardBody>
    </Card>
  );
}

function Banner({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded-[var(--radius)] border ${
        ok ? "border-track-gold/40 bg-track-gold/5" : "border-flag-red/40 bg-flag-red/5"
      }`}
    >
      {ok ? (
        <Check size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
      ) : (
        <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
      )}
      <span className="text-[12px] text-bone-dim">{children}</span>
    </div>
  );
}
