# Playtesting Log

Running notes from playtest sessions. Add a new section for each session.

## Template

### YYYY-MM-DD — Session N

- Players:
- Duration:
- Outcome (winner / VP totals):
- Key observations:
- Balance flags:
- Followups:

---

## Balance Edits

### 2026-04-29 — Defense coverage pass

Audit triggered by feedback `36533100-bf75-4b16-b4be-39e56361eff4` ("we
introduced a defense score but didn't introduce ways to increase it").

Pre-audit Age 1 Defense sources: 1 of 17 buildings (Lookout Tower,
+2 passDef), 0 of 7 leaders, 1 of 5 upgrades (VisionScope, +2), 3 of 33
challenges with non-zero defReward.

Edits applied:

- Building `militia_bunkhouse`: `passDef 0 → 1` (dual-stat free starter alternative)
- Building `vehicle_garage`: `passDef 0 → 1` (justify the 5-Scrap price tier)
- Building `perimeter_traps`: `passDef 0 → 1` (passive floor on top of opt-in spend)
- Leader `the_stalwart`: `passiveAtk 1 → 0`, `passDef 0 → 2` (canonical defensive leader, mirrors Warlord's offensive curve at +2)

Net: 4 new Defense-bearing options across the building/leader pool, plus
the existing reactive scaling on Stalwart (+1 def per atk-producing
building when raided). Challenge defRewards left unchanged for this pass.
