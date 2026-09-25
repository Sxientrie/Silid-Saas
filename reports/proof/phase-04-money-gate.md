# Money Recomputation Gate — diff report

Independent path: per-guest accumulation, cumulative tier-step deltas,
floor-plus-remainder block counting, dual-order ledger summation.
Reuses no production arithmetic (app.stay_amounts, app.extension_blocks_due).

- ok [spec/domain-rules.md §1.4] short_time pax 2: independent ₱450 vs stated ₱450
- ok [spec/domain-rules.md §1.4] short_time pax 2 (base): independent ₱450 vs stated ₱450
- ok [spec/domain-rules.md §1.4] short_time pax 2 (surcharge): independent ₱0 vs stated ₱0
- ok [spec/domain-rules.md §1.4] short_time pax 3: independent ₱650 vs stated ₱650
- ok [spec/domain-rules.md §1.4] short_time pax 3 (base): independent ₱450 vs stated ₱450
- ok [spec/domain-rules.md §1.4] short_time pax 3 (surcharge): independent ₱200 vs stated ₱200
- ok [spec/domain-rules.md §1.4] short_time pax 4: independent ₱850 vs stated ₱850
- ok [spec/domain-rules.md §1.4] short_time pax 4 (base): independent ₱450 vs stated ₱450
- ok [spec/domain-rules.md §1.4] short_time pax 4 (surcharge): independent ₱400 vs stated ₱400
- ok [spec/domain-rules.md §1.4] short_time pax 5: independent ₱1050 vs stated ₱1050
- ok [spec/domain-rules.md §1.4] short_time pax 5 (base): independent ₱450 vs stated ₱450
- ok [spec/domain-rules.md §1.4] short_time pax 5 (surcharge): independent ₱600 vs stated ₱600
- ok [spec/domain-rules.md §1.4] overnight pax 2: independent ₱1100 vs stated ₱1100
- ok [spec/domain-rules.md §1.4] overnight pax 2 (base): independent ₱1100 vs stated ₱1100
- ok [spec/domain-rules.md §1.4] overnight pax 2 (surcharge): independent ₱0 vs stated ₱0
- ok [spec/domain-rules.md §1.4] overnight pax 3: independent ₱1400 vs stated ₱1400
- ok [spec/domain-rules.md §1.4] overnight pax 3 (base): independent ₱1400 vs stated ₱1400
- ok [spec/domain-rules.md §1.4] overnight pax 3 (surcharge): independent ₱0 vs stated ₱0
- ok [spec/domain-rules.md §1.4] overnight pax 4: independent ₱1700 vs stated ₱1700
- ok [spec/domain-rules.md §1.4] overnight pax 4 (base): independent ₱1700 vs stated ₱1700
- ok [spec/domain-rules.md §1.4] overnight pax 4 (surcharge): independent ₱0 vs stated ₱0
- ok [spec/domain-rules.md §1.4] overnight pax 5: independent ₱2000 vs stated ₱2000
- ok [spec/domain-rules.md §1.4] overnight pax 5 (base): independent ₱1700 vs stated ₱1700
- ok [spec/domain-rules.md §1.4] overnight pax 5 (surcharge): independent ₱300 vs stated ₱300
- ok [spec/domain-rules.md §1.4] overnight pax 6: independent ₱2300 vs stated ₱2300
- ok [spec/domain-rules.md §1.4] overnight pax 6 (base): independent ₱1700 vs stated ₱1700
- ok [spec/domain-rules.md §1.4] overnight pax 6 (surcharge): independent ₱600 vs stated ₱600
- ok [vault-01] Short-time base charge (total): independent ₱450 vs stated ₱450
- ok [vault-02] Short-time pax surcharge (four guests) (total): independent ₱850 vs stated ₱850
- ok [vault-03] Overnight tiered base and surcharge (five guests) (total): independent ₱2000 vs stated ₱2000
- ok [vault-06] One minute past grace bills one full block (1 block): independent ₱150 vs stated ₱150
- ok [vault-06] A fully elapsed block still bills one block (1 block): independent ₱150 vs stated ₱150
- ok [vault-06] One minute into the second hour bills a second block (2 blocks): independent ₱300 vs stated ₱300

VERDICT: ZERO DRIFT — every stated figure recomputed exactly.

## Service-configuration section (rate configuration, Phase 04)

Independent path: character-code digit loops, decimal-expansion money
values, end-walk normalization — no regexes, no parseFloat, no code
shared with the service's schemas.

- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.grace_minutes = 25 (vault-07 edge): independent {"accepted":true,"canonicalText":"25"} vs service {"accepted":true,"canonicalText":"25"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.grace_minutes = 0 (vault-07 edge): independent {"accepted":true,"canonicalText":"0"} vs service {"accepted":true,"canonicalText":"0"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.grace_minutes = 123456789 (vault-07 edge): independent {"accepted":true,"canonicalText":"123456789"} vs service {"accepted":true,"canonicalText":"123456789"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.grace_minutes = 30 (vault-07 edge): independent {"accepted":true,"canonicalText":"30"} vs service {"accepted":true,"canonicalText":"30"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.grace_minutes = 25.0 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.grace_minutes = -5 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.grace_minutes = 1e2 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.grace_minutes = 1234567890 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_minutes = 60 (vault-07 edge): independent {"accepted":true,"canonicalText":"60"} vs service {"accepted":true,"canonicalText":"60"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_minutes = 90 (vault-07 edge): independent {"accepted":true,"canonicalText":"90"} vs service {"accepted":true,"canonicalText":"90"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_minutes = 0 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_minutes = -60 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 150 (vault-07 edge): independent {"accepted":true,"canonicalText":"150"} vs service {"accepted":true,"canonicalText":"150"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 175.5 (vault-07 edge): independent {"accepted":true,"canonicalText":"175.5"} vs service {"accepted":true,"canonicalText":"175.5"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 0.5 (vault-07 edge): independent {"accepted":true,"canonicalText":"0.5"} vs service {"accepted":true,"canonicalText":"0.5"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 150.50 (vault-07 edge): independent {"accepted":true,"canonicalText":"150.5"} vs service {"accepted":true,"canonicalText":"150.5"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 175.5 (vault-07 edge): independent {"accepted":true,"canonicalText":"175.5"} vs service {"accepted":true,"canonicalText":"175.5"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 0 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 0.00 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 150. (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 1234567890.1 (vault-07 edge): independent {"accepted":true,"canonicalText":"1234567890.1"} vs service {"accepted":true,"canonicalText":"1234567890.1"}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 1234567890.12 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §3.3 + fixture defaults] extension.block_charge = 1234567890123 (vault-07 edge): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §5 catalogue] canteen.bottled_water = "0" (zero price is legal, vault-08): independent {"accepted":true,"canonicalText":"0"} vs service {"accepted":true,"canonicalText":"0"}
- ok [spec/domain-rules.md §5 catalogue] canteen.bottled_water = "-1" (negative is refused): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §5 catalogue] canteen.bottled_water = "150.50" (normalized): independent {"accepted":true,"canonicalText":"150.5"} vs service {"accepted":true,"canonicalText":"150.5"}
- ok [spec/domain-rules.md §5 catalogue] canteen.red_horse_1l = "0" (zero price is legal, vault-08): independent {"accepted":true,"canonicalText":"0"} vs service {"accepted":true,"canonicalText":"0"}
- ok [spec/domain-rules.md §5 catalogue] canteen.red_horse_1l = "-1" (negative is refused): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §5 catalogue] canteen.red_horse_1l = "150.50" (normalized): independent {"accepted":true,"canonicalText":"150.5"} vs service {"accepted":true,"canonicalText":"150.5"}
- ok [spec/domain-rules.md §5 catalogue] canteen.marlboro_pack = "0" (zero price is legal, vault-08): independent {"accepted":true,"canonicalText":"0"} vs service {"accepted":true,"canonicalText":"0"}
- ok [spec/domain-rules.md §5 catalogue] canteen.marlboro_pack = "-1" (negative is refused): independent {"accepted":false} vs service {"accepted":false}
- ok [spec/domain-rules.md §5 catalogue] canteen.marlboro_pack = "150.50" (normalized): independent {"accepted":true,"canonicalText":"150.5"} vs service {"accepted":true,"canonicalText":"150.5"}
- ok [vault-08] canteen.unknown_item is refused (not a catalogue key): independent {"accepted":false} vs service {"accepted":false}
- ok [fixture defaults (independent derivation)] the default triple read from an empty card: independent {"graceMinutes":25,"blockMinutes":60,"blockCharge":150} vs service {"graceMinutes":25,"blockMinutes":60,"blockCharge":150}
- ok [spec/domain-rules.md §3.3/§3.4] a corrupted card falls back to the default triple (never punitive, never free): independent {"graceMinutes":25,"blockMinutes":60,"blockCharge":150} vs service {"graceMinutes":25,"blockMinutes":60,"blockCharge":150}
- ok [spec/domain-rules.md §3.3] a valid stored card is honored (zero grace, 90-minute blocks, 175.5 charge): independent {"graceMinutes":0,"blockMinutes":90,"blockCharge":175.5} vs service {"graceMinutes":0,"blockMinutes":90,"blockCharge":175.5}

SERVICE VERDICT: ZERO DRIFT — the service accepts, refuses, and normalizes exactly per §3.3.
