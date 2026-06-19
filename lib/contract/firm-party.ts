// The Shift side of every client contract.
//
// These details are the same on every agreement, so they live here instead of
// being re-typed per deal. The legally load-bearing ones default to a
// [NEEDS INPUT] marker on purpose: the firm's incorporated legal name,
// incorporation number, registered address, and insurance limit must be the
// real values, never guessed (firm-wide no-hallucination rule). Until Jason
// fills them in here, the save gate (assertNoNeedsInput) will block a contract
// from being filed — which is the correct, safe behavior.
//
// HOW TO FINISH SETUP (one time): replace each NEEDS_INPUT(...) below with the
// real value as a plain string. Leave the jurisdiction/operating-name fields
// as they are (those are known and fixed).

/** Wrap a not-yet-known value so it renders as a visible, save-blocking marker. */
function NEEDS_INPUT(what: string): string {
  return `[NEEDS INPUT: ${what}]`;
}

export type FirmParty = {
  /** Operating / brand name shown in headings. Known. */
  operatingName: string;
  /** Incorporated legal entity name used in the parties block. */
  legalName: string;
  /** BC incorporation / company number. */
  incorporationNumber: string;
  /** Registered or principal business address (single line). */
  address: string;
  /** Notice email. Known (canonical firm domain). */
  noticeEmail: string;
  /** Governing jurisdiction — fixed for a BC corporation. */
  jurisdiction: string;
  /** Short province name used in the governing-law clause. */
  governingProvince: string;
  /** City where any arbitration/litigation seats. */
  forumCity: string;
  /** Commercial General Liability limit carried by the firm (e.g. "$2,000,000"). */
  insuranceLimit: string;
};

export const FIRM_PARTY: FirmParty = {
  operatingName: "Shift AI Partners",
  legalName: "SHIFT AI OPS LTD.",
  incorporationNumber: NEEDS_INPUT("Shift's BC incorporation/company number"),
  address: NEEDS_INPUT("Shift's registered business address"),
  noticeEmail: "legal@shiftai.partners",
  jurisdiction: "British Columbia, Canada",
  governingProvince: "British Columbia",
  forumCity: "Vancouver, British Columbia",
  insuranceLimit: NEEDS_INPUT("Shift's Commercial General Liability limit, e.g. $2,000,000"),
};
