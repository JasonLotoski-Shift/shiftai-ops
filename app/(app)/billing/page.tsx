import { redirect } from "next/navigation";

// The firm-wide money surface now lives at /financials (the firm revenue
// rollup); the raw invoice register stays at /invoices. /billing is kept as a
// vocabulary alias for old links/bookmarks and points at the new hub.
export default function BillingPage() {
  redirect("/financials");
}
