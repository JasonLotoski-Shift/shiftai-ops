import { redirect } from "next/navigation";

// The billing surface lives at /invoices (kept as the canonical route — many
// links and revalidatePath calls reference it). /billing is the vocabulary
// alias so the new tab name works as a URL/bookmark.
export default function BillingPage() {
  redirect("/invoices");
}
