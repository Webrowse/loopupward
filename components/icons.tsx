/** Thin-line icon set replacing raw emoji as fixed system iconography (item
 *  kinds, mood, energy) — matches the 22px hand-drawn-adjacent style already
 *  used for nav icons in shell.tsx. User-customizable emoji (area/label
 *  pickers) are untouched; those are a different, deliberate pattern. */

import { ComponentType } from "react";
import { ItemKind } from "@/lib/types";

function base(className?: string) {
  return {
    width: 16, height: 16, viewBox: "0 0 24 24", fill: "none" as const,
    stroke: "currentColor", strokeWidth: 1.8,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    className: `inline shrink-0 align-[-0.2em] ${className ?? ""}`,
  };
}

export function NoteIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M6 3.5h9l3 3V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5Z" />
      <path d="M15 3.5V6a1 1 0 0 0 1 1h2.5" />
      <path d="M8 12h8M8 15.5h5" />
    </svg>
  );
}

export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M4 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h7A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" />
    </svg>
  );
}

export function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M8.5 8.5c-2 .5-3 2-3 4s1 3 3 3 3-1.3 3-3-.8-2.7-2-3c.3-1 1-1.6 2-2" />
      <path d="M17 8.5c-2 .5-3 2-3 4s1 3 3 3 3-1.3 3-3-.8-2.7-2-3c.3-1 1-1.6 2-2" />
    </svg>
  );
}

export function IdeaIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M9 16.5h6M9.5 19h5" />
      <path d="M12 3.5c-3 0-5.2 2.3-5.2 5.2 0 2 1.1 3.2 2 4.1.6.6 1 1.3 1.1 2.2h4.2c.1-.9.5-1.6 1.1-2.2.9-.9 2-2.1 2-4.1 0-2.9-2.2-5.2-5.2-5.2Z" />
    </svg>
  );
}

export function DreamIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M4 16h16" />
      <path d="M7 16a5 5 0 0 1 10 0" />
      <path d="M12 6.5v2M6.5 9l1.4 1.4M17.5 9l-1.4 1.4" />
    </svg>
  );
}

export function GoalIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function HabitIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M6 8.5h9a3 3 0 0 1 3 3V13" />
      <path d="M13 5.5 15.5 8 13 10.5" />
      <path d="M18 15.5H9a3 3 0 0 1-3-3V11" />
      <path d="M11 18.5 8.5 16 11 13.5" />
    </svg>
  );
}

/** A routine: a sunrise over a checklist — the daily script, run in order. */
export function RoutineIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M8.5 9.5a3.5 3.5 0 0 1 7 0" />
      <path d="M12 4v2M6.3 6.8l1.4 1.4M17.7 6.8l-1.4 1.4" />
      <path d="M4.5 13h15M7 16.5h10M9.5 20h5" />
    </svg>
  );
}

export function ListIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <rect x="4.5" y="4" width="15" height="16.5" rx="1.8" />
      <path d="m7.5 9 1.2 1.2L11 7.8" />
      <path d="M13.5 9.2h3" />
      <path d="m7.5 14.5 1.2 1.2 2.3-2.4" />
      <path d="M13.5 14.7h3" />
    </svg>
  );
}

export function ProjectIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M9.5 4.5h3a1 1 0 0 1 1 1v1.8a1.5 1.5 0 0 0 3 0V6h1a1 1 0 0 1 1 1v3.5h-1.8a1.5 1.5 0 0 0 0 3H19.5V17a1 1 0 0 1-1 1h-3.7a1.5 1.5 0 0 0-3 0H8a1 1 0 0 1-1-1v-3.7a1.5 1.5 0 0 0 0-3V6a1 1 0 0 1 1-1h1.5Z" />
    </svg>
  );
}

export function BookIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M12 6.5c-1.5-1.3-3.5-2-6-2v12c2.5 0 4.5.7 6 2 1.5-1.3 3.5-2 6-2v-12c-2.5 0-4.5.7-6 2Z" />
      <path d="M12 6.5v12" />
    </svg>
  );
}

export function MilestoneIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M3.5 19 9 8.5l3 5.5 2-3.5L18.5 19Z" />
      <path d="M13.5 6 15 3.5 16.5 6" />
    </svg>
  );
}

export function OrganizeIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M8 11h8l-1.2 8H9.2Z" />
      <path d="M12 11V7.5" />
      <path d="M12 8c0-1.9-1.3-3.2-3.2-3.2 0 1.9 1.3 3.2 3.2 3.2Z" />
      <path d="M12 8.5c0-1.6 1.2-2.8 2.8-2.8 0 1.6-1.2 2.8-2.8 2.8Z" />
    </svg>
  );
}

export function MoonIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M16 4.5a7.7 7.7 0 1 0 3.5 14.5A9 9 0 0 1 16 4.5Z" />
    </svg>
  );
}

export function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="6.5" width="16" height="4" rx="1" />
      <path d="M5.5 10.5V17a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-6.5" />
      <path d="M10 13.5h4" />
    </svg>
  );
}

export function PrincipleIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8" />
      <path d="m14.2 9.8-1.4 4.4-4.4 1.4 1.4-4.4Z" />
    </svg>
  );
}

export function PromiseIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M12 5.5c1-1.3 2.6-2 4-1.6 2 .6 3 2.8 2.2 5-.9 2.6-3.7 5-8.2 7.6-4.5-2.6-7.3-5-8.2-7.6-.8-2.2.2-4.4 2.2-5 1.4-.4 3 .3 4 1.6Z" />
      <path d="m9.5 10.5 1.7 1.7 3.3-3.4" />
    </svg>
  );
}

export function LessonIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M12 20v-8" />
      <path d="M12 12c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6Z" />
      <path d="M12 15c0-3-2-5-5.5-5 0 3 2 5 5.5 5Z" />
    </svg>
  );
}

export function MemoryIcon({ className }: { className?: string }) {
  return (
    <svg {...base(className)}>
      <path d="M9 4h6l.6 2.5H8.4Z" />
      <path d="M8 6.5h8L15.3 19a1 1 0 0 1-1 .9H9.7a1 1 0 0 1-1-.9Z" />
    </svg>
  );
}

/** Mood: same face, only the mouth curve changes across the 5-point scale. */
function Face({ mouth, className }: { mouth: string; className?: string }) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 10.2h.01M15 10.2h.01" strokeWidth={2.4} />
      <path d={mouth} />
    </svg>
  );
}
export function Mood1({ className }: { className?: string }) {
  return <Face className={className} mouth="M8 16.5c1.2-1.8 2.5-2.6 4-2.6s2.8.8 4 2.6" />;
}
export function Mood2({ className }: { className?: string }) {
  return <Face className={className} mouth="M8.5 15.7c1-1 2.2-1.4 3.5-1.4s2.5.4 3.5 1.4" />;
}
export function Mood3({ className }: { className?: string }) {
  return <Face className={className} mouth="M8.5 15h7" />;
}
export function Mood4({ className }: { className?: string }) {
  return <Face className={className} mouth="M8.5 14.3c1 1 2.2 1.4 3.5 1.4s2.5-.4 3.5-1.4" />;
}
export function Mood5({ className }: { className?: string }) {
  return <Face className={className} mouth="M8 14c1.2 2 2.5 2.8 4 2.8s2.8-.8 4-2.8" />;
}
export const MOOD_ICONS = [Mood1, Mood2, Mood3, Mood4, Mood5];

/** Energy: one battery outline, the fill widens across the 5-point scale. */
function Battery({ fill, className }: { fill: number; className?: string }) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="8" width="16" height="8" rx="2" />
      <rect x="19.5" y="10.3" width="1.7" height="3.4" rx="0.8" fill="currentColor" stroke="none" />
      {fill > 0 && <rect x="5.2" y="10.2" width={fill} height="3.6" rx="1" fill="currentColor" stroke="none" />}
    </svg>
  );
}
export function Energy1({ className }: { className?: string }) {
  return <Battery className={className} fill={0} />;
}
export function Energy2({ className }: { className?: string }) {
  return <Battery className={className} fill={2.8} />;
}
export function Energy3({ className }: { className?: string }) {
  return <Battery className={className} fill={5.6} />;
}
export function Energy4({ className }: { className?: string }) {
  return <Battery className={className} fill={8.4} />;
}
export function Energy5({ className }: { className?: string }) {
  return <Battery className={className} fill={11.2} />;
}
export const ENERGY_ICONS = [Energy1, Energy2, Energy3, Energy4, Energy5];

export const KIND_ICONS: Record<ItemKind, ComponentType<{ className?: string }>> = {
  note: NoteIcon,
  folder: FolderIcon,
  quote: QuoteIcon,
  idea: IdeaIcon,
  dream: DreamIcon,
  goal: GoalIcon,
  habit: HabitIcon,
  routine: RoutineIcon,
  list: ListIcon,
  project: ProjectIcon,
  book: BookIcon,
  milestone: MilestoneIcon,
  principle: PrincipleIcon,
  promise: PromiseIcon,
  lesson: LessonIcon,
  memory: MemoryIcon,
};

/** Drop-in replacement for `{KIND_META[kind].emoji}` — same inline spot,
 *  a real icon instead of a platform-rendered emoji. */
export function KindIcon({ kind, className }: { kind: ItemKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return <Icon className={className} />;
}
