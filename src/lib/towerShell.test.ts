import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BUTTRESS, ENTRANCE, FLOORS, TOWER, innerRadiusAt, wallThicknessAt } from '../config/tower'
import { azimuthToVector } from './geometry'
import windowData from '../data/windows.json'
import type { WindowSpec } from './windows'
import {
  buildShellGeometry,
  innerRadiusProfileAt,
  outerRadiusProfileAt,
  windowCutter,
  type ShellParams,
} from './towerShell'

const PARAMS: ShellParams = {
  buttressAzimuthDeg: BUTTRESS.azimuthDeg,
  buttressProjection: BUTTRESS.projection,
  buttressTipWidth: BUTTRESS.tipWidth,
  buttressRootArcDeg: BUTTRESS.rootArcDeg,
  buttressSkewDeg: BUTTRESS.skewDeg,
  buttressHeight: TOWER.height,
  entranceAzimuthDeg: ENTRANCE.azimuthDeg,
  entranceWidth: ENTRANCE.width,
  entranceHeight: ENTRANCE.height,
  entranceSillY: ENTRANCE.sillY,
}

const built = buildShellGeometry(PARAMS)

describe('shell mesh quality', () => {
  it('has no degenerate triangles (a collider is attached in Phase 6)', () => {
    expect(built.stats.degenerateCount).toBe(0)
  })
  it('is indexed and non-trivial', () => {
    expect(built.geometry.index).not.toBeNull()
    expect(built.stats.triangleCount).toBeGreaterThan(500)
  })
  it('has finite vertex normals everywhere', () => {
    const n = built.geometry.attributes.normal.array
    for (let i = 0; i < n.length; i++) expect(Number.isFinite(n[i])).toBe(true)
  })
})

describe('shell bounding box', () => {
  const bb = built.geometry.boundingBox!

  it('spans from below the street up to the full tower height', () => {
    /*
     * The drum used to start at y = 0, the floor of storey 1 and the level the
     * doorway opens onto. That is not the ground: the entrance is RAISED, and
     * once the paving was put where the sourced sill height says it is, the
     * tower stood on a two-metre gap with daylight under the wall. It now
     * carries on down past the street, which [ICOMOS 958] supports — the
     * foundation goes some 15 m below ground.
     */
    expect(bb.min.y).toBeLessThan(ENTRANCE.groundY + 1e-6)
    expect(bb.max.y).toBeCloseTo(TOWER.height, 5)
  })

  it('keeps the plain drum radius on the side away from the buttress', () => {
    expect(bb.min.x).toBeCloseTo(-TOWER.outerRadius, 1)
  })

  it('reaches the buttress tip where the azimuth puts it', () => {
    const reach = TOWER.outerRadius + BUTTRESS.projection
    const dir = azimuthToVector(BUTTRESS.azimuthDeg)
    expect(bb.max.x).toBeCloseTo(dir.x * reach, 0)
  })
})

describe('window cutter flares the right way', () => {
  const w = {
    azimuthDeg: 141,
    centreY: 10,
    outerWidth: 0.4,
    outerHeight: 1.9,
    innerWidth: 1.5,
    innerHeight: 2.4,
  }

  /** Tangential half-spread of the cutter's vertices, bucketed by radius. */
  function spreadByRadius(geom: ReturnType<typeof windowCutter>) {
    const pos = geom.attributes.position
    const a = (w.azimuthDeg * Math.PI) / 180
    // unit vector along the wall (perpendicular to the window's bearing)
    const tx = Math.cos(a)
    const tz = Math.sin(a)
    let nearOuter = 0
    let nearInner = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      const tangential = Math.abs(x * tx + z * tz)
      if (r > TOWER.outerRadius) nearOuter = Math.max(nearOuter, tangential)
      if (r < innerRadiusAt(w.centreY) + 0.5) nearInner = Math.max(nearInner, tangential)
    }
    return { nearOuter, nearInner }
  }

  it('is NARROW at the outer face and WIDE at the room side', () => {
    const { nearOuter, nearInner } = spreadByRadius(windowCutter(w))
    expect(nearOuter).toBeGreaterThan(0)
    expect(nearInner).toBeGreaterThan(nearOuter)
  })

  it('matches the configured outer and inner widths', () => {
    const { nearOuter, nearInner } = spreadByRadius(windowCutter(w))
    expect(nearOuter).toBeCloseTo(w.outerWidth / 2, 1)
    expect(nearInner).toBeCloseTo(w.innerWidth / 2, 0)
  })
})

/**
 * Clear span of a void — or of a bare cutting tool, which is the same surfaces
 * seen from the other side — on a window's bearing, where it crosses the plane
 * `depth` metres out from the tower axis.
 *
 * Rays, not vertex positions: the fault these guard against lived BETWEEN the
 * tool's vertex rings. Its two ends carried exactly the specified sections and
 * every plane in between, including both faces of the wall, did not, so any
 * check that only reads vertices agrees with a tool that is wrong everywhere it
 * touches masonry.
 *
 * `depth` is the coordinate along the bearing (P·d), not the distance from the
 * axis. That is the coordinate the cutter's sections are defined on; the two
 * differ by 0.4 mm at a 0.4 m slit's jamb and the sections are constant there.
 */
function clearSpan(
  geometry: THREE.BufferGeometry,
  azimuthDeg: number,
  depth: number,
  y: number,
  axis: 'tangential' | 'vertical' = 'tangential',
): number {
  // DoubleSide: a ray crossing a solid leaves through a back face, and the exit
  // is half the measurement.
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  mesh.updateMatrixWorld(true)

  const a = (azimuthDeg * Math.PI) / 180
  const along =
    axis === 'vertical'
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) // tangential, along the wall
  const d = azimuthToVector(azimuthDeg)
  const centre = new THREE.Vector3(d.x * depth, y, d.z * depth)

  const REACH = 3 // m either side — past the opening but not round the drum
  const raycaster = new THREE.Raycaster(
    centre.clone().addScaledVector(along, -REACH),
    along,
    0,
    2 * REACH,
  )
  // signed offsets from the opening's centre line
  const hits = raycaster.intersectObject(mesh, false).map((h) => h.distance - REACH)
  const before = hits.filter((s) => s < 0)
  const after = hits.filter((s) => s > 0)
  if (before.length === 0 || after.length === 0) return NaN
  // the two surfaces that straddle the centre line; anything farther out is the
  // drum, the buttress or another opening
  return Math.min(...after) - Math.max(...before)
}

describe('the reveal splays face to face, not across the tool overshoot', () => {
  /*
   * The cutting prism runs a metre past each face of the wall so the boolean
   * never has to resolve a coplanar surface, and it used to taper across that
   * dead length as well: the section arriving at the outer face had already been
   * widened by the overshoot in front of it, by (innerWidth/outerWidth − 1) /
   * depth. Worst where the wall is thinnest — storey 8's 0.40 m slits came out
   * 0.59 m outside, 47% wider than data/windows.json asks for, while the same
   * error left the room-side mouth short of innerWidth.
   *
   * Heights are spread over the taper on purpose: the splay is governed by the
   * wall thickness AT THAT HEIGHT, so a tool that gets the outer width right at
   * one level and not another is exactly the bug coming back.
   */
  const HEIGHTS = [0, 10, 20, TOWER.topY - 1]
  const slit = (centreY: number) => ({
    azimuthDeg: 141,
    centreY,
    outerWidth: 0.4,
    outerHeight: 1.9,
    innerWidth: 1.5,
    innerHeight: 2.4,
  })

  it('samples heights where the wall really is a different thickness', () => {
    const thicknesses = HEIGHTS.map((y) => wallThicknessAt(y))
    const spread = Math.max(...thicknesses) - Math.min(...thicknesses)
    expect(spread).toBeGreaterThan(1.0)
    expect(new Set(thicknesses).size).toBe(HEIGHTS.length)
  })

  it.each(HEIGHTS)('is exactly outerWidth at the outer face (y = %s)', (y) => {
    const w = slit(y)
    expect(clearSpan(windowCutter(w), w.azimuthDeg, TOWER.outerRadius, y)).toBeCloseTo(
      w.outerWidth,
      5,
    )
  })

  it.each(HEIGHTS)('is exactly innerWidth at the room-side face (y = %s)', (y) => {
    const w = slit(y)
    expect(clearSpan(windowCutter(w), w.azimuthDeg, innerRadiusAt(y), y)).toBeCloseTo(
      w.innerWidth,
      5,
    )
  })

  it.each(HEIGHTS)('carries the outer section unchanged through the overshoot (y = %s)', (y) => {
    const w = slit(y)
    // half a metre out in fresh air: nothing to cut there, and the tool must not
    // have started flaring before it reaches the stone
    expect(clearSpan(windowCutter(w), w.azimuthDeg, TOWER.outerRadius + 0.5, y)).toBeCloseTo(
      w.outerWidth,
      5,
    )
  })

  it.each(HEIGHTS)('splays linearly in between, over the real wall thickness (y = %s)', (y) => {
    const w = slit(y)
    const wall = wallThicknessAt(y)
    for (const f of [0.25, 0.5, 0.75]) {
      const span = clearSpan(windowCutter(w), w.azimuthDeg, TOWER.outerRadius - f * wall, y)
      expect(span).toBeCloseTo(w.outerWidth + (w.innerWidth - w.outerWidth) * f, 5)
    }
  })

  it.each(HEIGHTS)('gives the head and sill the same treatment (y = %s)', (y) => {
    const w = slit(y)
    const az = w.azimuthDeg
    expect(clearSpan(windowCutter(w), az, TOWER.outerRadius, y, 'vertical')).toBeCloseTo(
      w.outerHeight,
      5,
    )
    expect(clearSpan(windowCutter(w), az, innerRadiusAt(y), y, 'vertical')).toBeCloseTo(
      w.innerHeight,
      5,
    )
  })
})

describe('window openings pierce the wall (Phase 5)', () => {
  const testWindow = {
    azimuthDeg: 141,
    centreY: 10,
    outerWidth: 0.4,
    outerHeight: 1.9,
    innerWidth: 1.5,
    innerHeight: 2.4,
  }
  const pierced = buildShellGeometry({ ...PARAMS, windows: [testWindow] })

  it('still produces a clean mesh with no degenerate triangles', () => {
    expect(pierced.stats.degenerateCount).toBe(0)
    expect(pierced.stats.triangleCount).toBeGreaterThan(0)
  })

  it('removes material — the pierced shell differs from the blind one', () => {
    expect(pierced.stats.triangleCount).not.toBe(built.stats.triangleCount)
  })

  it('opens a hole right through: a ray at the sill finds no wall on that bearing', () => {
    // sample the outer surface finely around the window's azimuth
    const profile = outerRadiusProfileAt(pierced.geometry, testWindow.centreY, 720)
    const at = Math.round(testWindow.azimuthDeg * 2) // 0.5° buckets
    const blind = outerRadiusProfileAt(built.geometry, testWindow.centreY, 720)
    // the blind shell has wall here; the pierced one has the opening
    expect(blind[at]).toBeGreaterThan(TOWER.outerRadius - 0.01)
    expect(profile[at]).toBeLessThan(blind[at])
  })

  it('opens it to the width the data asks for, not to the tool overshoot', () => {
    /*
     * The same check as the cutter tests above, but on the boolean result, so a
     * tool that is right and a subtraction that loses it cannot both pass.
     * Measured 5 cm inside the outer face because that is the nearest plane with
     * stone in it: the tangent plane AT the face lies entirely outside the drum.
     */
    const inset = 0.05
    const wall = wallThicknessAt(testWindow.centreY)
    const expected =
      testWindow.outerWidth + (testWindow.innerWidth - testWindow.outerWidth) * (inset / wall)
    const span = clearSpan(
      pierced.geometry,
      testWindow.azimuthDeg,
      TOWER.outerRadius - inset,
      testWindow.centreY,
    )
    expect(span).toBeCloseTo(expected, 3)
  })

  it('leaves the wall untouched on the opposite bearing', () => {
    const profile = outerRadiusProfileAt(pierced.geometry, testWindow.centreY, 720)
    const opposite = Math.round(((testWindow.azimuthDeg + 180) % 360) * 2)
    expect(profile[opposite]).toBeCloseTo(TOWER.outerRadius, 1)
  })

  it('cuts every opening in the shipped data without breaking the mesh', () => {
    const all = (windowData.windows as WindowSpec[]).map((w) => {
      const floor = FLOORS[w.floorIndex]
      return {
        azimuthDeg: w.azimuthDeg,
        centreY: floor.floorY + w.heightAboveFloor + w.outerHeight / 2,
        outerWidth: w.outerWidth,
        outerHeight: w.outerHeight,
        innerWidth: w.innerWidth,
        innerHeight: w.innerHeight,
      }
    })
    const full = buildShellGeometry({ ...PARAMS, windows: all })
    expect(full.stats.degenerateCount).toBe(0)
    expect(full.stats.triangleCount).toBeGreaterThan(built.stats.triangleCount * 0.5)
  })
})

describe('plan is not a plain circle', () => {
  const BUCKETS = 360 // 1° resolution
  const profile = outerRadiusProfileAt(built.geometry, 15, BUCKETS)
  const R = TOWER.outerRadius
  /** shortest signed angular difference a − b, in (−180, 180] */
  const angDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180

  it('measures a surface at every azimuth', () => {
    expect(profile.every((r) => r > 0)).toBe(true)
  })

  it('reaches its maximum at the buttress azimuth', () => {
    const maxR = Math.max(...profile)
    const maxAz = profile.indexOf(maxR)
    expect(Math.abs(angDiff(maxAz, BUTTRESS.azimuthDeg))).toBeLessThanOrEqual(2)
    expect(maxR).toBeCloseTo(R + BUTTRESS.projection, 0)
  })

  it('stays at the drum radius opposite the buttress', () => {
    const opposite = Math.round((BUTTRESS.azimuthDeg + 180) % 360)
    expect(profile[opposite]).toBeCloseTo(R, 1)
  })

  it('has a NARROW nose, not a broad bulge', () => {
    // near the tip the plan must be only a few metres across, per the OSM nose width
    const nearTip = profile
      .map((r, az) => ({ r, az }))
      .filter((p) => p.r > R + BUTTRESS.projection * 0.9)
    const spanDeg = nearTip.length
    const chord = 2 * (R + BUTTRESS.projection) * Math.sin(((spanDeg / 2) * Math.PI) / 180)
    expect(chord).toBeLessThan(BUTTRESS.tipWidth * 2.5)
  })

  it('springs from a limited arc of the drum', () => {
    const raised = profile.map((r, az) => ({ r, az })).filter((p) => p.r > R + 0.25)
    const offsets = raised.map((p) => angDiff(p.az, BUTTRESS.azimuthDeg))
    const span = Math.max(...offsets) - Math.min(...offsets)
    // the root arc plus the flanks' reach, but nothing like a full-circle bulge
    expect(span).toBeLessThan(BUTTRESS.rootArcDeg * 1.6)
  })

  it('is ASYMMETRIC: the nose leans off the middle of its root arc', () => {
    const raised = profile.map((r, az) => ({ r, az })).filter((p) => p.r > R + 0.25)
    const offsets = raised.map((p) => angDiff(p.az, BUTTRESS.azimuthDeg))
    const rootMidOffset = (Math.max(...offsets) + Math.min(...offsets)) / 2
    // the axis sits off the root-arc centre by roughly the configured skew
    expect(Math.abs(rootMidOffset)).toBeGreaterThan(BUTTRESS.skewDeg * 0.4)
    expect(Math.sign(rootMidOffset)).toBe(-Math.sign(BUTTRESS.skewDeg))
  })
})

describe('inner cavity', () => {
  it('widens with height (wall thins from the inside)', () => {
    const low = innerRadiusProfileAt(built.geometry, 2.0, 24).filter((r) => r > 0)
    const high = innerRadiusProfileAt(built.geometry, TOWER.height - 2.0, 24).filter((r) => r > 0)
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
    expect(mean(high)).toBeGreaterThan(mean(low))
  })

  it('matches innerRadiusAt() at mid-height', () => {
    const y = 15
    const p = innerRadiusProfileAt(built.geometry, y, 24).filter((r) => r > 0)
    const mean = p.reduce((s, v) => s + v, 0) / p.length
    expect(mean).toBeCloseTo(innerRadiusAt(y), 0)
  })
})

describe('entrance opening', () => {
  it('pierces the wall at the entrance azimuth', () => {
    // A ray fired outward from the axis at sill height along the entrance
    // bearing must escape (no wall), unlike the same ray 90° away.
    const y = ENTRANCE.sillY + ENTRANCE.height / 2
    const p = innerRadiusProfileAt(built.geometry, y, 360)
    const at = (deg: number) => p[((Math.round(deg) % 360) + 360) % 360]
    expect(at(ENTRANCE.azimuthDeg)).toBe(0) // escaped through the doorway
    expect(at(ENTRANCE.azimuthDeg + 90)).toBeGreaterThan(0) // solid wall
  })
})
