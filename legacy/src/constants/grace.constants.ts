// Overstay billing defaults. These mirror the SQL defaults in
// supabase/migrations/0013_recurring_overstay_billing.sql
// (get_extension_params) — keep both in sync. Per-branch overrides live in
// branches.rate_config under the "extension" key and are edited via
// RateConfigFeature.
export const GRACE_PERIOD_MINUTES = 25;
export const GRACE_EXTENSION_CHARGE_PHP = 150;
export const GRACE_ALERT_THRESHOLD_MINUTES = 25;
export const EXTENSION_BLOCK_MINUTES = 60;

// The session_addons item id used for posted extension blocks. The SQL side
// (close_session in migration 0013) counts posted quantity under this exact
// id — changing it orphans legacy charge rows. Keep in sync with
// src/constants/addon.constants.ts.
export const EXTENSION_ITEM_ID = 'extension_charge';
