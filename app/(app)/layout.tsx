"use client";

import { FocusSessionHost } from "@/components/focussession";
import { AppShell } from "@/components/shell";
import { LifeProvider } from "@/lib/data/provider";
import { UsagePulse } from "@/components/usage";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LifeProvider>
      {/* the timer hangs off the layout, not a page, so a minimized run
          survives walking to another part of the app */}
      {/* records that the app was opened, and which parts of it were used —
          see components/usage.tsx */}
      <UsagePulse />
      <FocusSessionHost>
        <AppShell>{children}</AppShell>
      </FocusSessionHost>
    </LifeProvider>
  );
}
