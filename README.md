# Qız Qalası — Maiden Tower simulator

A first-person walkthrough of the Maiden Tower in Baku, built as a **scholarly
reconstruction rather than a game**: every dimension is traceable to a source, and
where the sources disagree the model says so instead of picking a winner.

Educational, non-commercial.

## What makes it a reconstruction and not a model

All geometry is procedural, generated from a single source of truth —
[`src/config/tower.ts`](src/config/tower.ts). Every number there carries a
provenance tag:

| tag | meaning |
|---|---|
| `[ICOMOS 958]` | UNESCO/ICOMOS evaluation report |
| `[İçərişəhər]` | the reserve's own published figures |
| `[ref]` | `docs/maiden-tower-reference.md` |
| `[OSM]` | measured off the OpenStreetMap footprint |
| `[PHOTO]` | measured off a photograph, method recorded in the comment |
| `[ASSUMPTION]` | not in any source; the reasoning is written out |
| `[PLACEHOLDER]` | a value is needed to build at all, and nobody knows it |

Conflicts are recorded, not resolved by preference. Two examples that survive in
the model today:

- The buttress axis measures **106.7°**, which misses the equinox sunrise by
  16.6°. The astronomical reading of the buttress therefore fails on the
  measured geometry, and the app shows it failing.
- The stair's start azimuth (`[PLACEHOLDER]`) and the window azimuths (± 20° of
  stated systematic error) collide at storey 6. The clash is left visible rather
  than tuned away.

## Running it

```bash
npm install
npm run dev
```

`npm test` runs the suite. Tests cover **mathematics only** — geometry, azimuths,
solar position, and the collision guards. The renderer is not tested.

**F3** shows the performance budget against its targets, **F4** draws every
collider over the geometry. Both keys work in the built site; neither overlay is
open unless asked for. The F3 figures are a whole frame — every render pass in
it, not the last one — which is not a detail: while the axis gizmo was mounted it
drew a second pass of its own and the readout spent the entire orbit view
reporting that pass's nine draw calls instead of the frame's ninety-five. See
[`src/lib/frameCounters.ts`](src/lib/frameCounters.ts).

The survey aids — the ground grid, the axes cross, the corner axis gizmo — are
for a development build only ([`src/lib/surveyAids.ts`](src/lib/surveyAids.ts)),
along with the `leva` tuning panel. They are instruments for building the tower,
and they had been shipping to the public site.

## Layout

```
docs/                   sources — do not edit without the owner's say-so
src/config/tower.ts     the single source of truth for geometry
src/config/perf.ts      performance budget
src/lib/                pure maths, covered by tests
src/components/tower/   procedural geometry
src/data/               hypotheses, hotspots, windows (hand-edited JSON)
src/locales/            az (default), en, ru
```

Collision geometry is built from primitives in
[`src/lib/collision.ts`](src/lib/collision.ts) and is deliberately **separate
from the drawn mesh** — the CSG result is not watertight, and a trimesh collider
off it let the walker pass through walls.

## Photographs

The images in `public/photos/` are CC BY-SA or CC0 and every one is credited in
[`src/data/attribution.json`](src/data/attribution.json) with author, licence and
source page, and the application shows them to the visitor. Attribution is a
licence condition, not a courtesy — see [`NOTICE`](NOTICE).

`reference-photos/` is git-ignored: it holds working material fetched by the
scripts, including a `_research-only/` folder whose contents are **not** free and
must never enter the build or the attribution list.

The fetch scripts need a real contact address in the Wikimedia User-Agent —
without one Wikimedia answers 403 in a way that looks like an empty result:

```bash
set WIKIMEDIA_UA=MaidenTowerRecon/1.0 (educational reconstruction; you@example.org)
```

## Language

Azerbaijani is the default, with English and Russian. All strings go through
i18next; Azerbaijani is written with full diacritics (ə, ğ, ı, ö, ş, ü, ç).
Historical terms are never machine-translated — untranslated entries are marked
`TODO_AZ` and wait for a native speaker.

## Licence

Two licences, because the code and the research are different things.

| | licence | what it covers |
|---|---|---|
| **Code** | [Apache-2.0](LICENSE) | `src/` — the procedural geometry, the physics, the interface |
| **Data and documentation** | [CC BY 4.0](LICENSE-DATA) | `src/config/`, `src/data/`, `docs/`, this README — the dimensions, their provenance, and the record of what is unresolved |

Copyright 2026 Ramin Nəsrəddinzadə.

The split is deliberate. The valuable part of this project is not the renderer —
it is the record of which figures are measured, which are estimated, which are
placeholders, and what single observation would settle each one. That record is
meant to be reused by anyone documenting a monument whose sources are
incomplete, so it carries the licence that scholarship uses rather than the one
software uses.

**If you use a figure from here, carry its provenance tag with it.** A number
separated from the record of how it was obtained is the thing this project
exists to prevent.

The photographs are neither: they belong to their photographers, under their own
CC BY-SA and CC0 terms, and nothing here relicenses them. See
[`NOTICE`](NOTICE).
