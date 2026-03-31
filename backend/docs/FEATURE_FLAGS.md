# Feature Flags (Stable vs Experimental)

This project now supports reusable backend feature flags for safely testing new features without impacting stable behavior.

## Storage

- Collection: `feature_flags`
- Global document shape:
  - `scope: "global"`
  - `flags: { [flagId]: boolean }`
  - `updatedAt`

## Service API

- File: `backend/modules/feature-flags/feature-flags.service.js`
- Main method:
  - `isFeatureEnabled(flagId, { defaultValue, envVar })`

Evaluation order:
1. Optional env override (`envVar`) if present (`true/false`, `1/0`, `on/off`)
2. DB flag in `feature_flags`
3. `defaultValue`

## PAMM wiring example

PAMM now checks global flag first, then legacy PAMM flag fallback:
- Flag: `pamm_global_kill_switch`
- Env override: `FEATURE_PAMM_GLOBAL_KILL_SWITCH`

This keeps existing behavior intact while allowing centralized rollout control for new features.

## Safe rollout pattern

1. Add new feature code behind a dedicated flag (default `false`)
2. Test in staging by enabling that flag only in staging DB
3. Keep production flag `false` until signoff
4. Enable in production gradually
