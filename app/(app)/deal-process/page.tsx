import { redirect } from "next/navigation";

// Retired 2026-06-13. The deal-process track is now a section inside the
// How-it-works training manual (components/how-it-works-view.tsx). This route
// stays only as a redirect so old links / bookmarks land in the right place.
// The sidebar entry is dropped separately; nothing should link here anymore.

export default function DealProcessPage() {
  redirect("/how-it-works");
}
