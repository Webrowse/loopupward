use serde_json::{json, Value};

/// Server-enforced caps. The frontend mirrors the free values for friendly
/// gating, but this is the wall that actually holds.
#[derive(Clone, Copy)]
pub struct Caps {
    pub areas: i64,
    pub active_items: i64,
    pub items_total: i64,
    pub seeds: i64,
    pub actions: i64,
    pub logs: i64,
    pub reflections: i64,
    pub journal: i64,
    pub labels: i64,
    pub habit_day_notes: i64,
    pub day_order: i64,
    pub focus_sessions: i64,
    pub events: i64,
}

pub fn caps(premium: bool) -> Caps {
    if premium {
        Caps {
            areas: 200,
            active_items: 20_000,
            items_total: 50_000,
            seeds: 20_000,
            actions: 200_000,
            logs: 1_000_000,
            reflections: 10_000,
            journal: 50_000,
            labels: 500,
            habit_day_notes: 100_000,
            day_order: 50_000,
            focus_sessions: 2_000_000,
            events: 5_000_000,
        }
    } else {
        Caps {
            areas: 4,
            active_items: 40,
            items_total: 1_000,
            seeds: 500,
            actions: 10_000,
            logs: 50_000,
            reflections: 300,
            journal: 1_000,
            labels: 10,
            habit_day_notes: 5_000,
            day_order: 2_000,
            focus_sessions: 100_000,
            events: 250_000,
        }
    }
}

pub fn caps_json(premium: bool) -> Value {
    let c = caps(premium);
    json!({
        "areas": c.areas,
        "activeItems": c.active_items,
        "itemsTotal": c.items_total,
        "seeds": c.seeds,
        "actions": c.actions,
        "logs": c.logs,
        "reflections": c.reflections,
        "journal": c.journal,
        "labels": c.labels,
        "habitDayNotes": c.habit_day_notes,
        "dayOrder": c.day_order,
        "focusSessions": c.focus_sessions,
        "events": c.events,
        "journalRoughChars": if premium { MAX_JOURNAL_ROUGH_PREMIUM } else { MAX_JOURNAL_ROUGH_FREE },
        "journalEodChars": if premium { MAX_JOURNAL_EOD_PREMIUM } else { MAX_JOURNAL_EOD_FREE },
    })
}

/* text size walls — generous for humans, hostile to abuse */
pub const MAX_TITLE: usize = 400;
pub const MAX_NOTE: usize = 8_000;
/* generous single tier — a note's rich HTML body isn't premium-gated */
pub const MAX_RICH_BODY: usize = 50_000;
pub const MAX_SEED_TEXT: usize = 2_000;
pub const MAX_REFLECTION_TEXT: usize = 20_000;
/* a day's plan for a habit is a short label, not a note */
pub const MAX_HABIT_DAY_NOTE: usize = 500;
/* a day's manual task order is a plain id list, not user text */
pub const MAX_DAY_ORDER_ENTRIES: usize = 500;
pub const MAX_NAME: usize = 120;
/* an area explains itself in a paragraph, not an essay */
pub const MAX_AREA_TEXT: usize = 2_000;
/* the optional half of a day: gratitude, the one intention */
pub const MAX_DAILY_EXTRA: usize = 2_000;
pub const MAX_DAY_TAGS: usize = 20;
/* a reflection's wins/lessons/blockers are bullet points, not chapters */
pub const MAX_REFLECTION_LINES: usize = 50;
pub const MAX_REFLECTION_LINE: usize = 1_000;
/* an event payload is a handful of fields about one moment */
pub const MAX_EVENT_PAYLOAD: usize = 4_000;
/* a day of wall clock: past this it is a stuck tab, not a focus session */
pub const MAX_SESSION_SECONDS: i32 = 86_400;
/* journal walls — the human loop stays human-sized */
pub const MAX_JOURNAL_ROUGH_FREE: usize = 5_000;
pub const MAX_JOURNAL_EOD_FREE: usize = 3_000;
pub const MAX_JOURNAL_ROUGH_PREMIUM: usize = 20_000;
pub const MAX_JOURNAL_EOD_PREMIUM: usize = 10_000;
pub const MAX_EMOJI: usize = 16;
pub const MAX_UNIT: usize = 32;
pub const MAX_BATCH_ROWS: usize = 500;
/* First sign-in carries a whole on-device life across in one transaction, and
   that now includes the two capture streams — a year of events alone can run
   to tens of thousands of rows. The ceiling is generous because the failure
   mode is the worst one there is: a rejected import reads as "the cloud is
   broken" to someone who has just handed over everything they own. */
pub const MAX_IMPORT_ROWS: usize = 500_000;
