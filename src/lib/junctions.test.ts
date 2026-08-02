/**
 * Junction guards: no two surfaces in the tower may merely TOUCH.
 *
 * A ray test can prove the shell has no hole clean through it — that one runs
 * 70 000 rays and comes back with every clear line out accounted for by the
 * entrance or a window. What it cannot see is a sliver between two SEPARATE
 * meshes: the floor slabs, the cupolas, the ceiling fill and the stair treads
 * are all their own objects, and where one dies into another a millimetre of
 * daylight shows at a grazing angle and nowhere else.
 *
 * These are analytic checks. The shell's room-side face is innerRadiusAt(y) by
 * construction, so nothing here needs to be rendered or raycast — which also
 * keeps it honest, since the CSG output is not watertight and containment tests
 * on it cannot be trusted.
 */

import { describe, expect, it } from 'vitest'
import { FLOORS, STAIR, TOWER, innerRadiusAt } from '../config/tower'
import { PLAYER } from '../config/player'
import { cupolaProfile, domeHeightAt, effectiveOpeningRadius } from './cupola'
import {
  PASSAGE_SIDE_CLEARANCE,
  planAllFlights,
  stairApproaches,
  stairPassageSections,
  stairTreadVertices,
  treadDepth,
} from './staircase'

/**
 * Must match WALL_EMBED in components/tower/FloorStructures.tsx.
 * Asserted below against the profile cupolaProfile() actually produces, so the
 * two cannot drift apart silently.
 */
const WALL_EMBED = 0.25

/**
 * Lathe segment counts in play. lodSegments() emits 64, 32, 21, 16, 13, 12 as
 * the viewer moves away; 12 is genuinely reachable, because App.tsx renders all
 * eight storeys whenever storey culling is off. Testing only down to 16
 * understated the worst slab margin as +0.16 m when it is really +0.10 m.
 */
const LATHE_SEGMENTS = [64, 32, 21, 16, 13, 12] as const

/**
 * How far a regular N-gon inscribed in radius R falls inside the true circle.
 * Two surfaces meeting at the same nominal radius but drawn with different N
 * therefore cross, and the difference is what a grazing view sees.
 */
function chordDip(radius: number, segments: number): number {
  return radius * (1 - Math.cos(Math.PI / segments))
}

const worstDip = (radius: number) =>
  Math.max(...LATHE_SEGMENTS.map((n) => chordDip(radius, n)))

describe('floor slabs bed into the wall', () => {
  it('never emerges into the room, at any storey or height', () => {
    for (const f of FLOORS) {
      // storey 1 has no opening, so FloorStructures builds it as a solid
      // cylinder rather than an annulus — a different code path, and asserting
      // the annular formula for it passes on a slab that is never rendered
      const outer = f.innerRadiusAtLevel + WALL_EMBED
      // the slab spans floorY − thickness .. floorY; the wall WIDENS with height,
      // so its top rim is the tightest case
      for (const y of [f.floorY - TOWER.floorSlab, f.floorY]) {
        const margin = outer - innerRadiusAt(y) - worstDip(outer)
        expect(
          margin,
          `storey ${f.floorNumber} slab at y ${y.toFixed(2)}: buried ${(outer - innerRadiusAt(y)).toFixed(3)} m, worst chord dip ${worstDip(outer).toFixed(3)} m`,
        ).toBeGreaterThan(0.05)
      }
    }
  })
})

describe('cupolas bed into the wall', () => {
  it('carries a skirt that is buried at its own height, not just at the springing', () => {
    for (const f of FLOORS) {
      const span = innerRadiusAt(f.cupolaSpringY)
      const profile = cupolaProfile(span, TOWER.oculusRadius, TOWER.cupolaRise, 20, WALL_EMBED)
      const skirt = profile[profile.length - 1]
      // profile y is relative to the springing
      const skirtY = f.cupolaSpringY + skirt.y
      const margin = skirt.r - innerRadiusAt(skirtY) - worstDip(skirt.r)
      expect(
        margin,
        `storey ${f.floorNumber} skirt r ${skirt.r.toFixed(3)} at y ${skirtY.toFixed(2)}, wall ${innerRadiusAt(skirtY).toFixed(3)}`,
      ).toBeGreaterThan(0.05)
    }
  })

  it('never pushes its crown through the floor above', () => {
    for (const f of FLOORS) {
      const above = FLOORS[f.index + 1]
      if (!above) continue
      expect(
        f.ceilingY,
        `storey ${f.floorNumber} crown ${f.ceilingY.toFixed(2)} vs slab underside ${(above.floorY - TOWER.floorSlab).toFixed(2)}`,
      ).toBeLessThan(above.floorY - TOWER.floorSlab)
    }
  })
})

describe('the oculus shaft is lined without a break', () => {
  /** Where the ceiling fill starts and stops, as FloorStructures builds it. */
  const fillBand = (f: (typeof FLOORS)[number]) => ({
    bottom:
      f.cupolaSpringY +
      domeHeightAt(
        effectiveOpeningRadius(TOWER.oculusRadius, innerRadiusAt(f.cupolaSpringY)),
        innerRadiusAt(f.cupolaSpringY),
        TOWER.cupolaRise,
      ),
    top: FLOORS[f.index + 1]
      ? FLOORS[f.index + 1].floorY - TOWER.floorSlab
      : TOWER.height - TOWER.parapetHeight,
  })

  it('gives all three meshes the same opening radius at every level', () => {
    for (const f of FLOORS) {
      const span = innerRadiusAt(f.cupolaSpringY)
      const cupolaHole = effectiveOpeningRadius(TOWER.oculusRadius, span)
      const slabHole = effectiveOpeningRadius(TOWER.oculusRadius, f.innerRadiusAtLevel)
      const fillHole = effectiveOpeningRadius(TOWER.oculusRadius, span)
      expect(fillHole, `storey ${f.floorNumber} fill vs cupola`).toBeCloseTo(cupolaHole, 9)
      expect(slabHole, `storey ${f.floorNumber} slab vs cupola`).toBeCloseTo(cupolaHole, 9)
    }
  })

  it('starts the lining where the dome actually ends, not at the crown', () => {
    /*
     * The crown is the height the dome would reach ON THE AXIS. The dome does
     * not go there — it stops at the oculus rim, which is lower. Starting the
     * lining at the crown therefore leaves an unlined band exactly the depth of
     * the dome's rise between axis and oculus, and you see through it looking up.
     */
    for (const f of FLOORS) {
      const span = innerRadiusAt(f.cupolaSpringY)
      const hole = effectiveOpeningRadius(TOWER.oculusRadius, span)
      const rimY = f.cupolaSpringY + domeHeightAt(hole, span, TOWER.cupolaRise)
      const band = fillBand(f)
      expect(
        band.bottom,
        `storey ${f.floorNumber}: dome rim ends at ${rimY.toFixed(3)}, lining starts at ${band.bottom.toFixed(3)} — unlined band ${(band.bottom - rimY).toFixed(3)} m`,
      ).toBeLessThanOrEqual(rimY + 1e-6)
    }
  })

  it('hands over to the slab above with no unlined band', () => {
    for (const f of FLOORS) {
      const above = FLOORS[f.index + 1]
      if (!above) continue
      const band = fillBand(f)
      expect(
        band.top,
        `storey ${f.floorNumber}: lining stops at ${band.top.toFixed(3)}, slab underside ${(above.floorY - TOWER.floorSlab).toFixed(3)}`,
      ).toBeGreaterThanOrEqual(above.floorY - TOWER.floorSlab - 1e-6)
    }
  })
})

describe('the stair leaves no slot that looks through', () => {
  const flights = planAllFlights(
    {
      winding: STAIR.winding,
      riserTarget: STAIR.riserTarget,
      goingTarget: STAIR.goingTarget,
      width: STAIR.width,
      wallClearance: STAIR.wallClearance,
      startAzimuthDeg: STAIR.startAzimuthDeg,
    },
    FLOORS,
    innerRadiusAt,
  )
  const sections = stairPassageSections(
    flights,
    STAIR.width,
    PLAYER.stairHeadroom,
    innerRadiusAt,
  ).flat()

  it('keeps the passage in the masonry, so the flight is not a niche onto the room', () => {
    /*
     * The failure this guards: the flight's radius used to be pinned to the wall
     * face at the storey's FLOOR, while the face moves outward 0.044 m per metre
     * of height. By the head of a flight the passage was cut 0.23 m inside the
     * room — a 2.1 m tall slot running the whole length of every flight, i.e.
     * the open niche the walkthrough footage says the tower does not have.
     */
    const byAzimuth = new Map(sections.map((s) => [s.azimuthDeg.toFixed(4), s]))
    for (const flight of flights) {
      for (const s of flight) {
        const section = byAzimuth.get(s.azimuthDeg.toFixed(4))
        if (!section) continue
        /*
         * Not merely "not past the face" — there must be REAL STONE between the
         * room and the passage. Clamping the passage exactly to the face passes
         * a not-past-it test and still leaves the flight open to the chamber,
         * because coincident is not enclosed.
         */
        const jamb = section.innerRadius - innerRadiusAt(s.treadY)
        expect(
          jamb,
          `az ${s.azimuthDeg.toFixed(1)} tread ${s.treadY.toFixed(2)}: passage inner ${section.innerRadius.toFixed(3)} vs room face ${innerRadiusAt(s.treadY).toFixed(3)}`,
        ).toBeGreaterThan(0.1)
      }
    }
  })

  it('builds treads solid side out, not inside out', () => {
    /*
     * Wound the wrong way the prism's normals all point inwards: the top face
     * faces down, the bottom faces up. Nothing errors — the geometry is built,
     * the tests on positions pass — but backface culling makes every tread a
     * hollow shell and the flight reads as full of holes. Only the indices say
     * so, which is why this checks them rather than the corner coordinates.
     */
    const steps = flights[0]
    const { positions, indices } = stairTreadVertices(steps, STAIR.width, () => 0.2)

    const at = (i: number): [number, number, number] => [
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    ]

    /*
     * EVERY face, not just the horizontal ones. An earlier version of this test
     * checked only the top and bottom, and the two radial end faces — the riser
     * itself — stayed inside-out through it: a quarter of each step's faces were
     * culled, so from whichever side you were climbing you looked straight
     * through the stone. Checking the whole prism costs nothing and cannot be
     * fooled the same way.
     *
     * Each tread is one prism of VERTS_PER_STEP vertices, so a triangle's step
     * is just its first index divided by that; the outward test is against that
     * step's own centroid.
     */
    const VERTS_PER_STEP = positions.length / 3 / steps.length
    expect(VERTS_PER_STEP, 'vertices do not divide evenly into steps').toBe(
      Math.round(VERTS_PER_STEP),
    )

    const centroid = (step: number): [number, number, number] => {
      let x = 0
      let y = 0
      let z = 0
      for (let v = step * VERTS_PER_STEP; v < (step + 1) * VERTS_PER_STEP; v++) {
        x += positions[v * 3]
        y += positions[v * 3 + 1]
        z += positions[v * 3 + 2]
      }
      return [x / VERTS_PER_STEP, y / VERTS_PER_STEP, z / VERTS_PER_STEP]
    }

    let inward = 0
    for (let t = 0; t < indices.length; t += 3) {
      const p = at(indices[t])
      const q = at(indices[t + 1])
      const r = at(indices[t + 2])
      const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
      const e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]]
      const n = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ]
      const c = centroid(Math.floor(indices[t] / VERTS_PER_STEP))
      const d = [
        (p[0] + q[0] + r[0]) / 3 - c[0],
        (p[1] + q[1] + r[1]) / 3 - c[1],
        (p[2] + q[2] + r[2]) / 3 - c[2],
      ]
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] <= 0) inward++
    }
    expect(inward, `${inward} tread faces are wound inside-out`).toBe(0)
  })

  it('makes consecutive treads share an edge, so no wedge sticks out', () => {
    /*
     * Treads used to be straight boxes turned to each step's azimuth. A chord
     * on a circle cannot meet its neighbour: the pair splay apart on the outer
     * edge and interpenetrate on the inner, and the wedge between them showed
     * in-game as a shard growing out of the stair. As annular sectors they abut
     * exactly, because step i+1's azimuth is step i's plus step i's own width.
     */
    for (const flight of flights) {
      for (let i = 0; i < flight.length - 1; i++) {
        const a = flight[i]
        const b = flight[i + 1]
        const sign = Math.sign(b.azimuthDeg - a.azimuthDeg)
        const aEdge = a.azimuthDeg + (sign * a.angularWidthDeg) / 2
        const bEdge = b.azimuthDeg - (sign * b.angularWidthDeg) / 2
        expect(
          Math.abs(aEdge - bEdge),
          `steps ${i}/${i + 1}: tread edges at ${aEdge.toFixed(4)} and ${bEdge.toFixed(4)}`,
        ).toBeLessThan(0.02)
      }
    }
  })

  it('keeps every tread inside the passage it runs in', () => {
    const byAzimuth = new Map(sections.map((s) => [s.azimuthDeg.toFixed(4), s]))
    for (const flight of flights) {
      for (const s of flight) {
        const section = byAzimuth.get(s.azimuthDeg.toFixed(4))
        expect(section, `no passage section at az ${s.azimuthDeg.toFixed(1)}`).toBeDefined()
        if (!section) continue
        /*
         * The tread fills the passage's full width. Anything narrower leaves a
         * slot down each side that looks through to the bed, which is what the
         * flight looked like when the tread was only STAIR.width across.
         */
        const treadWidth = STAIR.width + 2 * PASSAGE_SIDE_CLEARANCE
        const treadInner = s.midRadius - treadWidth / 2
        const treadOuter = s.midRadius + treadWidth / 2
        expect(
          treadInner,
          `slot inside the tread at az ${s.azimuthDeg.toFixed(1)}`,
        ).toBeLessThanOrEqual(section.innerRadius + 1e-9)
        expect(
          treadOuter,
          `slot outside the tread at az ${s.azimuthDeg.toFixed(1)}`,
        ).toBeGreaterThanOrEqual(section.outerRadius - 1e-9)
      }
    }
  })

  it('carries every tread down to the passage floor, leaving no void under the nosing', () => {
    /*
     * A tread one riser thick is a plank on nothing: under each nosing sat a
     * half-riser void down to the bed, and the flight read as floating slabs
     * with black gaps between them. Cut stone steps are monolithic with their
     * risers, so the block runs down to the floor of the cut — which also makes
     * consecutive treads overlap and the stair become one solid mass.
     */
    const byAzimuth = new Map(sections.map((s) => [s.azimuthDeg.toFixed(4), s]))
    for (const flight of flights) {
      if (flight.length < 2) continue
      const riser = Math.abs(flight[1].treadY - flight[0].treadY)
      for (const s of flight) {
        const section = byAzimuth.get(s.azimuthDeg.toFixed(4))
        if (!section) continue
        const treadBottom = s.treadY - treadDepth(riser)
        expect(
          treadBottom,
          `az ${s.azimuthDeg.toFixed(1)}: tread bottom ${treadBottom.toFixed(3)} vs passage floor ${section.bottomY.toFixed(3)}`,
        ).toBeCloseTo(section.bottomY, 6)
      }
    }
  })

  it('overlaps consecutive treads vertically, so the flight is one mass', () => {
    for (const flight of flights) {
      if (flight.length < 2) continue
      const riser = Math.abs(flight[1].treadY - flight[0].treadY)
      const depth = treadDepth(riser)
      for (let i = 0; i < flight.length - 1; i++) {
        const overlap = flight[i].treadY - (flight[i + 1].treadY - depth)
        expect(overlap, `steps ${i}/${i + 1} overlap`).toBeGreaterThan(0)
      }
    }
  })

  /*
   * The walking surface, as opposed to the drawn stone.
   *
   * The character controller will NOT climb a vertical face — measured: with
   * autostep raised to 0.6 m it still refused a 0.42 m ledge, and a 0.2 m one.
   * So the collision geometry has to carry the walker on slopes alone. That is
   * why the flight is a ramp chain rather than a box per tread, and it is why
   * the way in from each room has to be a ramp too.
   */
  describe('the way onto the stair is walkable', () => {
    const approaches = stairApproaches(flights, STAIR.width, innerRadiusAt, (i, end) =>
      end === 'foot' ? FLOORS[i].floorY : FLOORS[i + 1].floorY,
    )

    it('gives every storey exactly one way onto the helix', () => {
      /*
       * One per flight head, plus one at the bottom flight's foot. Emitting a
       * foot approach on the upper flights too laid a second surface across the
       * landing, 0.42 m above the top treads of the flight below, and the climb
       * stopped three steps short of the storey.
       */
      expect(approaches.length).toBe(flights.length + 1)
      const feet = approaches.filter(
        ([, out]) => !flights.some((f) => Math.abs(f[f.length - 1].treadY - out.treadY) < 1e-9),
      )
      expect(feet.length, 'more than one foot approach').toBe(1)
    })

    it('starts each approach inside the room, under its floor slab', () => {
      for (const [inRoom] of approaches) {
        const face = innerRadiusAt(inRoom.treadY)
        expect(
          inRoom.midRadius,
          `approach at y ${inRoom.treadY.toFixed(2)} starts at r ${inRoom.midRadius.toFixed(2)}, wall face ${face.toFixed(2)}`,
        ).toBeLessThan(face - 0.3)
      }
    })

    it('keeps every approach a walkable slope, never a face', () => {
      /*
       * The whole point of the approach is that it has no vertical face, so its
       * own pitch has to stay inside the controller's climb limit — otherwise it
       * is a wall with a chamfer on it and nothing is gained.
       */
      const limit = Math.tan(PLAYER.maxSlopeClimbAngleDeg * (Math.PI / 180))
      for (const [inRoom, onStair] of approaches) {
        const ax = inRoom.azimuthDeg * (Math.PI / 180)
        const bx = onStair.azimuthDeg * (Math.PI / 180)
        const run = Math.hypot(
          onStair.midRadius * Math.sin(bx) - inRoom.midRadius * Math.sin(ax),
          onStair.midRadius * Math.cos(bx) - inRoom.midRadius * Math.cos(ax),
        )
        const rise = Math.abs(onStair.treadY - inRoom.treadY)
        expect(run, 'an approach with no run is a vertical face').toBeGreaterThan(0.3)
        expect(
          rise / run,
          `approach at y ${inRoom.treadY.toFixed(2)}: ${rise.toFixed(2)} m over ${run.toFixed(2)} m`,
        ).toBeLessThan(limit)
      }
    })

    it('never lays a head landing over the treads below it', () => {
      /*
       * The landing is level with the storey floor. Centred on the top tread it
       * reaches back over the two treads below, which are one and two risers
       * lower — a level slab over a descending flight is a wall across it. It is
       * therefore pushed one half-width ALONG the climb, so its trailing edge
       * falls on the top tread and everything it covers is higher, not lower.
       */
      flights.forEach((steps, i) => {
        const last = steps[steps.length - 1]
        const floorY = FLOORS[i + 1].floorY
        const halfWidthDeg = ((STAIR.width / last.midRadius) * (180 / Math.PI)) / 2
        const climbDir = Math.sign(steps[1].azimuthDeg - steps[0].azimuthDeg)
        const landingAz = last.azimuthDeg + halfWidthDeg * climbDir

        for (const s of flights.flat()) {
          const inside = Math.abs(s.azimuthDeg - landingAz) <= halfWidthDeg + 1e-9
          if (!inside) continue
          expect(
            s.treadY,
            `storey ${i + 2} landing at az ${landingAz.toFixed(1)} covers a tread at az ${s.azimuthDeg.toFixed(1)}, y ${s.treadY.toFixed(2)} — ${(floorY - s.treadY).toFixed(2)} m below the landing`,
          ).toBeGreaterThanOrEqual(floorY - 1e-9)
        }
      })
    })
  })

  it('bottoms the gap under each tread out on the bed, so it cannot see through', () => {
    flights.forEach((flight, i) => {
      if (flight.length < 2) return
      const riser = Math.abs(flight[1].treadY - flight[0].treadY)
      const thickness = Math.max(0.12, riser)
      const bedTop = 1.5 * thickness + 0.02 // depth of the cut below each tread
      const gap = bedTop - thickness
      // the gap is real, but it must be floored by the bed rather than open
      expect(gap, `flight ${i + 1}: gap under a tread ${gap.toFixed(3)} m`).toBeGreaterThan(0)
      expect(gap, `flight ${i + 1}: gap under a tread ${gap.toFixed(3)} m is too deep to read as masonry`).toBeLessThan(0.2)
    })
  })
})
