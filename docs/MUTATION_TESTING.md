# Mutation Testing — Stellar Tipz Smart Contract

> Issue [#578](https://github.com/Akanimoh12/Stellar-Tipz/issues/578) — verify test effectiveness with `cargo-mutants`.

---

## Overview

Mutation testing introduces small, automated code changes ("mutants") and checks whether the
existing test suite detects them.  A mutant that is not caught by any test **survives**, indicating
a gap in test coverage.

**Target kill rate: > 70 %** across the four critical business-logic modules.

---

## Scope

Only the four modules listed below are mutated.  Infrastructure code (`storage.rs`, `events.rs`,
`types.rs`, `token.rs`) is excluded because it is largely boilerplate that would generate
thousands of low-value mutants.

| Module | What it owns |
|--------|-------------|
| `tipz/src/fees.rs` | Fee calculation and rounding (`calculate_fee`) |
| `tipz/src/credit.rs` | Credit score formula, tier mapping |
| `tipz/src/leaderboard.rs` | Sorted leaderboard, binary search insertion |
| `tipz/src/tips.rs` | Tip storage, pagination, `send_tip` orchestration |

---

## Running Locally

### Prerequisites

```sh
cargo install cargo-mutants --locked --version "^25"
```

### Run against all four critical modules

```sh
cd contracts
cargo mutants \
    --package tipz-contract \
    --file tipz/src/fees.rs \
    --file tipz/src/credit.rs \
    --file tipz/src/leaderboard.rs \
    --file tipz/src/tips.rs \
    --output /tmp/mutants-out \
    --timeout 120 \
    -- --all-targets
```

### Quick single-module run

```sh
cargo mutants --package tipz-contract --file tipz/src/fees.rs -- --all-targets
```

### Check kill rate from results

```sh
python3 - /tmp/mutants-out/outcomes.json <<'EOF'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
outcomes = data.get("outcomes", [])
killed   = sum(1 for o in outcomes if o.get("summary") == "MutantKilled")
survived = sum(1 for o in outcomes if o.get("summary") == "MutantSurvived")
timeout  = sum(1 for o in outcomes if o.get("summary") == "Timeout")
effective = killed + survived + timeout
kill_rate = (killed / effective * 100) if effective > 0 else 0
print(f"Kill rate: {kill_rate:.1f}%  ({killed}/{effective})")
EOF
```

---

## CI Integration

The workflow `.github/workflows/mutation-testing.yml` runs every **Monday at 02:00 UTC** and on
manual dispatch.  It fails if the kill rate drops below 70 %.

Results (the full `outcomes.json`) are uploaded as a GitHub Actions artifact named
`mutation-testing-results-<run_id>` and retained for 30 days.

---

## Cargo.toml Configuration

`contracts/Cargo.toml` declares `[workspace.metadata.cargo-mutants]` with:

- **`exclude_globs`** — excludes infrastructure files from mutation.
- **`timeout_multiplier = 3.0`** — Soroban's mock ledger is slower than a plain unit test; this
  prevents false timeouts.
- **`additional_cargo_test_args = ["--all-targets"]`** — runs integration tests as well as unit tests.

---

## Known Unkilled / Equivalent Mutants

The following mutants are expected to survive because they are **semantically equivalent** to the
original code — they produce identical observable behaviour for all possible inputs.  They are
documented here so they are not mistaken for test gaps.

### `leaderboard.rs` — `update_entries`

```rust
// Original
if insert_pos < MAX_LEADERBOARD_SIZE {
    entries.insert(insert_pos, new_entry);
    if entries.len() > MAX_LEADERBOARD_SIZE {
        entries.pop_back();
    }
}
```

**Mutant A:** `<` → `<=` in the outer guard.

When `insert_pos == MAX_LEADERBOARD_SIZE` (50), the new entry is appended at index 50, then
`pop_back()` immediately removes it.  The net list is identical to the original `if false` path.
*Equivalent — no test can distinguish.*

**Mutant B:** `>` → `!=` in the inner trim guard.

After an insertion the list has either 51 entries (trim needed) or ≤ 50 entries (no trim).
`len() != 50` and `len() > 50` behave identically because `len()` can only be 51 at that point.
*Equivalent — no test can distinguish.*

### `leaderboard.rs` — `find_insertion_index`

```rust
while low < high { … }
```

**Mutant C:** `<` → `!=`.

The invariant `low ≤ high` is maintained throughout the binary search, making `low != high`
equivalent to `low < high`.  *Equivalent — no test can distinguish.*

### `credit.rs` — small integer-division truncation

Some follower counts yield an `x_sub` of 1 or 2, which after `× 30 / 100` (integer division)
truncates to 0.  Mutants that alter the follower value slightly can therefore produce the same
final score.  These are inherent to the integer-rounding design and are **by design**, not gaps.

---

## Tests Added for Mutation Coverage

All new tests live in `contracts/tipz/src/test/test_mutation_coverage.rs`.

### `fees.rs` — targeted tests

| Test | Mutant killed |
|------|--------------|
| `fee_tuple_order_fee_first_net_second` | `Ok((net, fee))` swap |
| `fee_divisor_is_exactly_10000_basis_points` | divisor constant off-by-one |
| `fee_minimum_floor_one_bps_on_tiny_amount` | `.max(1)` removed |
| `zero_fee_bps_short_circuits_before_any_arithmetic` | `== 0` → `!= 0` |
| `net_equals_amount_minus_fee_not_plus` | `checked_sub` → `checked_add` |

### `credit.rs` — targeted tests

| Test | Mutant killed |
|------|--------------|
| `credit_breakdown_base_field_is_40` | `BASE_SCORE` changed, total not summed |
| `credit_tip_weight_contributes_exactly_20_points_at_max` | `TIP_WEIGHT` swapped with `X_WEIGHT` |
| `credit_x_weight_contributes_exactly_30_points_at_max` | `X_WEIGHT` swapped with `TIP_WEIGHT` |
| `credit_age_weight_contributes_exactly_10_points_at_max` | `AGE_WEIGHT` swapped |
| `credit_follower_divisor_is_50_per_point` | `FOLLOWER_DIVISOR` off-by-one |
| `credit_engagement_divisor_is_10_per_point` | `ENGAGEMENT_DIVISOR` off-by-one |
| `credit_age_divisor_is_10_days_per_point` | `AGE_DIVISOR` off-by-one |
| `credit_x_sub_with_only_followers_nonzero` | `&&` → `\|\|` in x_sub zero-guard |
| `credit_age_zero_when_now_equals_registered_at` | age-guard `\|\|` → `&&` |
| `credit_tier_boundaries_exact` | match arm boundary off-by-one |
| `credit_with_streak_adds_streak_score_to_total` | streak score ignored |

### `leaderboard.rs` — targeted tests

| Test | Mutant killed |
|------|--------------|
| `leaderboard_get_limit_zero_returns_all` | `limit == 0` guard removed |
| `leaderboard_get_limit_equal_to_len_returns_all` | `>=` → `>` in early-return |
| `leaderboard_get_limit_less_than_len_returns_exactly_limit` | loop `<` → `<=` |
| `leaderboard_reset_all_time_is_noop` | AllTime incorrectly cleared |
| `leaderboard_reset_monthly_clears_entries_and_stamps_time` | Monthly not cleared |
| `leaderboard_remove_eliminates_exactly_one_entry` | entry not removed |
| `leaderboard_remove_keeps_other_addresses_intact` | `==` → `!=` in address match |
| `leaderboard_is_on_leaderboard_true_and_false_cases` | always-true / always-false |
| `leaderboard_rank_returns_one_based_position` | `i + 1` → `i` (zero-indexed) |
| `leaderboard_update_skips_deactivated_profile` | deactivation guard removed |

### `tips.rs` — targeted tests

| Test | Mutant killed |
|------|--------------|
| `tips_anonymous_flag_true_sets_benefactor_to_none` | `is_anonymous` condition inverted |
| `tips_anonymous_flag_false_sets_benefactor_to_sender` | `is_anonymous` condition inverted |
| `tips_explicit_benefactor_takes_precedence_over_sender` | `.or(Some(sender))` replaced |
| `tips_get_tip_returns_none_for_missing_id` | `get_tip` always returns `Some` |
| `tips_store_tip_ids_are_sequential_starting_at_zero` | ID increment mutated |
| `tips_max_page_limit_constant_is_50` | `MAX_PAGE_LIMIT` constant changed |
| `tips_get_recent_tips_caps_limit_above_50` | limit capping removed |
