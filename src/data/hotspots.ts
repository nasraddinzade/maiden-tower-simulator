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

import { FLOORS, LIFTS, STAIR, TOWER, WALL_LIFTS, WELL, innerRadiusAt } from '../config/tower'
import { azimuthToVector } from '../lib/geometry'
import { approachAzimuthDeg, planAllFlights } from '../lib/staircase'

export type HotspotId =
  | 'cupola-oculus'
  | 'well'
  | 'staircase'
  | 'window-niche'
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
    id: 'window-niche',
    position: insideAt(4, 141, 2.0),
    photo: 'photos/window-niche.jpg',
    interior: true,
    confidence: 'inferred',
  },
  {
    id: 'slits',
    position: outsideAt(141, TOWER.height * 0.5),
    photo: 'photos/slits.jpg',
    interior: false,
    confidence: 'inferred',
  },
  {
    id: 'entrance',
    position: outsideAt(270, 3.0),
    photo: 'photos/entrance.jpg',
    interior: false,
    confidence: 'measured',
  },
  {
    id: 'buttress',
    position: outsideAt(106.7, TOWER.height * 0.35, 9),
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
