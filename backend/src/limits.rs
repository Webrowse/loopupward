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
pub const MAX_NAME: usize = 120;
/* journal walls — the human loop stays human-sized */
pub const MAX_JOURNAL_ROUGH_FREE: usize = 5_000;
pub const MAX_JOURNAL_EOD_FREE: usize = 3_000;
pub const MAX_JOURNAL_ROUGH_PREMIUM: usize = 20_000;
pub const MAX_JOURNAL_EOD_PREMIUM: usize = 10_000;
pub const MAX_EMOJI: usize = 16;
pub const MAX_UNIT: usize = 32;
pub const MAX_BATCH_ROWS: usize = 500;
pub const MAX_IMPORT_ROWS: usize = 20_000;
