"use client";

import Link from "next/link";
import { useLife } from "@/lib/data/provider";
import { pickedEntries, tryingFor } from "@/lib/progress";
import { Item } from "@/lib/types";

/**
 * What you're in the middle of, across every list: the pottery you picked
 * three days ago, the trip you picked three weeks ago.
 *
 * Deliberately not day-scoped and deliberately not part of any count. These
 * are the season you're in rather than today's obligations, so they must not
 * inflate "5 small actions between you and a good day" or move the day's
 * progress bar — a thing you're slowly trying is not a task you failed to
 * finish today.
 */
export function TryingNowStrip({
  lists, onOpen, className = "",
}: {
  lists: Item[];
  /** Lists page: expand that card in place. Omitted elsewhere, where each row
   *  becomes a link to the list itself. */
  onOpen?: (listId: string) => void;
  className?: string;
}) {
  const rows = lists.flatMap((l) =>
    pickedEntries(l.entries ?? []).map((e) => ({ list: l, entry: e }))
  );
  if (rows.length === 0) return null;

  return (
    <div className={`rounded-(--radius-card) border border-accent/40 bg-accent-soft/30 p-4 ${className}`}>
      <p className="mb-2 text-[0.68rem] font-medium uppercase tracking-wide text-accent-deep">
        Trying now
      </p>
      <div className="space-y-1.5">
        {rows.map(({ list, entry }) => {
          const inner = (
            <>
              <span className="min-w-0 truncate text-ink">{entry.text}</span>
              <span className="min-w-0 shrink truncate text-xs text-ink-3">{list.title}</span>
              <span className="ml-auto shrink-0 text-xs text-ink-3">{tryingFor(entry.pickedAt!)}</span>
            </>
          );
          const cls = "pressable flex w-full items-baseline gap-2 text-left text-sm";
          return onOpen ? (
            <button key={entry.id} onClick={() => onOpen(list.id)} className={cls}>
              {inner}
            </button>
          ) : (
            <Link key={entry.id} href={`/item/${list.id}`} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Every active list, in their own order — what the strip draws from. */
export function useLists(): Item[] {
  const { db } = useLife();
  return db.items
    .filter((i) => i.kind === "list" && i.status === "active" && !i.deletedAt)
    .sort((a, b) => a.position - b.position);
}
