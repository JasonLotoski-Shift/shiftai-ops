"use client";

import { useState } from "react";
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
  Network,
  CheckSquare,
  MessageSquare,
  Import,
  Target,
  BrainCircuit,
  Sparkles,
  ChevronDown,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Sigil } from "@/components/wordmark";
import { avatarColor } from "@/components/ui";
import { logout } from "@/app/(app)/account.actions";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
};

// Day-to-day work, top of the rail.
const operate: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Task Board", icon: CheckSquare },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

// The three ways leads come into the firm — collapsible group.
const importGroup: NavItem[] = [
  { href: "/import", label: "Contacts", icon: Import },
  { href: "/targeting", label: "AI Targeting", icon: Target },
  { href: "/ingest", label: "Ingest", icon: BrainCircuit },
];

// Firm-wide records and money.
const firm: NavItem[] = [
  { href: "/financials", label: "Financials", icon: Receipt },
  { href: "/contacts", label: "Contacts List", icon: Users },
  { href: "/clients", label: "Clients List", icon: Briefcase },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/library", label: "Library", icon: Library, disabled: true },
];

// Reference + settings.
const other: NavItem[] = [
  { href: "/whats-new", label: "What's new", icon: Sparkles },
  { href: "/how-it-works", label: "How it works", icon: BookOpen },
  { href: "/architecture", label: "Architecture", icon: Network },
  { href: "/agents", label: "Agents & MCPs", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

type SidebarUser = { name: string; initials: string; role: string };

export function Sidebar({
  user,
  totalUnreadMessages = 0,
  whatsNewUnread = false,
  gmailConnected = true,
}: {
  user: SidebarUser;
  totalUnreadMessages?: number;
  whatsNewUnread?: boolean;
  gmailConnected?: boolean;
}) {
  const pathname = usePathname();

  // Import group starts open if you're on one of its pages, else collapsed-friendly default open.
  const importActive = importGroup.some(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );
  const [importOpen, setImportOpen] = useState(true);

  // Subtle, theme-safe red dot for an unread indicator.
  const RedDot = () => (
    <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-flag-red" aria-hidden />
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // One renderer for every nav row — handles active, disabled, and an unread dot.
  function Row({ item }: { item: NavItem }) {
    const Icon = item.icon;
    if (item.disabled) {
      return (
        <li>
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

    const active = isActive(item.href);
    const showDot =
      (item.href === "/messages" && totalUnreadMessages > 0) ||
      (item.href === "/whats-new" && whatsNewUnread);
    // Task Board is a primary surface — keep it visually loud (bold + near-white)
    // at all times. What's-new only emphasizes while there's an unread update.
    const emphasize =
      item.href === "/tasks" || (item.href === "/whats-new" && whatsNewUnread);
    // Nudge partners to connect Gmail for email logging until they have.
    const showGmailTag = item.href === "/settings" && !gmailConnected;

    return (
      <li>
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 px-5 py-2.5 text-[13px] transition-colors",
            "border-l-2",
            active
              ? "bg-track-gold-dim/15 text-bone border-track-gold"
              : "text-bone-dim border-transparent hover:text-bone hover:bg-[var(--color-row-hover)]",
          )}
        >
          <Icon size={15} strokeWidth={1.5} />
          <span className={cn(emphasize && "font-semibold text-bone")}>{item.label}</span>
          {showGmailTag && (
            <span className="ml-auto shrink-0 rounded-[var(--radius-pill)] bg-flag-red/15 text-flag-red text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 leading-none">
              Connect Gmail
            </span>
          )}
          {showDot && <RedDot />}
        </Link>
      </li>
    );
  }

  return (
    <aside className="w-[220px] shrink-0 bg-asphalt flex flex-col">
      {/* Wordmark / brand block */}
      <div className="px-5 py-6">
        <Link href="/dashboard" className="inline-flex items-center gap-3">
          <Sigil size={28} />
          <span className="label">Ops · v1.0</span>
        </Link>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 py-4">
        <div className="px-5 pb-2">
          <span className="label">Operate</span>
        </div>
        <ul>
          {operate.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </ul>

        {/* Import — collapsible group */}
        <button
          type="button"
          onClick={() => setImportOpen((o) => !o)}
          className="w-full px-5 pb-2 pt-6 flex items-center justify-between text-left group"
          aria-expanded={importOpen}
        >
          <span className="label flex items-center gap-1.5">
            Import
            {!importOpen && importActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-track-gold" aria-hidden />
            )}
          </span>
          {importOpen ? (
            <ChevronDown size={13} strokeWidth={1.5} className="text-bone-mute group-hover:text-bone" />
          ) : (
            <ChevronRight size={13} strokeWidth={1.5} className="text-bone-mute group-hover:text-bone" />
          )}
        </button>
        {importOpen && (
          <ul>
            {importGroup.map((item) => (
              <Row key={item.href} item={item} />
            ))}
          </ul>
        )}

        {/* Firm */}
        <div className="px-5 pb-2 pt-6">
          <span className="label">Firm</span>
        </div>
        <ul>
          {firm.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </ul>

        {/* Other */}
        <div className="px-5 pb-2 pt-6">
          <span className="label">Other</span>
        </div>
        <ul>
          {other.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </ul>
      </nav>

      {/* User chip + sign out */}
      <div className="px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-7 h-7 rounded-[var(--radius-pill)] border border-black/15 flex items-center justify-center mono font-semibold text-[11px] shrink-0"
            style={{ backgroundColor: avatarColor(user.initials).bg, color: avatarColor(user.initials).text }}
          >
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
