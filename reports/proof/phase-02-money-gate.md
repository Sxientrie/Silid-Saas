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
- ok [seeded ledger] seed 20260925, 40 events (running vs grouped summation): independent ₱26525 vs stated ₱26525

VERDICT: ZERO DRIFT — every stated figure recomputed exactly.
