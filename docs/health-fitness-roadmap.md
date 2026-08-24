# LyfeOS Health & Fitness Domain Roadmap

> **Superseded for execution detail:** use [the feature-parity and holistic-advantage roadmap](health-fitness-feature-parity-roadmap.md) as the canonical backlog, phase gates, data-governance contract, and source register. This document preserves the original domain framing.

**Status:** desired-end-state roadmap. This is a first-class LyfeOS domain, not a thin integration with a nutrition or wearable vendor.

## 1. Product decision

LyfeOS must provide the everyday native utility users expect from a food, training, and recovery app while making the information useful inside the wider personal operating system.

The standard is not to copy Cronometer or MyFitnessPal screens. The standard is to let a person reliably record food, nutrition, hydration, supplements, body metrics, workouts, activity, and recovery; understand their own trends; and use those facts as consented context for planning. Health data remains private by default. LyfeOS records what the user logged or what an authorized source delivered; it does not diagnose, prescribe, or make causal claims.

## 2. Current starting point

Already present:

- daily wake/sleep time and self-reported mental, physical, and emotional state;
- health, fitness, nutrition, and recovery mission categories;
- health-detail and Tracker visualizations with a guarded sleep/daily-state co-occurrence view;
- onboarding health baseline fields, health-oriented AI knowledge, and generic progress trackers.

Missing:

- food diary, food catalog, barcode lookup, recipes, meals, nutrient computations, and nutrition targets;
- hydration, supplement, fasting, and meal timing records;
- workout programs, exercise library, training sessions, sets, repetitions, loads, RPE, cardio, volume, and PRs;
- measurements, body-composition history, progress photographs, and goal forecasts;
- normalized wearable/activity data and source provenance;
- health-domain privacy, revocation, reconciliation, retention, and medical-safety controls.

## 3. Outcome and non-negotiable rules

### Outcome

One Health & Fitness surface gives the player a trustworthy daily record and a clear answer to:

1. What did I eat and how does it compare with my chosen targets?
2. What did I train, how did it progress, and what should I do next?
3. What activity, sleep, and recovery data is actually available, from which source, and how complete is it?
4. How is the record trending over time without pretending correlation is medical or causal truth?
5. What private health facts may influence my LyfeOS plan, and what—if anything—may leave LyfeOS?

### Rules

- **Local authority:** LyfeOS owns its health-domain read model, user-entered records, targets, privacy preferences, and personal planning transitions.
- **Provenance first:** every imported or calculated value identifies its source, capture time, unit, transformation, and confidence/quality state.
- **No duplicate activity math:** a normalized source-selection policy prevents a wearable, phone, and manual entry from each counting the same steps or energy burn.
- **No medical posture:** no diagnosis, treatment, clinical recommendation, eating-disorder coaching, or automatic medication/supplement advice. Show general educational content only with scope and source boundaries.
- **Consent before use:** health data is private by default; health context is disabled for AI and federation unless separately, granularly enabled by the user.
- **Truthful gamification:** nutrition/training adherence and logged action can earn activity XP; real-world competence and health outcomes cannot be inferred from a streak, calorie total, or workout click.
- **No provider theatre:** an integration is unavailable until OAuth/authorization, scopes, import, reconciliation, revoke, and failure UX work end to end.

## 4. Capability map

| Capability | Native LyfeOS requirement | Parity reference | LyfeOS differentiation |
| --- | --- | --- | --- |
| Nutrition diary | date, meal, food, serving, unit, timestamp, notes, quick add, copy/recent/favorite | food diary | links meals to daily plan, energy, capacity, and intentional missions |
| Food intelligence | searchable catalog, verified-source labels, branded/generic foods, barcode lookup, custom foods | food database and barcode scan | provenance and user correction history are visible |
| Nutrition computation | calories, macro and micronutrients, fiber, sodium, selected nutrient visibility, daily/meal totals | Cronometer-style nutrient targets | no hidden nutrition score; formulas and missing-data coverage are inspectable |
| Recipes and meals | ingredient recipe, servings/yield, saved meal, edit/version/retire behavior | custom recipes/meals | repeatable personal rituals and grocery/planning links later |
| Targets | energy, macro, nutrient, hydration, body-weight and schedule/day templates | goals and macro scheduling | targets can be connected to a user-owned objective; defaults are recommendations, never diagnoses |
| Hydration, fasting, supplements | quick log, timing, dose/unit, notes, source | daily habit tracking | supplement records stay private and never become automated medical advice |
| Training log | program, workout template, exercise, set, reps, load, duration, RPE/RIR, cardio metrics, rest and notes | strength/cardio diary | training evidence can support a user-selected movement capability without certifying fitness expertise |
| Training progression | volume, estimated one-rep-max only when clearly labeled, PRs, adherence, deload/manual adjustment | workout routines and progress | recommendations remain proposed missions, never autonomous training prescriptions |
| Measurements | weight, circumference, body-fat percentage if user supplies it, optional private photos, trends | weight/measurement progress | all values are source-tagged; no body-image scoring |
| Sleep and recovery | manual and authorized-import records, quality/completeness labels, subjective recovery | device and habit tracking | feeds capacity planning only when the user enables it |
| Activity and wearables | steps, distance, active energy, workouts, heart-rate summaries only when authorized | connected devices | canonical-source and deduplication policy avoids false totals |
| Insight and reports | daily summary, weekly review, trends, observed associations, export | nutrition reports/trends | confidence/coverage shown with every insight; no causal or medical claim |

## 5. Data architecture

The domain needs additive, user-scoped records; generic JSON trackers are not enough for auditable calculation and sync.

### Core profile and targets

- `health_profiles`: units, date/timezone, age-band/sex/life-stage only if voluntarily supplied, height, activity-baseline assumptions, and calculation disclosure.
- `health_targets`: target kind, value/unit, effective date range, schedule/template, source (`user`, `professional`, `calculated`), calculation/version, and user confirmation.
- `health_goal_snapshots`: immutable target and baseline snapshot used by a forecast or plan.

### Nutrition

- `food_catalog_items`: provider/source identifier, food type, brand, barcode, servings, nutrient payload version, verification state, and source-license metadata.
- `custom_foods`: private user food definitions and nutrition-label entries.
- `recipes`, `recipe_ingredients`, and `saved_meals`: versioned composition, yield, servings, and retire-not-delete behavior that preserves diary history.
- `nutrition_diary_entries`: date/time, meal slot, food/recipe/custom reference, quantity, unit, nutrient snapshot, source and edit history.
- `hydration_entries`, `supplement_entries`, and `fasting_windows`: separately typed so they cannot be misread as food or clinical records.

### Training and body

- `exercise_catalog_items` and `custom_exercises`: movement metadata, modality, equipment, and safety notes without universal prescriptions.
- `training_programs`, `workout_templates`, `workout_template_items`: user-owned plans and explicit revisions.
- `workout_sessions`, `workout_sets`, `cardio_efforts`: actual completion facts, performed values, perceived effort, source, and notes.
- `body_measurements` and `body_progress_media`: observation date, metric/unit, source, privacy level, optional artifact reference; private photos never enter AI context by default.

### Import, audit, and quality

- `health_connections`: provider, encrypted credential reference, scopes, sync status, last successful sync, revoke time, and error summary.
- `health_source_records`: immutable normalized raw-reference metadata, provider event identifier, observed/received time, payload fingerprint, and deletion/reconciliation status.
- `health_metrics`: normalized daily or sampled values with metric type, value/unit, canonical-source flag, quality, and source-record link.
- `health_sync_cursors` and `health_data_deletions`: idempotent import/retry and deletion/audit support.

All health tables must have user ownership, indexes by `(user_id, observed_at)`, idempotency/unique constraints for provider records, and account-export/delete coverage.

## 6. Domain services and contracts

1. **Nutrient engine:** unit conversion, serving arithmetic, nutrient aggregation, target comparison, missing-nutrient coverage, and deterministic formula versions.
2. **Energy ledger:** keeps intake, exercise/activity energy, and optional target policy separate. LyfeOS must not silently add exercise calories to a food target; the user chooses the policy and sees the formula.
3. **Training engine:** aggregates volume and adherence from recorded sets/sessions. It may calculate descriptive summaries; recommendations require explicit user approval.
4. **Metric normalizer:** converts source units/time zones, retains originals, selects a canonical source per metric/day, and flags conflicts instead of merging blindly.
5. **Source-quality service:** shows manual/imported/estimated values, coverage, freshness, duplicates, and unavailable fields.
6. **Health privacy service:** governs AI eligibility, export, deletion, provider revocation, and cross-product sharing. Federation starts with no health payloads.
7. **Health-to-planning adapter:** supplies only the consented, explainable context needed for capacity-aware planning; it never changes missions or targets without approval.

## 7. User experience

### Daily Health Hub

The new Health route is the domain home—not another dashboard widget. It opens on Today with:

- calorie/energy, macro, and selected-nutrient progress;
- meal timeline and fast food logging;
- water, supplements, fasting, steps/activity, sleep/recovery, and workout cards;
- one clear data-quality/status strip showing manual versus connected sources;
- a private-by-default explanation of what can influence planning today.

### Deep workspaces

- **Nutrition:** diary, foods, recipes/meals, targets, reports.
- **Training:** plan, today’s workout, history, progression, exercises.
- **Body & Recovery:** measurements, photos, sleep, activity, recovery, trends.
- **Connections & privacy:** providers, permissions, sync health, source priority, export/delete/revoke.

The existing Health Detail page becomes a redirect or summary to the Health Hub after migration; existing sleep/state history remains readable.

## 8. Build sequence and acceptance gates

### Phase HF-0 — Product and safety contract

Define data classes, country/food-data scope, source licensing, units, calculation formulas, health-AI boundaries, high-risk language policy, deletion/revocation behavior, and initial provider order.

**Exit gate:** approved data dictionary, health privacy notice, source-license decision, and test fixtures. No food catalog or provider credential is added before this gate.

### Phase HF-1 — Health foundation and measurements

Add health profile, targets, measurement history, private media handling, units, source/provenance types, migration, export/delete, and a minimal Health Hub shell.

**Exit gate:** a user can record/edit/delete/export weight and selected measurements with unit conversion and an accurate trend; no clinical inference appears.

### Phase HF-2 — Native nutrition diary

Add meal slots, manual/quick nutrition entries, serving/unit conversion, daily energy and macro totals, favorites/recent/copy, hydration, and user-selected targets.

**Exit gate:** a user can complete a full day of meals without any external provider; totals remain deterministic after edits, time-zone changes, export, and account deletion.

### Phase HF-3 — Food catalog, custom foods, recipes, and barcode

Integrate a legally permitted food-data source through an adapter; add source labels, search ranking, barcode resolution, custom foods, recipes, saved meals, and retirement/version behavior.

**Exit gate:** every diary entry has a source or private custom definition; an unknown barcode never fabricates nutrition; recipe edits do not rewrite historic diary nutrients without an explicit user choice.

### Phase HF-4 — Micronutrients, meal planning, and reporting

Add nutrient visibility/targets, macro schedules, nutrient coverage, meal-level breakdown, report views, and careful forecast/goal displays.

**Exit gate:** nutrient calculations include formula/version and data-coverage disclosure; every target can be changed or removed by the user; no recommendation is presented as medical advice.

### Phase HF-5 — Native workout logging

Add exercise catalog, custom exercises, templates/programs, workout sessions, sets/reps/load, RPE/RIR, cardio, notes, PRs, and history.

**Exit gate:** a user can execute a strength or cardio workout offline from a provider; edits/reopens reconcile all derived volume/PR summaries; a completed workout is an activity record, not proof of capability.

### Phase HF-6 — Recovery, activity, and wearable integrations

Add health connections, OAuth/token custody, import cursors, normalized source records, source priority, conflict/deduplication policy, re-sync, revoke, and failure/status UX. Start with one platform per data family, not every provider at once.

Recommended order: Health Connect/Android and Apple Health through an appropriate mobile bridge when native clients exist; then one recovery/activity provider chosen from actual user demand (for example Oura, Garmin, Whoop, or Strava).

**Exit gate:** connect → import/backfill → display provenance → update → disconnect/revoke → delete is proven end to end for one provider. Imported data does not double-count manual data.

### Phase HF-7 — Insight, planning, and gamified progression

Add explicitly non-causal trend views, data-quality labels, user-authored health missions, consented capacity context, and skill-graph mapping for intentionally selected movement/nutrition practices.

**Exit gate:** every health insight identifies its observation window, inputs, coverage, and uncertainty; user can disable its use in planning; XP rewards logging/adherence only and capability promotion still requires the normal evidence/review rules.

### Phase HF-8 — AI, ecosystem, and production qualification

Add governed AI assistance for diary/workout drafting, food/label/image suggestions that require confirmation, and private-source citations. Only after health privacy and federation contracts mature, consider a coarse consented capacity signal; raw food, biometrics, body photos, and detailed health records never leave LyfeOS by default.

**Exit gate:** red-team privacy tests, deletion/revocation test, food/AI error handling, provider recovery test, accessibility/device test, performance budget, and an end-to-end live acceptance run.

## 9. Integration policy

Native entry must work without an integration. Providers improve convenience; they do not become the system of record by accident.

| Integration class | What may enter LyfeOS | Required controls |
| --- | --- | --- |
| Food-data/catalog provider | food metadata, servings, nutrition facts, barcode match | license review, source attribution, cache/retention policy, unknown-result fallback |
| Wearable/activity provider | user-authorized activity, workout, sleep, and recovery summaries | OAuth/credential vault, narrow scopes, idempotent cursor, source priority, revoke/reconcile |
| Device health platform | user-authorized phone/wearable metrics | platform permission UI, mobile bridge, precise metric selection, backfill limits, deletion semantics |
| AI/image/label assist | proposed food/serving only | confirmation before persistence, no hidden logging, confidence/source display, no medical inference |

## 10. Testing and release evidence

Each phase needs pure calculation tests, route/auth ownership tests, migration tests, visual/accessibility checks, and an acceptance scenario. The full Health & Fitness release is not complete until these journeys pass in the target environment:

1. Set units, targets, and privacy preferences.
2. Log a meal manually, from catalog, and from a recipe; correct a serving; confirm daily/meal totals and export.
3. Log water, fasting, supplement, body metric, and a workout; edit and reopen each; confirm derived summaries reconcile.
4. Connect the first provider, import a bounded backfill, confirm provenance/deduplication, revoke it, and verify no further sync.
5. Disable health context for AI and planning; prove private data is absent. Re-enable a narrow context and prove only the agreed summary is used.
6. Complete a health-related mission with evidence and verify it follows the existing review/progression model without claiming health outcomes or professional competence.
7. Delete the account from an isolated environment and verify provider connection records, derived health records, media references, and exports follow the approved policy.

## 11. Explicit deferrals

Do not add these until the foundation and safety gates are proven:

- medical diagnosis, medication management, clinical treatment plans, or emergency advice;
- public body comparison, calorie competitions, weight-loss leaderboards, or body-image scoring;
- automatic calorie compensation or adaptive targets without a visible user-selected policy;
- automatic meal/workout logging from images or AI text;
- detailed health-data federation with other UMH projections;
- coaching/client/clinician features, unless a separate authorization and compliance model exists.

## 12. Definition of done

Health & Fitness reaches the LyfeOS desired end state when native daily logging, nutrition, training, measurement, recovery/activity, insights, privacy, and selected integrations form one accurate, explainable, user-controlled loop—and that loop can safely inform personal planning without becoming a medical or surveillance product.
