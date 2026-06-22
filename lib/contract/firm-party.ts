// The Shift side of every client contract.
//
// These details are the same on every agreement, so they live here instead of
// being re-typed per deal. A legally load-bearing value that is not yet known
// renders as a [NEEDS INPUT] marker on purpose: it must be the real value, never
// guessed (firm-wide no-hallucination rule), and the save gate
// (assertNoNeedsInput) blocks a contract from being filed while one remains.
//
// PARTY STATUS (2026-06-22): the contracting party is the corporation, SHIFT AI
// OPS LTD. Incorporation is in progress and the BC company number has not been
// assigned yet, so `incorporationNumber` is empty and renders as a blank fill-line
// in the parties block. This is fine for a DRAFT sent out for the client's review.
// DO NOT EXECUTE the agreement until SHIFT AI OPS LTD. is actually incorporated and
// the number is filled in — until then the corporation does not yet legally exist.
// (If a deal must be signed before incorporation, switch to the sole-proprietor
// party — Jason Lotoski c.o.b. Shift AI Partners — but note that puts the
// indemnities and the uncapped liability carve-outs on Jason personally.)
//
// The firm carries no insurance yet, so the Insurance section was removed from the
// template (see the note there); there are no insurance fields here. Restore it
// when coverage is in place.
//
// SOLE-PROP FALLBACK VALUES (if you must contract before incorporating):
//   legalName: "Jason Lotoski, carrying on business as Shift AI Partners",
//   partyName: "Jason Lotoski",
//   partyDescriptor: "An individual carrying on business as Shift AI Partners",
//   incorporated: false,

export type FirmParty = {
  /** Operating / brand name shown in headings and the running header/footer. */
  operatingName: string;
  /** Full party reference used in the body sentence and the signature-block label. */
  legalName: string;
  /** Bold party name in the parties block — the legal person. */
  partyName: string;
  /** Descriptor line under partyName in the parties block. */
  partyDescriptor: string;
  /** True once incorporated. Shows the incorporation-number line, and lets the
   *  footer name the legal entity alongside the brand. */
  incorporated: boolean;
  /** BC incorporation / company number. Empty until assigned — renders as a blank
   *  fill-line, not a save-blocking marker. */
  incorporationNumber: string;
  /** Person who signs for Shift — pre-filled on the signature block. */
  signatoryName: string;
  /** Registered or principal business address (single line). */
  address: string;
  /** Notice email. Known (canonical firm domain). */
  noticeEmail: string;
  /** Governing jurisdiction. */
  jurisdiction: string;
  /** Short province name used in the governing-law clause. */
  governingProvince: string;
  /** City where any arbitration seats. */
  forumCity: string;
};

export const FIRM_PARTY: FirmParty = {
  operatingName: "Shift AI Partners",
  legalName: "SHIFT AI OPS LTD.",
  partyName: "SHIFT AI OPS LTD.",
  partyDescriptor: "A corporation incorporated under the laws of British Columbia",
  incorporated: true,
  incorporationNumber: "",
  signatoryName: "Jason Lotoski",
  address: "4290 Goodison Road, Kelowna, BC V1W 4C6",
  noticeEmail: "legal@shiftai.partners",
  jurisdiction: "British Columbia, Canada",
  governingProvince: "British Columbia",
  forumCity: "Vancouver, British Columbia",
};
