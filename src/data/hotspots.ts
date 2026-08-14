/**
 * Points of interest (Phase 12).
 *
 * Structure only — every string lives in the `hotspots` locale namespace, per
 * CLAUDE.md. `photo` refers to a file prepared by scripts/prepare_photos.py,
 * which only ever copies freely licensed images and records their attribution.
 *
 * Each hotspot marks a place where the model can be checked against a real
 * photograph, which is the point of the "model / photo" comparison the spec
 * asks for: it lets a viewer see where the reconstruction is evidence and where
 * it is inference.
 */

import {
  BUTTRESS,
  ENTRANCE,
  FLOORS,
  LIFTS,
  PASSAGE_OPENING,
  STAIR,
  TOWER,
  WALL_LIFTS,
  WELL,
  innerRadiusAt,
} from '../config/tower'
import { PLAYER } from '../config/player'
import { azimuthToVector } from '../lib/geometry'
import {
  approachAzimuthDeg,
  planAllFlights,
  stairPassageSections,
} from '../lib/staircase'
import {
  passageEndAnchors,
  planPassageOpenings,
  type OpeningFitting,
  type PassageEndAnchor,
  type PassageOpening,
} from '../lib/passageOpenings'
import windowData from './windows.json'

export type HotspotId =
  | 'cupola-oculus'
  | 'well'
  | 'staircase'
  | 'passage-slit'
  | 'slits'
  | 'entrance'
  | 'buttress'
  | 'section'

export interface Hotspot {
  id: HotspotId
  /** World position of the marker. */
  position: [number, number, number]
  /** Photograph to show beside the render; prepared into public/photos/. */
  photo: string
  /** Whether the marker sits inside the tower (so it can be hidden from outside). */
  interior: boolean
  /**
   * How well the model is actually supported here. Shown to the viewer, because
   * a reconstruction that hides its own uncertainty is misleading.
   */
  confidence: 'measured' | 'inferred' | 'assumed'
}

/** A point on the inner wall of a storey, at eye height. */
function insideAt(floorIndex: number, azimuthDeg: number, up = 1.6): [number, number, number] {
  const f = FLOORS[floorIndex]
  const d = azimuthToVector(azimuthDeg)
  const r = f.innerRadiusAtLevel - 0.4
  return [d.x * r, f.floorY + up, d.z * r]
}

/** A point just off the outer face. */
function outsideAt(azimuthDeg: number, y: number, out = 1.2): [number, number, number] {
  const d = azimuthToVector(azimuthDeg)
  const r = TOWER.outerRadius + out
  return [d.x * r, y, d.z * r]
}

/**
 * The masonry flights, laid out with exactly the arguments components/tower/
 * Staircase.tsx uses. A marker for the stair has to be placed off the same
 * layout the stair is drawn from, or it points at whatever the layout used to be.
 */
const WALL_FLIGHTS = planAllFlights(STAIR, WALL_LIFTS, innerRadiusAt)

/**
 * The ends of the passages, laid out off the same plan.
 *
 * Two window markers used to sit on a written-down azimuth of 141, which was the
 * old single-ladder reading of the photographs and had already gone stale when
 * the lower column moved to 170 on 2026-08-09. Nothing complained, because a
 * marker on blank masonry renders exactly like a marker on an opening. Deriving
 * them is the only fix that stays fixed.
 */
const PASSAGE_ENDS: PassageEndAnchor[] = passageEndAnchors(
  WALL_FLIGHTS,
  stairPassageSections(
    WALL_FLIGHTS,
    STAIR.width,
    PLAYER.stairHeadroom,
    innerRadiusAt,
    TOWER.topY,
    undefined,
    STAIR.doorwayWidth,
  ),
  (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
)

/** Shortest signed difference a − b, in (−180, 180]. */
function angleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

/**
 * THE OPENINGS AS THE APPLICATION CUTS THEM, not as this file remembers them.
 *
 * This used to be a hand-written id — `head-3-4` for the interior marker,
 * `head-6-7` for the exterior one — and an arithmetic copy of where an opening
 * sits on its landing. Both went stale on 2026-08-13, when the stair moved a
 * quarter turn on the owner's testimony: head-3-4 now looks into 10.64 m of
 * buttress and is not cut at all, so the panel claiming "here is where the model
 * can be checked against a photograph" was hung on blank stone. The same fault as
 * the hardcoded 141°, one layer up — a NAME rather than a number, and a name goes
 * stale exactly as quietly.
 *
 * So run the planner. Which ends are open is a [PLACEHOLDER] record standing on a
 * daylight check, and it moves; the markers move with it or they lie.
 */
const OPENINGS: PassageOpening[] = planPassageOpenings({
  anchors: PASSAGE_ENDS,
  fittings: windowData.passageOpenings as OpeningFitting[],
  liftLabel: (i) => ({
    from: WALL_LIFTS[i].fromFloorNumber,
    to: WALL_LIFTS[i].toFloorNumber,
  }),
  cfg: PASSAGE_OPENING,
  buttress: BUTTRESS,
  outerRadius: TOWER.outerRadius,
  // the same two bounds App.tsx passes; see the note there on the unresolved
  // buttress head
  buttressTopY: Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY),
  towerTopY: TOWER.topY,
})

const BUILT_OPENINGS = OPENINGS.filter((o) => o.built)
if (BUILT_OPENINGS.length === 0) {
  // loud on purpose, exactly like MASONRY_OCULI below: with nothing cut there is
  // no opening for either window marker to stand on, and a marker on stone is
  // indistinguishable from a marker on a hole once it is rendered
  throw new Error('hotspots: no passage end is cut; the window markers have nothing to mark')
}

/**
 * The opening the INTERIOR marker stands at: the lowest one that is cut.
 *
 * A rule, not a name. Lowest because the marker is meant to be met early in the
 * climb and because the lower the landing the thicker the wall it is cut through,
 * which is what the reveal is there to show.
 */
const INTERIOR_SLIT = BUILT_OPENINGS.reduce((low, o) => (o.centreY < low.centreY ? o : low))

/**
 * The opening the EXTERIOR marker stands off: the one FARTHEST ROUND FROM THE
 * BEAK, ties broken upward.
 *
 * Also a rule, and the reason is the camera rather than the building. This marker
 * hangs 1.2 m outside the drum face, and on a bearing the pier covers that point
 * is inside ten metres of solid stone. The daylight check already refuses to cut
 * such an end, so any built opening is safe in principle — but head-6-7 is
 * currently open by 0.129° (azimuth 113.629 against a pier edge at 113.500), and
 * a marker whose position is decided by the fourth significant figure of an OSM
 * trace is not a place to stand a camera. Farthest from the beak is the one
 * choice that cannot be made wrong by a small correction to it.
 *
 * [2026-08-15] That rule now has arithmetic under it rather than an eye: 0.129°
 * is 18.6 mm on the drum face — the note used to say 14, which was wrong — against
 * a trace whose own nodes scatter ±30 mm. The opening is flagged
 * `pier.insideDatumError` and the model says so to the viewer; see
 * lib/passageOpenings.ts → pierEdgeReading(). This marker's rule is unchanged and
 * needs to be: it picks foot-8-9 at azimuth 218.5, 112° round from the beak, and
 * it would go on avoiding head-6-7 even if the flag were someday cleared.
 */
const EXTERIOR_SLIT = BUILT_OPENINGS.reduce((best, o) => {
  const gap = Math.abs(angleDelta(o.azimuthDeg, BUTTRESS.azimuthDeg))
  const bestGap = Math.abs(angleDelta(best.azimuthDeg, BUTTRESS.azimuthDeg))
  if (Math.abs(gap - bestGap) < 1e-9) return o.centreY > best.centreY ? o : best
  return gap > bestGap ? o : best
})

/**
 * A point in a chamber, facing the doorway onto the flight that climbs out of it.
 *
 * DERIVED, and it replaces a hardcoded 240°. Storey 2 has exactly one stair
 * feature in its wall — the way onto the 2→3 flight — and the layout puts that
 * doorway at about 194°. The marker stood 46° round the drum from it, on blank
 * masonry, which defeats the whole point of a hotspot: the panel it opens says
 * "here is where the model can be checked against a photograph".
 *
 * Deriving it also means it tracks STAIR.startAzimuthDeg, which is a
 * [PLACEHOLDER] — the moment anyone learns where the first flight really begins,
 * every flight rotates and a written-down azimuth would drift off again silently.
 *
 * It is the DOORWAY's azimuth, not the first tread's: those differ by half a
 * flight width (approachAzimuthDeg), and the doorway is the thing you can stand
 * in front of and photograph.
 */
function atStairDoorway(fromFloorNumber: number): [number, number, number] {
  const i = WALL_LIFTS.findIndex((l) => l.fromFloorNumber === fromFloorNumber)
  const steps = i >= 0 ? WALL_FLIGHTS[i] : []
  if (steps.length === 0) {
    throw new Error(`hotspots: no wall flight leaves storey ${fromFloorNumber}`)
  }
  return insideAt(fromFloorNumber - 1, approachAzimuthDeg(steps, steps[0], STAIR.width))
}

/** Storey indices whose vault is pierced by a modern stair well, not by an oculus. */
const MODERN_STAIR_WELLS = new Set(
  LIFTS.filter((l) => l.kind === 'modernSpiral').map((l) => l.fromFloorNumber - 1),
)

/**
 * The storey whose cupola the oculus marker hangs in.
 *
 * DERIVED from the config, because the storey used to be written down and was
 * wrong: the marker sat in storey 3, whose vault OPENINGS declares CLOSED, so
 * the panel described a hole in a ceiling the model renders as solid stone —
 * one storey below the nearest real opening.
 *
 * Only three vaults are pierced, and storey 1's is the well the modern steel
 * spiral rises through, which config/tower.ts is explicit is not an oculus. Of
 * the two masonry openings left, the marker goes under the wider one: it is the
 * best documented (a bench cross-checks the glass-guard ratio) and the easiest
 * to see from the floor below.
 */
const MASONRY_OCULI = FLOORS.filter(
  (f) => f.oculusRadius > 0 && !MODERN_STAIR_WELLS.has(f.index),
)
if (MASONRY_OCULI.length === 0) {
  // loud on purpose: with no pierced masonry vault there is nothing for this
  // hotspot to mark, and silently pointing it at a closed one is the fault above
  throw new Error('hotspots: no masonry vault is pierced; the oculus marker has nothing to mark')
}
const OCULUS_FLOOR = MASONRY_OCULI.reduce((widest, f) =>
  f.oculusRadius > widest.oculusRadius ? f : widest,
)

export const HOTSPOTS: Hotspot[] = [
  {
    id: 'cupola-oculus',
    // under the crown of a vault that is actually open — see OCULUS_FLOOR
    position: [0, OCULUS_FLOOR.ceilingY - 0.6, 0],
    photo: 'photos/cupola-oculus.jpg',
    interior: true,
    confidence: 'assumed',
  },
  {
    id: 'well',
    position: (() => {
      const d = azimuthToVector(WELL.azimuthDeg)
      return [d.x * WELL.offsetFromAxis, FLOORS[WELL.startsAtFloorIndex].floorY + 0.9, d.z * WELL.offsetFromAxis]
    })(),
    photo: 'photos/well.jpg',
    interior: true,
    confidence: 'measured',
  },
  {
    id: 'staircase',
    // storey 2 — the lowest storey the wall stair serves, the one below it being
    // reached by the modern steel spiral instead
    position: atStairDoorway(2),
    photo: 'photos/staircase.jpg',
    interior: true,
    confidence: 'inferred',
  },
  {
    /*
     * Was 'window-niche', standing inside storey 5 at a written-down azimuth of
     * 141 and describing a stepped recess in the chamber wall. [OWNER] says
     * there is no opening in any chamber wall, so both the place and the subject
     * were wrong. It marks the real thing instead: a slit at an end of a stair
     * passage, seen from the landing it lights.
     *
     * WHICH end is no longer written here. It was `head-3-4` until 2026-08-13,
     * when the stair turned a quarter of the drum and that end went inside the
     * pier. See INTERIOR_SLIT.
     */
    id: 'passage-slit',
    position: (() => {
      const o = INTERIOR_SLIT
      const d = azimuthToVector(o.azimuthDeg)
      // just inside the passage's outer cheek, facing the reveal
      const r = o.cheekRadius - 0.5
      return [d.x * r, o.landingY + PLAYER.eyeHeight, d.z * r] as [number, number, number]
    })(),
    photo: 'photos/window-niche.jpg',
    interior: true,
    confidence: 'inferred',
  },
  {
    id: 'slits',
    position: outsideAt(EXTERIOR_SLIT.azimuthDeg, EXTERIOR_SLIT.centreY),
    photo: 'photos/slits.jpg',
    interior: false,
    confidence: 'inferred',
  },
  {
    id: 'entrance',
    // read from the config, not written out: 270 is [İçərişəhər]'s compass word
    // and it has already been 135 in this repository's history
    position: outsideAt(ENTRANCE.azimuthDeg, 3.0),
    photo: 'photos/entrance.jpg',
    interior: false,
    confidence: 'measured',
  },
  {
    id: 'buttress',
    /*
     * Also read from the config, and since 2026-08-13 it matters more than it
     * did. BUTTRESS.azimuthDeg is the bearing STAIR.startAzimuthDeg is derived
     * FROM, so a survey correcting the [OSM] trace now turns the whole stair and
     * every opening with it. A marker that kept its own copy of 106.7 would be
     * the one thing on screen still pointing at the old beak.
     */
    position: outsideAt(BUTTRESS.azimuthDeg, TOWER.height * 0.35, 9),
    photo: 'photos/buttress.jpg',
    interior: false,
    confidence: 'measured',
  },
  {
    id: 'section',
    position: [0, innerRadiusAt(0) * 0 + TOWER.height + 3.2, 0],
    photo: 'photos/section.jpg',
    interior: false,
    confidence: 'inferred',
  },
]
