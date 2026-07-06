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
    })
}

/* text size walls — generous for humans, hostile to abuse */
pub const MAX_TITLE: usize = 400;
pub const MAX_NOTE: usize = 8_000;
pub const MAX_SEED_TEXT: usize = 2_000;
pub const MAX_REFLECTION_TEXT: usize = 20_000;
pub const MAX_NAME: usize = 120;
pub const MAX_EMOJI: usize = 16;
pub const MAX_UNIT: usize = 32;
pub const MAX_BATCH_ROWS: usize = 500;
pub const MAX_IMPORT_ROWS: usize = 20_000;
