"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  Briefcase,
  FolderKanban,
  Receipt,
  Library,
  Settings,
  Bot,
  BookOpen,
  CheckSquare,
  MessageSquare,
  FileInput,
  Sparkles,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Sigil } from "@/components/wordmark";
import { logout } from "@/app/(app)/account.actions";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/clients", label: "Clients", icon: Briefcase },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/ingest", label: "Meeting ingest", icon: FileInput },
  { href: "/invoices", label: "Invoices", icon: Receipt },
];

const reference = [
  { href: "/whats-new", label: "What's new", icon: Sparkles },
  { href: "/how-it-works", label: "How it works", icon: BookOpen },
];

const secondary = [
  { href: "/library", label: "Library", icon: Library, disabled: true },
  { href: "/agents", label: "Agents", icon: Bot, disabled: false },
  { href: "/settings", label: "Settings", icon: Settings, disabled: true },
];

type SidebarUser = { name: string; initials: string; role: string };

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] shrink-0 bg-bitumen border-r border-graphite flex flex-col">
      {/* Wordmark / brand block */}
      <div className="px-5 py-6 border-b border-graphite">
        <Link href="/dashboard" className="inline-flex items-center gap-3">
          <Sigil size={28} />
          <span className="label">Ops · v1.0</span>
        </Link>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 py-4">
        <div className="px-5 pb-2">
          <span className="label">— Operate</span>
        </div>
        <ul>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-5 py-2.5 text-[13px] transition-colors",
                    "border-l-2",
                    active
                      ? "bg-asphalt text-bone border-track-gold"
                      : "text-bone-dim border-transparent hover:text-bone hover:bg-asphalt/60",
                  )}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="px-5 pb-2 pt-6">
          <span className="label">— Reference</span>
        </div>
        <ul>
          {reference.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-5 py-2.5 text-[13px] transition-colors",
                    "border-l-2",
                    active
                      ? "bg-asphalt text-bone border-track-gold"
                      : "text-bone-dim border-transparent hover:text-bone hover:bg-asphalt/60",
                  )}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="px-5 pb-2 pt-6">
          <span className="label">— Firm</span>
        </div>
        <ul>
          {secondary.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <li key={item.href}>
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]",
                      "border-l-2 border-transparent text-bone-mute cursor-not-allowed",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={15} strokeWidth={1.5} />
                      <span>{item.label}</span>
                    </span>
                    <span className="label text-[9px]">Soon</span>
                  </div>
                </li>
              );
            }
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-5 py-2.5 text-[13px] transition-colors",
                    "border-l-2",
                    active
                      ? "bg-asphalt text-bone border-track-gold"
                      : "text-bone-dim border-transparent hover:text-bone hover:bg-asphalt/60",
                  )}
                >
                  <Icon size={15} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User chip + sign out */}
      <div className="px-5 py-4 border-t border-graphite flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 bg-track-gold-dim/30 border border-track-gold/40 flex items-center justify-center mono text-[11px] text-track-gold shrink-0">
            {user.initials}
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[12px] text-bone truncate">{user.name}</span>
            <span className="label text-[9px] truncate">{user.role}</span>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            title="Sign out"
            className="text-bone-mute hover:text-bone transition-colors shrink-0"
          >
            <LogOut size={15} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </aside>
  );
}
