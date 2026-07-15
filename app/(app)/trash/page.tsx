"use client";

import Link from "next/link";
import { useState } from "react";
import { useLife } from "@/lib/data/provider";
import { KIND_META } from "@/lib/types";
import { KindIcon } from "@/components/icons";
import { BackLink, Button, EmptyState, Sheet } from "@/components/ui";
import { FREE_LIMITS, PREMIUM_TRASH_DAYS } from "@/lib/limits";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(ms: number): string {
  const days = Math.floor((Date.now() - ms) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function TrashPage() {
  const { trashedItems, restoreItem, purgeItem, premium } = useLife();
  const [purging, setPurging] = useState<string | null>(null);
  const retentionDays = premium ? PREMIUM_TRASH_DAYS : FREE_LIMITS.trashDays;

  return (
    <div className="rise-in lg:max-w-2xl">
      <div className="pt-2">
        <BackLink fallback="/you" label="You" />
      </div>

      <header className="pt-4 pb-4">
        <p className="text-sm text-ink-3">Nothing&rsquo;s gone for good, not right away</p>
        <h1 className="font-display text-[2rem] leading-tight text-ink mt-1">Trash</h1>
      </header>

      <p className="mb-6 text-sm text-ink-3">
        {premium
          ? `Deleted items stay here for ${retentionDays} days before they're purged for good.`
          : `Deleted items stay here for ${retentionDays} days on the free plan. `}
        {!premium && (
          <Link href="/pricing" className="text-accent-deep font-medium">
            Premium keeps them for {PREMIUM_TRASH_DAYS}.
          </Link>
        )}
      </p>

      {trashedItems.length === 0 ? (
        <EmptyState
          emoji="🗑"
          title="Trash is empty"
          body="Anything you delete shows up here first, so a stray tap never costs you something for good."
        />
      ) : (
        <div className="space-y-2">
          {trashedItems.map((item) => {
            const meta = KIND_META[item.kind];
            const deletedAt = item.deletedAt ?? Date.now();
            const daysLeft = Math.max(0, retentionDays - Math.floor((Date.now() - deletedAt) / DAY_MS));
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-(--radius-card) border border-line-soft bg-surface px-4 py-3 shadow-(--shadow-card)"
              >
                <KindIcon kind={item.kind} className="h-[18px] w-[18px] shrink-0 text-ink-2" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] text-ink">{item.title}</p>
                  <p className="text-xs text-ink-3">
                    {meta.label} · deleted {daysAgo(deletedAt)} · {daysLeft > 0 ? `${daysLeft} days left` : "purging soon"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button small variant="soft" onClick={() => restoreItem(item.id)}>Restore</Button>
                  <Button small variant="danger" onClick={() => setPurging(item.id)}>Delete forever</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet
        open={purging !== null}
        onClose={() => setPurging(null)}
        title="Delete forever?"
        cancelLabel="Keep"
        primary={{
          label: "Delete forever",
          danger: true,
          onClick: () => {
            if (purging) purgeItem(purging);
            setPurging(null);
          },
        }}
      >
        <p className="text-sm text-ink-2">This can&rsquo;t be undone.</p>
      </Sheet>
    </div>
  );
}
