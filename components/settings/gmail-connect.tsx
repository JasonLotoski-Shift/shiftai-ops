"use client";

// Per-partner "Connect Gmail" card on Settings. Connect → consent → the callback
// stores an encrypted refresh token; the poller logs threads you label. The
// status banner is driven by ?gmail=connected|error (passed from the server
// page, so no useSearchParams / Suspense needed).

import { useTransition, useState } from "react";
import { Mail, Check, ShieldAlert, Info, Tag, Clock, Lock } from "lucide-react";
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
  const [howOpen, setHowOpen] = useState(false);

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
        <div className="flex items-center gap-2">
          <h2 className="title-md">Email logging</h2>
          <button
            type="button"
            onClick={() => setHowOpen((o) => !o)}
            aria-expanded={howOpen}
            aria-label="How email logging works"
            className="text-bone-mute hover:text-bone transition-colors shrink-0"
          >
            <Info size={14} strokeWidth={1.5} />
          </button>
        </div>
        <span className="text-[11px] text-bone-mute">
          Connect your Gmail so any thread you label <span className="text-bone">{label}</span> is logged to the
          matching client — for review on Ingest. Read-only; only labeled threads are ever read.
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-4 pt-0">
        {howOpen && (
          <div className="rounded-[var(--radius)] border border-edge bg-bitumen px-4 py-3.5 flex flex-col gap-3">
            <span className="label text-[10px]">How to set it up</span>
            <ol className="flex flex-col gap-2 text-[12px] text-bone-dim list-none">
              <li className="flex gap-2.5">
                <span className="mono text-track-gold shrink-0">1.</span>
                <span>
                  In Gmail, make a label called <span className="text-bone">{label}</span> — Settings → See all settings →
                  Labels → Create new label. (Type it exactly; it&apos;s case-insensitive.)
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mono text-track-gold shrink-0">2.</span>
                <span>
                  Click <span className="text-bone">Connect Gmail</span> below and grant read access on Google&apos;s screen.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mono text-track-gold shrink-0">3.</span>
                <span>
                  On any client email thread, apply the <span className="text-bone">{label}</span> label (the label
                  dropdown in Gmail&apos;s toolbar). That&apos;s the only signal we watch.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mono text-track-gold shrink-0">4.</span>
                <span>
                  Once an hour we check for newly labeled threads and drop them on <span className="text-bone">Ingest</span>{" "}
                  for you to review and approve. Nothing is logged until you approve it.
                </span>
              </li>
            </ol>
            <div className="flex flex-col gap-1.5 border-t border-edge pt-3 text-[11px] text-bone-mute">
              <span className="flex items-start gap-2">
                <Tag size={12} strokeWidth={1.5} className="text-bone-dim mt-0.5 shrink-0" />
                We only ever read threads carrying the <span className="text-bone">{label}</span> label — never your whole inbox.
              </span>
              <span className="flex items-start gap-2">
                <Clock size={12} strokeWidth={1.5} className="text-bone-dim mt-0.5 shrink-0" />
                The check runs hourly, on the hour — not in real time, so a labeled thread may take up to an hour to appear.
              </span>
              <span className="flex items-start gap-2">
                <Lock size={12} strokeWidth={1.5} className="text-bone-dim mt-0.5 shrink-0" />
                Read-only access. We can&apos;t send, change, or delete anything in your mail. Disconnect anytime below.
              </span>
            </div>
          </div>
        )}

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
