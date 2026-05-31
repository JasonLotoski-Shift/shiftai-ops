import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui";
import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  // If already signed in, skip the page entirely.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-bitumen flex">
      {/* Left side — brand block */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] p-16 relative overflow-hidden">
        <div>
          <Wordmark size="md" />
        </div>

        <div className="flex flex-col gap-8 max-w-[640px]">
          <span className="label">Internal · ops tool</span>
          <h1 className="display-lg text-bone">
            THE OPERATING<br />SYSTEM OF<br />
            <span className="text-track-gold">THE FIRM.</span>
          </h1>
          <p className="text-[16px] text-bone-dim max-w-[480px] leading-relaxed">
            Pipeline, contracts, projects, deliverables — all in one system. Built custom,
            run on AI, connected end to end. The same thing we build for our clients,
            we run on ourselves first.
          </p>
        </div>

        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-1">
            <span className="label">Edition</span>
            <span className="mono text-[13px] text-bone-dim">01 · 2026.05</span>
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className="label">Status</span>
            <span className="mono text-[13px] text-track-gold">DEV</span>
          </div>
        </div>
      </div>

      {/* Right side — sign-in */}
      <div className="flex-1 flex flex-col justify-center px-12 lg:px-20 max-w-[560px]">
        <div className="flex flex-col gap-10 bg-asphalt rounded-lg shadow-sm p-8">
          <div className="lg:hidden">
            <Wordmark size="sm" />
          </div>

          <div className="flex flex-col gap-3">
            <span className="label">Sign in</span>
            <h2 className="display-md text-bone">Welcome back.</h2>
          </div>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
            className="flex flex-col gap-5"
          >
            <Button type="submit" size="lg" className="w-full">
              Continue with Google Workspace
            </Button>
          </form>

          <div className="pt-8 flex flex-col gap-2">
            <span className="label">Access</span>
            <p className="text-[12px] text-bone-mute leading-relaxed max-w-[420px]">
              Sign-in is restricted to <code className="mono text-bone-dim">@shiftai.partners</code> Google
              Workspace accounts. If you sign in with a different account, Google
              will refuse the request.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
