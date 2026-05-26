"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/wordmark";
import { Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("jason@lotoski.co");

  function signIn() {
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-bitumen flex">
      {/* Left side — brand block */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] p-16 border-r border-graphite relative overflow-hidden">
        <div>
          <Wordmark size="md" />
        </div>

        <div className="flex flex-col gap-8 max-w-[640px]">
          <span className="label">— Internal · v1.0 prototype</span>
          <h1 className="display-lg text-bone">
            THE OPERATING<br />SYSTEM OF<br />
            <span className="text-track-gold">THE FIRM.</span>
          </h1>
          <p className="text-[16px] text-bone-dim max-w-[480px] leading-relaxed">
            Pipeline, contracts, projects, hours — all in one system. Built custom,
            run on AI, connected end to end. The same thing we build for our clients,
            we run on ourselves first.
          </p>
        </div>

        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-1">
            <span className="label">— Edition</span>
            <span className="mono text-[13px] text-bone-dim">01 · 2026.05</span>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className="label">— Status</span>
            <span className="mono text-[13px] text-track-gold">PROTOTYPE</span>
          </div>
        </div>
      </div>

      {/* Right side — sign-in */}
      <div className="flex-1 flex flex-col justify-center px-12 lg:px-20 max-w-[560px]">
        <div className="flex flex-col gap-10">
          <div className="lg:hidden">
            <Wordmark size="sm" />
          </div>

          <div className="flex flex-col gap-3">
            <span className="label">— Sign in</span>
            <h2 className="display-md text-bone">Welcome back.</h2>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
            }}
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@lotoski.co"
                required
              />
            </div>

            <Button type="submit" size="lg" className="w-full">
              Continue with Google Workspace
            </Button>

            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 border-t border-graphite" />
              <span className="label text-[9px]">Or</span>
              <div className="flex-1 border-t border-graphite" />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={signIn}
            >
              Enter prototype with seed data
            </Button>
          </form>

          <div className="pt-8 border-t border-graphite flex flex-col gap-2">
            <span className="label">— Note</span>
            <p className="text-[12px] text-bone-mute leading-relaxed max-w-[420px]">
              This is a UI/UX prototype with fake data. No real authentication, no real records.
              See <code className="mono text-bone-dim">ops-tool/WorkspacePlan.md</code> for context.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
