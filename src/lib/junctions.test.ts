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
import { planAllFlights, stairPassageSections, stairTreadVertices } from './staircase'

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
    const yTop = Math.max(...positions.filter((_, i) => i % 3 === 1))
    const yBottom = Math.min(...positions.filter((_, i) => i % 3 === 1))

    let topFaces = 0
    let bottomFaces = 0
    for (let t = 0; t < indices.length; t += 3) {
      const p = at(indices[t])
      const q = at(indices[t + 1])
      const r = at(indices[t + 2])
      const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
      const e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]]
      const ny = e1[2] * e2[0] - e1[0] * e2[2] // y component of e1 × e2
      const meanY = (p[1] + q[1] + r[1]) / 3

      if (Math.abs(meanY - yTop) < 1e-6) {
        topFaces++
        expect(ny, 'a tread top face pointing downward').toBeGreaterThan(0)
      }
      if (Math.abs(meanY - yBottom) < 1e-6) {
        bottomFaces++
        expect(ny, 'a tread bottom face pointing upward').toBeLessThan(0)
      }
    }
    expect(topFaces, 'no top faces found to check').toBeGreaterThan(0)
    expect(bottomFaces, 'no bottom faces found to check').toBeGreaterThan(0)
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
        const treadInner = s.midRadius - STAIR.width / 2
        const treadOuter = s.midRadius + STAIR.width / 2
        // Inward the tread ABUTS the passage wall — both sit on the room face,
        // which is what the source describes, so they are equal by design and
        // only a tread poking PAST it is a fault.
        expect(
          treadInner,
          `tread at az ${s.azimuthDeg.toFixed(1)} pokes through the inner wall`,
        ).toBeGreaterThanOrEqual(section.innerRadius - 1e-9)
        expect(
          treadOuter,
          `tread at az ${s.azimuthDeg.toFixed(1)} pokes through the outer wall`,
        ).toBeLessThan(section.outerRadius)
      }
    }
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
