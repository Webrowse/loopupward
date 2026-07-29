"use client";

import { FocusSessionHost } from "@/components/focussession";
import { AppShell } from "@/components/shell";
import { LifeProvider } from "@/lib/data/provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LifeProvider>
      {/* the timer hangs off the layout, not a page, so a minimized run
          survives walking to another part of the app */}
      <FocusSessionHost>
        <AppShell>{children}</AppShell>
      </FocusSessionHost>
    </LifeProvider>
  );
}
