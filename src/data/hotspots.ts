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

import { FLOORS, TOWER, WELL, innerRadiusAt } from '../config/tower'
import { azimuthToVector } from '../lib/geometry'

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

export const HOTSPOTS: Hotspot[] = [
  {
    id: 'cupola-oculus',
    position: [0, FLOORS[2].ceilingY - 0.6, 0],
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
    position: insideAt(1, 240),
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
