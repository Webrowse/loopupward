"use client";

import { AppShell } from "@/components/shell";
import { LifeProvider } from "@/lib/data/provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LifeProvider>
      <AppShell>{children}</AppShell>
    </LifeProvider>
  );
}
