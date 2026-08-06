import { describe, expect, it } from 'vitest'
import {
  entrancePassageBoxes,
  floorColliders,
  guardRingBoxes,
  rotate,
  stairRampBoxes,
  straightStairGuardBoxes,
  wallColliders,
  yawThenTilt,
  type BoxSpec,
  type PassageWindow,
} from './collision'
import { PLAYER } from '../config/player'
import { EXTERNAL_STAIR } from '../config/site'
import { ENTRANCE } from '../config/tower'

/** World-space corners of a box, via its actual quaternion. */
function corners(b: BoxSpec): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const local: [number, number, number] = [
          sx * b.halfExtents[0],
          sy * b.halfExtents[1],
          sz * b.halfExtents[2],
        ]
        const w = rotate(b.quaternion, local)
        out.push([w[0] + b.position[0], w[1] + b.position[1], w[2] + b.position[2]])
      }
  return out
}

const DEG = Math.PI / 180

// A stand-in tower: outer face 8.25, inner face growing from 3.25 to 4.55.
const innerRadiusAt = (y: number) => 3.25 + (y / 29.5) * 1.3

const BANDS = [0, 3.8, 7.1, 10.4, 13.7, 17, 20.3, 23.6, 26.6]

const baseParams = {
  sectors: 32,
  outerRadius: 8.25,
  innerRadiusAt,
  baseY: 0,
  topY: 26.6,
  bandBoundaries: BANDS,
  entrance: { azimuthDeg: 270, widthDeg: 8, sillY: 2, headY: 4 },
  passageAt: (): PassageWindow[] => [],
}

/** Radius of a box's inner face, measured back from its centre. */
function innerFaceRadius(b: { halfExtents: number[]; position: number[] }): number {
  const r = Math.hypot(b.position[0], b.position[2])
  return r - b.halfExtents[0]
}

describe('yawThenTilt', () => {
  it('returns a unit quaternion', () => {
    for (const [yaw, tilt] of [
      [0, 0],
      [1.2, 0.04],
      [-2.7, -0.11],
    ]) {
      const q = yawThenTilt(yaw, tilt)
      expect(Math.hypot(...q)).toBeCloseTo(1, 12)
    }
  })

  it('is a pure yaw when the tilt is zero', () => {
    const q = yawThenTilt(Math.PI / 2, 0)
    expect(q[0]).toBeCloseTo(0, 12)
    expect(q[2]).toBeCloseTo(0, 12)
  })
})

describe('wallColliders', () => {
  it('rings every band, one box per sector when nothing crosses', () => {
    const boxes = wallColliders(baseParams)
    // 8 bands x 32 sectors, less the sectors the entrance opens
    expect(boxes.length).toBeGreaterThan(8 * 32 - 8)
    expect(boxes.length).toBeLessThanOrEqual(8 * 32)
    expect(boxes.every((b) => b.kind === 'wall')).toBe(true)
  })

  it('puts every inner face on the wall face at that height', () => {
    for (const b of wallColliders(baseParams)) {
      expect(innerFaceRadius(b)).toBeCloseTo(innerRadiusAt(b.position[1]), 6)
    }
  })

  it('orients thickness radially — the real corners, not the spec fields', () => {
    // The first version yawed every box 90°: thin side tangential, chord side
    // radial, wall face 13 cm inside the room. Only a corner transform sees it.
    const b = wallColliders(baseParams).find((x) => x.kind === 'wall')!
    const az = Math.atan2(b.position[0], -b.position[2])
    const radialDir = [Math.sin(az), 0, -Math.cos(az)] as const
    const radii = corners(b).map(
      (c) => c[0] * radialDir[0] + c[2] * radialDir[2],
    )
    const radialSpread = Math.max(...radii) - Math.min(...radii)
    // radial spread ≈ thickness (0.8), NOT the chord (≈1.2+)
    expect(radialSpread).toBeGreaterThan(0.7)
    expect(radialSpread).toBeLessThan(1.0)
  })

  it('lays the tilted face on the cone across the band, not only at mid-height', () => {
    const b = wallColliders(baseParams).find((x) => x.kind === 'wall' && x.position[1] < 3.8)!
    const az = Math.atan2(b.position[0], -b.position[2])
    const radialDir = [Math.sin(az), 0, -Math.cos(az)] as const
    // inner corners = the 4 with the smallest radial coordinate
    const cs = corners(b)
      .map((c) => ({ r: c[0] * radialDir[0] + c[2] * radialDir[2], y: c[1] }))
      .sort((p, q) => p.r - q.r)
      .slice(0, 4)
    for (const c of cs) {
      expect(c.r).toBeCloseTo(innerRadiusAt(c.y), 1)
    }
  })

  it('opens the entrance to its own height and no further', () => {
    const boxes = wallColliders(baseParams)
    const atEntrance = (lo: number, hi: number) =>
      boxes.filter((b) => {
        const az = ((Math.atan2(b.position[0], -b.position[2]) / DEG) + 360) % 360
        const half = b.halfExtents[1]
        return (
          Math.abs(az - 270) < 6 &&
          b.position[1] - half < hi - 1e-9 &&
          b.position[1] + half > lo + 1e-9
        )
      })

    // nothing across the doorway itself
    expect(atEntrance(2.05, 3.95)).toHaveLength(0)
    // but the wall closes back under the sill and over the head, in the SAME band
    expect(atEntrance(0.1, 1.9).length).toBeGreaterThan(0)
    expect(atEntrance(4.1, 6).length).toBeGreaterThan(0)
  })

  it('never leaves a sector unwalled over a whole storey', () => {
    const boxes = wallColliders(baseParams)
    for (let s = 0; s < 32; s++) {
      const az = s * 11.25 + 5.625
      const column = boxes.filter((b) => {
        const a = ((Math.atan2(b.position[0], -b.position[2]) / DEG) + 360) % 360
        return Math.abs(a - az) < 0.01 && b.position[1] < 3.8
      })
      expect(column.length, `sector at ${az.toFixed(1)}° has no wall in band 0–3.8`).toBeGreaterThan(0)
    }
  })

  it('opens the passage but keeps its outer side solid', () => {
    const boxes = wallColliders({
      ...baseParams,
      passageAt: (az) =>
        Math.abs(az - 180) < 10 ? [{ bottomY: 1, topY: 3, innerRadius: 3.5, outerRadius: 4.4 }] : [],
    })
    const atPassage = boxes.filter((b) => {
      const az = ((Math.atan2(b.position[0], -b.position[2]) / DEG) + 360) % 360
      return Math.abs(az - 180) < 10 && b.position[1] > 1 && b.position[1] < 3
    })
    expect(atPassage.length).toBeGreaterThan(0)

    /*
     * BOTH sides of the passage are solid: the jamb between it and the room,
     * and the mass beyond. Only the outer one used to be emitted, so a walker
     * crossed the drawn jamb and stepped onto the stair through the wall.
     */
    const outer = atPassage.filter((b) => b.kind === 'passageOuter')
    const jamb = atPassage.filter((b) => b.kind === 'wall')
    expect(outer.length, 'mass beyond the passage').toBeGreaterThan(0)
    expect(jamb.length, 'jamb between passage and room').toBeGreaterThan(0)
    for (const b of outer) expect(innerFaceRadius(b)).toBeCloseTo(4.4, 6)
    for (const b of jamb) {
      // starts on the room face, stops at the passage void
      expect(innerFaceRadius(b)).toBeCloseTo(innerRadiusAt(b.position[1]), 6)
      expect(Math.hypot(b.position[0], b.position[2]) + b.halfExtents[0]).toBeCloseTo(3.5, 6)
    }
    // and nothing at all stands inside the void itself
    const insideVoid = atPassage.filter((b) => {
      const face = innerFaceRadius(b)
      return face > 3.55 && face < 4.35
    })
    expect(insideVoid).toHaveLength(0)
  })

  it('closes back onto the room face above and below the passage', () => {
    const boxes = wallColliders({
      ...baseParams,
      passageAt: (az) =>
        Math.abs(az - 180) < 10 ? [{ bottomY: 1, topY: 3, innerRadius: 3.5, outerRadius: 4.4 }] : [],
    })
    // 32 sectors put centres at 5.625 + n*11.25, so aim at a real one near 180
    const column = boxes.filter((b) => {
      const az = ((Math.atan2(b.position[0], -b.position[2]) / DEG) + 360) % 360
      return Math.abs(az - 174.375) < 1 && b.position[1] < 3.8
    })
    // below (0 → 1), the passage band (jamb + outer), above (3 → 3.8)
    const walls = column.filter((b) => b.kind === 'wall')
    expect(column.filter((b) => b.kind === 'passageOuter')).toHaveLength(1)
    // two full-height wall boxes, plus the jamb inside the passage band
    expect(walls).toHaveLength(3)
    const jamb = walls.filter((b) => b.position[1] > 1 && b.position[1] < 3)
    expect(jamb).toHaveLength(1)
  })

  it('never walls up a doorway with the passage jamb', () => {
    /*
     * The doorway onto the stair sits at the SAME azimuth as the passage and
     * overlaps its height band. Emitting the jamb blindly put a collider right
     * across the opening: the doorway was cut in the drawn stone and solid in
     * the physics, so you could see the stair and not walk into it.
     */
    const doorSill = 1.2
    const doorHead = 3.3
    const boxes = wallColliders({
      ...baseParams,
      openings: [{ azimuthDeg: 180, widthDeg: 14, sillY: doorSill, headY: doorHead }],
      passageAt: (az) =>
        Math.abs(az - 180) < 10 ? [{ bottomY: 1, topY: 3, innerRadius: 3.5, outerRadius: 4.4 }] : [],
    })

    const acrossDoor = boxes.filter((b) => {
      const az = ((Math.atan2(b.position[0], -b.position[2]) / DEG) + 360) % 360
      if (Math.abs(az - 180) > 8) return false
      const half = b.halfExtents[1]
      const overlapsDoor = b.position[1] - half < doorHead - 1e-6 && b.position[1] + half > doorSill + 1e-6
      // only things standing between the room and the passage block the way in
      return overlapsDoor && innerFaceRadius(b) < 3.5 - 1e-6
    })
    expect(acrossDoor, 'colliders standing across the doorway').toHaveLength(0)

    // the jamb still exists BELOW the doorway sill, where the wall is closed
    const belowSill = boxes.filter((b) => {
      const az = ((Math.atan2(b.position[0], -b.position[2]) / DEG) + 360) % 360
      return Math.abs(az - 180) < 8 && b.position[1] + b.halfExtents[1] <= doorSill + 1e-6
    })
    expect(belowSill.length, 'wall below the sill').toBeGreaterThan(0)
  })

  it('never leaves a gap between neighbouring sectors', () => {
    for (const sectors of [24, 32]) {
      const sectorDeg = 360 / sectors
      for (const b of wallColliders({ ...baseParams, sectors })) {
        // the box must span at least half the arc its sector covers at the face
        // it presents, or a walker slips between two of them
        const faceRadius = Math.hypot(b.position[0], b.position[2]) + b.halfExtents[0]
        const halfArcNeeded = faceRadius * Math.tan((sectorDeg / 2) * DEG)
        expect(b.halfExtents[2]).toBeGreaterThan(halfArcNeeded)
      }
    }
  })

  it('keeps the boxes thin — a full-thickness ring costs a second a frame', () => {
    for (const b of wallColliders(baseParams)) {
      expect(b.halfExtents[0] * 2).toBeLessThanOrEqual(0.8 + 1e-9)
    }
  })
})

describe('floorColliders', () => {
  const floor = {
    sectors: 24,
    floorY: 3.8,
    thickness: 0.3,
    oculusRadius: 1.2,
    outerRadius: 3.42,
  }

  it('rings the annulus and hangs below the floor line', () => {
    const boxes = floorColliders(floor)
    expect(boxes).toHaveLength(24)
    for (const b of boxes) {
      expect(b.position[1]).toBeCloseTo(3.8 - 0.15, 9)
      expect(innerFaceRadius(b)).toBeCloseTo(1.2, 6)
      expect(Math.hypot(b.position[0], b.position[2]) + b.halfExtents[0]).toBeCloseTo(3.42, 6)
    }
  })

  it('shortens the stairwell segments instead of dropping them', () => {
    /*
     * The flight runs inside the wall, so only the slab's outer lip is pierced.
     * Dropping the whole wedge removed the floor from the oculus to the wall
     * over the well's whole arc while the drawn slab kept its inner part, and a
     * walker stepped onto floor that was visibly there and fell a storey.
     */
    const well = { centreAzimuthDeg: 123, widthDeg: 40, innerRadius: 2.9 }
    const boxes = floorColliders({ ...floor, stairwell: well })
    // the ring is still complete — nothing is missing
    expect(boxes).toHaveLength(24)
    for (const b of boxes) {
      const az = ((Math.atan2(b.position[0], -b.position[2]) / DEG) + 360) % 360
      const d = Math.abs((((az - 123) % 360) + 540) % 360 - 180)
      const outer = Math.hypot(b.position[0], b.position[2]) + b.halfExtents[0]
      // inside the well the segment stops at the passage; outside it reaches the wall
      expect(outer).toBeCloseTo(d <= well.widthDeg / 2 ? well.innerRadius : floor.outerRadius, 6)
      expect(innerFaceRadius(b)).toBeCloseTo(floor.oculusRadius, 6)
    }
  })

  it('does drop a segment when the well leaves nothing worth keeping', () => {
    const boxes = floorColliders({
      ...floor,
      stairwell: { centreAzimuthDeg: 123, widthDeg: 40, innerRadius: floor.oculusRadius + 0.05 },
    })
    expect(boxes.length).toBeLessThan(24)
  })

  it('returns nothing when the oculus swallows the slab', () => {
    expect(floorColliders({ ...floor, oculusRadius: 4 })).toHaveLength(0)
  })

  it('runs its long extent radially — corners span oculus to wall, not sideways', () => {
    const b = floorColliders(floor)[0]
    const az = Math.atan2(b.position[0], -b.position[2])
    const radialDir = [Math.sin(az), 0, -Math.cos(az)] as const
    const radii = corners(b).map((c) => c[0] * radialDir[0] + c[2] * radialDir[2])
    expect(Math.min(...radii)).toBeCloseTo(1.2, 6)
    expect(Math.max(...radii)).toBeCloseTo(3.42, 6)
  })
})

describe('guardRingBoxes', () => {
  // storey 5's opening: the widest of the three, on a floor 13.6 m up
  const guard = { sectors: 16, openingRadius: 1.2, floorY: 13.625, height: 1.05 }

  it('stands on the floor surface, neither sunk into it nor floating', () => {
    /*
     * floorColliders hangs its slab BELOW floorY, so the walking surface IS
     * floorY. A guard sunk under it leaves the top of the pane low; a guard
     * floating above it leaves a slot at ankle height at the edge of a drop.
     */
    for (const b of guardRingBoxes(guard)) {
      const ys = corners(b).map((c) => c[1])
      expect(Math.min(...ys)).toBeCloseTo(guard.floorY, 9)
      expect(Math.max(...ys)).toBeCloseTo(guard.floorY + guard.height, 9)
    }
  })

  it('meets the floor collider on one plane at the opening edge', () => {
    /*
     * The pairing that matters. floorColliders ends its annulus at oculusRadius
     * and the guard starts there, so there is no strip of unguarded floor
     * between them and no part of the ring standing over the void with no slab
     * beneath it.
     */
    const floor = floorColliders({
      sectors: 24,
      floorY: guard.floorY,
      thickness: 0.3,
      oculusRadius: guard.openingRadius,
      outerRadius: 3.939,
    })
    for (const b of floor) expect(innerFaceRadius(b)).toBeCloseTo(guard.openingRadius, 6)
    for (const b of guardRingBoxes(guard)) {
      expect(innerFaceRadius(b)).toBeCloseTo(guard.openingRadius, 6)
      // and it grows OUTWARD from that edge, never inward over the hole
      expect(Math.hypot(b.position[0], b.position[2])).toBeGreaterThan(guard.openingRadius)
    }
  })

  it('leaves no gap between neighbours for a walker to slip through', () => {
    for (const sectors of [12, 16, 24]) {
      const sectorDeg = 360 / sectors
      for (const b of guardRingBoxes({ ...guard, sectors })) {
        const faceRadius = Math.hypot(b.position[0], b.position[2]) + b.halfExtents[0]
        expect(b.halfExtents[2]).toBeGreaterThan(faceRadius * Math.tan((sectorDeg / 2) * DEG))
      }
    }
  })

  it('is a barrier and not a lip — nothing the controller has to mount', () => {
    /*
     * The rule the whole collision model is built round: this controller will
     * not climb a vertical face of any height, so every walking surface has to
     * be a ramp. A guard is the one shape that must NOT be walkable — its only
     * horizontal face is the top of the pane, and if the autostep could reach
     * that the guard would be a launch pad into the hole rather than a fence.
     */
    for (const b of guardRingBoxes(guard)) {
      const top = Math.max(...corners(b).map((c) => c[1]))
      expect(top - guard.floorY).toBeGreaterThan(PLAYER.autostepMaxHeight)
    }
  })

  it('is thicker than a solver step, so a contact cannot be missed', () => {
    /*
     * WALL_BOX_THICKNESS's argument, run the other way. The drawn pane is 20 mm
     * and the walker covers 0.087 m between steps at the run speed — a
     * pane-thin collider is exactly the shape a sweep can pass, and what is on
     * the far side of this one is a drop of a storey.
     */
    const worstStep = PLAYER.runSpeed / 30
    for (const b of guardRingBoxes(guard)) {
      expect(b.halfExtents[0] * 2).toBeGreaterThan(worstStep)
    }
  })

  it('builds nothing for an opening that is not there', () => {
    expect(guardRingBoxes({ ...guard, openingRadius: 0 })).toHaveLength(0)
    expect(guardRingBoxes({ ...guard, height: 0 })).toHaveLength(0)
  })
})

describe('entrancePassageBoxes', () => {
  // the real passage: a 1.1 m doorway [İçərişəhər] with 4.9 m of wall to cross
  const passage = {
    azimuthDeg: 270,
    width: 1.1,
    height: 2,
    thresholdY: 0,
    innerRadius: 3.338,
    outerRadius: 8.25,
  }

  /**
   * A box's real extent in the passage's own frame — radial, lateral, vertical.
   * Off the transformed corners, like the wall tests: the whole point is to
   * catch a box whose fields look right and whose orientation is not.
   */
  function frame(b: BoxSpec, azimuthDeg: number) {
    const rad = azimuthDeg * DEG
    const cs = corners(b)
    const r = cs.map((c) => c[0] * Math.sin(rad) + c[2] * -Math.cos(rad))
    const t = cs.map((c) => c[0] * Math.cos(rad) + c[2] * Math.sin(rad))
    const y = cs.map((c) => c[1])
    return {
      r: [Math.min(...r), Math.max(...r)] as [number, number],
      t: [Math.min(...t), Math.max(...t)] as [number, number],
      y: [Math.min(...y), Math.max(...y)] as [number, number],
    }
  }

  it('carries the walker in on a sill topped exactly at the threshold', () => {
    const { sill } = entrancePassageBoxes(passage)
    const f = frame(sill, passage.azimuthDeg)
    expect(f.y[1]).toBeCloseTo(passage.thresholdY, 9)
    expect(f.r[0]).toBeCloseTo(passage.innerRadius, 9)
    expect(f.r[1]).toBeCloseTo(passage.outerRadius, 9)
    expect(f.t[1] - f.t[0]).toBeCloseTo(passage.width, 9)
  })

  it('stands the cheeks on the sill edges without narrowing the doorway', () => {
    const { sill, jambs } = entrancePassageBoxes(passage)
    const s = frame(sill, passage.azimuthDeg)
    expect(jambs).toHaveLength(2)
    for (const j of jambs.map((b) => frame(b, passage.azimuthDeg))) {
      // flush on top of the sill, so a plan projection of the two means something
      expect(j.y[0]).toBeCloseTo(s.y[1], 9)
      expect(j.y[1]).toBeCloseTo(passage.thresholdY + passage.height, 9)
      // same radial run as the sill: the cheeks stop nowhere it does not
      expect(j.r[0]).toBeCloseTo(passage.innerRadius, 9)
      expect(j.r[1]).toBeCloseTo(passage.outerRadius, 9)
      // and outside the clear width — 1.1 m is sourced, physics must not eat it
      const face = Math.min(Math.abs(j.t[0]), Math.abs(j.t[1]))
      expect(face).toBeCloseTo(passage.width / 2, 9)
    }
  })

  it('leaves no lateral gap beside the sill anywhere along the run', () => {
    /*
     * The fault this pins. The passage used to be a 1.1 m plank with nothing on
     * its sides: boxAt clamps every wall box to WALL_BOX_THICKNESS at the room
     * face, so past ~4.14 m of radius the drum carries no collider at ANY
     * azimuth, and this passage is 4.9 m deep. From 0.85 m off the centreline —
     * half the doorway plus a capsule radius — the walker ran out of plank,
     * fell 2 m onto the site's ground cylinder, which runs under the tower, and
     * ended up standing inside solid drawn masonry.
     */
    const { sill, jambs } = entrancePassageBoxes(passage)
    const spans = [sill, ...jambs].map((b) => frame(b, passage.azimuthDeg))
    const reach = passage.width / 2 + PLAYER.radius

    for (let r = passage.innerRadius; r <= passage.outerRadius + 1e-9; r += 0.05) {
      const here = spans
        .filter((s) => s.r[0] <= r + 1e-9 && s.r[1] >= r - 1e-9)
        .map((s): [number, number] => [...s.t])
        .sort((a, b) => a[0] - b[0])

      const merged: Array<[number, number]> = []
      for (const [lo, hi] of here) {
        const last = merged[merged.length - 1]
        if (last && lo <= last[1] + 1e-9) last[1] = Math.max(last[1], hi)
        else merged.push([lo, hi])
      }

      const where = `radius ${r.toFixed(2)} m`
      // one solid band, not three islands: any gap at all is a way off the sill
      expect(merged, where).toHaveLength(1)
      // and it closes further out than the capsule can reach from the centreline
      expect(merged[0][0], where).toBeLessThanOrEqual(-reach)
      expect(merged[0][1], where).toBeGreaterThanOrEqual(reach)
    }
  })
})

describe('stairRampBoxes', () => {
  // a plausible counterclockwise flight: 19 steps, riser 0.19, 4.65°/step
  const steps = Array.from({ length: 19 }, (_, i) => ({
    azimuthDeg: 200 - i * 4.65,
    treadY: 0.2 + i * 0.19,
    midRadius: 3.7,
  }))

  it('covers the flight with far fewer boxes than treads', () => {
    const boxes = stairRampBoxes(steps, 0.9)
    expect(boxes.length).toBeLessThan(steps.length)
    expect(boxes.length).toBeGreaterThan(steps.length / 3)
    expect(boxes.every((b) => b.kind === 'ramp')).toBe(true)
  })

  it('carries every nosing on a top face', () => {
    const boxes = stairRampBoxes(steps, 0.9)
    for (const s of steps) {
      const rad = (s.azimuthDeg * Math.PI) / 180
      const nose = [Math.sin(rad) * s.midRadius, s.treadY, -Math.cos(rad) * s.midRadius]
      // the top of the nearest box directly under/at the nosing
      let best = Infinity
      for (const b of boxes) {
        const top = corners(b)
          .sort((p, q) => q[1] - p[1])
          .slice(0, 4)
        // is the nosing within the box's horizontal footprint?
        const inPlan = Math.hypot(b.position[0] - nose[0], b.position[2] - nose[2]) <
          b.halfExtents[2] + 0.1
        if (!inPlan) continue
        // interpolate the top plane's height at the nosing via the two top edges
        const topYs = top.map((c) => c[1])
        const lo = Math.min(...topYs)
        const hi = Math.max(...topYs)
        if (nose[1] >= lo - 0.15 && nose[1] <= hi + 0.15) best = 0
        else best = Math.min(best, Math.min(Math.abs(nose[1] - lo), Math.abs(nose[1] - hi)))
      }
      expect(best, `nosing at az ${s.azimuthDeg.toFixed(1)} y ${s.treadY}`).toBeLessThan(0.16)
    }
  })

  it('keeps the pitch inside the controller climb limit', () => {
    for (const b of stairRampBoxes(steps, 0.9)) {
      // travel axis = local +Z in world
      const zAxis = rotate(b.quaternion, [0, 0, 1])
      const pitchDeg = (Math.asin(Math.abs(zAxis[1])) * 180) / Math.PI
      expect(pitchDeg).toBeGreaterThan(25)
      expect(pitchDeg).toBeLessThan(45)
    }
  })

  it('keeps the top surface an upward face', () => {
    for (const b of stairRampBoxes(steps, 0.9)) {
      const yAxis = rotate(b.quaternion, [0, 1, 0])
      expect(yAxis[1]).toBeGreaterThan(0.7)
    }
  })
})

describe('straightStairGuardBoxes', () => {
  // the external entrance flight: 3.6 m of run against 1.98 m of rise, due west
  const flight = {
    foot: { azimuthDeg: 270, treadY: 0, midRadius: 11.85 },
    head: { azimuthDeg: 270, treadY: 1.98, midRadius: 8.25 },
    width: 1.4,
    height: 1.215,
  }
  const RUN = flight.foot.midRadius - flight.head.midRadius

  it('leaves the walking surface its full width', () => {
    const [a, b] = straightStairGuardBoxes(flight)
    const across = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])
    // the clear gap between the two inner faces IS the ramp's own width: the
    // guards must not eat any of it, or the walker is stopped short of the edge
    // they can see, and on this flight the doorway at the head is narrower still
    expect(across - a.halfExtents[0] - b.halfExtents[0]).toBeCloseTo(flight.width, 9)
    expect(a.kind).toBe('guard')
    expect(b.kind).toBe('guard')
  })

  it('grows outward from those edges, never in over the flight', () => {
    // due west, so the flight's centreline is the −x axis and z is across it
    for (const b of straightStairGuardBoxes(flight)) {
      const off = Math.abs(b.position[2])
      expect(off).toBeCloseTo(flight.width / 2 + b.halfExtents[0], 9)
      const inner = Math.min(...corners(b).map((c) => Math.abs(c[2])))
      expect(inner).toBeCloseTo(flight.width / 2, 9)
    }
  })

  it('stands upright, so it guards the head of the flight at every height', () => {
    for (const b of straightStairGuardBoxes(flight)) {
      const up = rotate(b.quaternion, [0, 1, 0])
      expect(up[1]).toBeCloseTo(1, 9)
      /*
       * Which means the plan footprint at the top is the footprint at the
       * bottom. A slab pitched to the rake would carry its top edge
       * height * sin(29°) ≈ 0.6 m back DOWN the flight, so from about knee
       * height upward it would stop short of the landing — the one place on a
       * flight where the drop beside the walker is its whole rise.
       */
      const cs = corners(b)
      const low = cs.filter((c) => c[1] < b.position[1])
      const high = cs.filter((c) => c[1] > b.position[1])
      for (const p of low) {
        const matched = high.some((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) < 1e-9)
        expect(matched).toBe(true)
      }
    }
  })

  it('spans the flight end to end, foot surface to a guard height over the head', () => {
    for (const b of straightStairGuardBoxes(flight)) {
      expect(b.halfExtents[2] * 2).toBeCloseTo(RUN, 9)
      const ys = corners(b).map((c) => c[1])
      expect(Math.min(...ys)).toBeCloseTo(flight.foot.treadY, 9)
      expect(Math.max(...ys)).toBeCloseTo(flight.head.treadY + flight.height, 9)
      // along the flight, which runs due west: no stopping short at either end
      const along = corners(b).map((c) => -c[0])
      expect(Math.min(...along)).toBeCloseTo(flight.head.midRadius, 9)
      expect(Math.max(...along)).toBeCloseTo(flight.foot.midRadius, 9)
    }
  })

  it('is a wall rather than a step, at both ends of the flight', () => {
    for (const b of straightStairGuardBoxes(flight)) {
      const top = Math.max(...corners(b).map((c) => c[1]))
      // measured from the HIGHEST walking point, which is the least favourable
      expect(top - flight.head.treadY).toBeGreaterThan(PLAYER.autostepMaxHeight)
    }
  })

  it('is thicker than the walker crosses between solver steps', () => {
    // WALL_BOX_THICKNESS's sum, run the other way: at the run speed and 30 fps
    const worstStep = PLAYER.runSpeed / 30
    for (const b of straightStairGuardBoxes(flight)) {
      expect(b.halfExtents[0] * 2).toBeGreaterThan(worstStep)
    }
  })

  it('never pinches the doorway the flight leads to', () => {
    // the config's own numbers, so that narrowing the stair to less than the
    // sourced 1.1 m doorway [İçərişəhər] fails here instead of in the walk
    const [a, b] = straightStairGuardBoxes({
      ...flight,
      width: EXTERNAL_STAIR.width,
      height: EXTERNAL_STAIR.guardHeight + EXTERNAL_STAIR.riser,
    })
    const across = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])
    const clear = across - a.halfExtents[0] - b.halfExtents[0]
    expect(clear).toBeGreaterThanOrEqual(ENTRANCE.width)
    // and wide enough for the capsule to walk between them at all
    expect(clear).toBeGreaterThan(PLAYER.radius * 2)
  })

  it('emits nothing for a flight with no plan run, or no width or height', () => {
    expect(straightStairGuardBoxes({ ...flight, head: { ...flight.head, midRadius: 11.85 } }))
      .toHaveLength(0)
    expect(straightStairGuardBoxes({ ...flight, width: 0 })).toHaveLength(0)
    expect(straightStairGuardBoxes({ ...flight, height: 0 })).toHaveLength(0)
  })
})
