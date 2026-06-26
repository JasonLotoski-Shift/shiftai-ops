import { redirect } from "next/navigation";

// The Invoice Register moved into Financials → AP/AR (managing partners only).
// Keep the old URL working for bookmarks/links by redirecting here. Individual
// invoice pages still live at /invoices/[id] (detail + PDF generation).
export default function InvoicesIndexRedirect() {
  redirect("/financials");
}
