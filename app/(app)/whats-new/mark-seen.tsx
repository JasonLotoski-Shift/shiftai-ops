"use client";

import { useEffect, useRef } from "react";
import { markWhatsNewSeen } from "./actions";

// Tiny client child: on mount, stamp this partner's whatsNewSeenAt so the
// sidebar "new" dot clears. Renders nothing. Fires once per mount.
export function MarkWhatsNewSeen() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void markWhatsNewSeen();
  }, []);
  return null;
}
