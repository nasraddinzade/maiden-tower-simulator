import { describe, expect, it } from 'vitest'
import { ENTRANCE, FLOORS, ROOF, STAIR, TOWER, WALL_LIFTS, innerRadiusAt, stairSettings } from '../config/tower'
import { PLAYER } from '../config/player'
import { WALL_EMBED } from './bedding'
import {
  archFacetCount,
  archHalfWidthAt,
  archSpringHeight,
  drawnClearWidth,
  revealFacets,
} from './doorwayArch'
import {
  doorwayRevealBoxes,
  rotate,
  stairPassageBandsAt,
  wallColliders,
  type BoxSpec,
  type FlightSection,
} from './collision'
import { planAllFlights, stairDoorways, stairPassageSections } from './staircase'

/**
 * THE HEAD OF A CHAMBER DOORWAY — the stone that is drawn round it, and the
 * stone the walker is actually stopped by.
 *
 * All maths, no renderer (rule 6).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * THE FAULT THESE STATE, in the owner's words: «потолок яруса очень некрасиво
 * перекрывает вход на лестницу (там должен быть арочный вход, а его не видно)»
 * and, walking it, «игрок буквально через него проходит».
 * ═════════════════════════════════════════════════════════════════════════
 *
 * TWO THINGS WERE WRONG AND ONLY ONE OF THEM WAS THE CEILING.
 *
 * The ceiling really did cross the opening: at CUPOLA_RISE 0.9 the vault sprang
 * at floor + 1.600, its skirt was bedded 0.25 m and so hung to floor + 1.350,
 * and the doorway's head stood at floor + 2.100 — half a metre of it above the
 * wall it was cut in, with the vault's underside drawn straight across the top
 * two thirds of the arch. Not one millimetre of the curve could be seen from
 * the room, because the arch springs at 1.472–1.485 and the skirt came down
 * below that. Commit 4f92518 moved the rise to 0.25 and the head to 1.688 for a
 * different reason and closed it as a side effect; chamberSection.test.ts
 * states the section, and the first describe below states it for the doorways
 * the model actually CUTS, whose heads are not all STAIR.doorwayHeight.
 *
 * THE OTHER ONE IS STILL HERE AND IS WHY HE WALKED THROUGH THE STONE. The hole
 * in the physics was never the hole in the stone. wallColliders() opens a
 * sector WHOLE if a doorway touches it at all, and opens it SQUARE from sill to
 * head. So the collided opening ran up to `widthDeg/2 + sectorDeg` each side of
 * the centre line — 18.7° against a doorway 15.0° wide — and had no head at
 * all. Measured on the shipped configuration before this change: up to 0.480 m
 * of drawn jamb standing in nothing, and the entire haunch of the arch with it.
 *
 * That is also the mechanism by which the vault's skirt was walked through
 * rather than merely seen: it hung inside a square hole that the physics
 * believed was empty. Fix the rise and the skirt leaves the opening; fix the
 * shape and NOTHING drawn in a doorway can ever be a ghost again.
 */

const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
const tubes = stairPassageSections(
  flights,
  STAIR.width,
  PLAYER.stairHeadroom,
  innerRadiusAt,
  ROOF.masonryTopY,
  undefined,
  STAIR.doorwayWidth,
)
const doorways = stairDoorways(
  flights,
  STAIR.width,
  STAIR.doorwayHeight,
  innerRadiusAt,
  (i: number, end: 'foot' | 'head') =>
    end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY,
  ROOF.masonryTopY,
  WALL_LIFTS.map((l) => l.opensAtY),
  STAIR.doorwayWidth,
)

const SECTORS = 32
const sectorDeg = 360 / SECTORS
const sections: FlightSection[] = tubes.flatMap((t, flight) => t.map((s) => ({ ...s, flight })))
const passageAt = (az: number) => stairPassageBandsAt(sections, az, sectorDeg)

/** The colliders TowerColliders builds for the drum, term for term. */
const walls = wallColliders({
  sectors: SECTORS,
  outerRadius: TOWER.outerRadius,
  innerRadiusAt,
  baseY: ENTRANCE.groundY - 0.5,
  topY: ROOF.masonryTopY,
  bandBoundaries: [ENTRANCE.groundY - 0.5, ...FLOORS.map((f) => f.floorY), ROOF.masonryTopY]
    .filter((y, i, a) => a.indexOf(y) === i)
    .sort((a, b) => a - b),
  entrance: {
    azimuthDeg: ENTRANCE.azimuthDeg,
    widthDeg: (ENTRANCE.width / TOWER.outerRadius) * (180 / Math.PI),
    sillY: ENTRANCE.thresholdY,
    headY: ENTRANCE.thresholdY + ENTRANCE.height,
  },
  openings: doorways.map((d) => ({
    azimuthDeg: d.azimuthDeg,
    widthDeg: d.widthDeg,
    sillY: d.bottomY,
    headY: d.topY,
    clearWidth: drawnClearWidth(d.outerRadius, d.widthDeg),
    rake: d.bottomRake,
  })),
  passageAt,
})

/** The clear width the shell is CUT to, per doorway. */
const clearWidthOf = (d: (typeof doorways)[number]) => drawnClearWidth(d.outerRadius, d.widthDeg)

/** How far out the stone goes before the passage void, per doorway. */
const cheekOf = (d: (typeof doorways)[number]) => {
  const bands = passageAt(d.azimuthDeg).filter((b) => b.topY > d.bottomY && b.bottomY < d.topY)
  return bands.length ? Math.min(...bands.map((b) => b.innerRadius)) : TOWER.outerRadius
}

const reveals = doorways.flatMap((d) =>
  doorwayRevealBoxes({
    azimuthDeg: d.azimuthDeg,
    clearWidth: clearWidthOf(d),
    sillY: d.bottomY,
    headY: d.topY,
    bottomRake: d.bottomRake,
    innerRadiusAt,
    outerRadius: Math.min(cheekOf(d), TOWER.outerRadius),
    sectors: SECTORS,
  }),
)

const boxes = [...walls, ...reveals]

/** Is the world point inside this box? */
function inBox(b: BoxSpec, p: [number, number, number]): boolean {
  const d: [number, number, number] = [
    p[0] - b.position[0],
    p[1] - b.position[1],
    p[2] - b.position[2],
  ]
  const [qx, qy, qz, qw] = b.quaternion
  const l = rotate([-qx, -qy, -qz, qw], d)
  return (
    Math.abs(l[0]) <= b.halfExtents[0] &&
    Math.abs(l[1]) <= b.halfExtents[1] &&
    Math.abs(l[2]) <= b.halfExtents[2]
  )
}

/**
 * Is the world point inside ANY collider?
 *
 * With a bounding sphere in front of it, because coursing the reveal on two axes
 * took the tower from 1100 boxes to 2000 and the sampling tests below are a
 * linear scan per point: rejecting on a squared distance first is what keeps
 * this file at four seconds rather than fifteen.
 */
const bounded = boxes.map((b) => ({
  b,
  r2: b.halfExtents[0] ** 2 + b.halfExtents[1] ** 2 + b.halfExtents[2] ** 2,
}))
function solid(p: [number, number, number]): boolean {
  for (const s of bounded) {
    const dx = p[0] - s.b.position[0]
    const dy = p[1] - s.b.position[1]
    const dz = p[2] - s.b.position[2]
    if (dx * dx + dy * dy + dz * dz > s.r2) continue
    if (inBox(s.b, p)) return true
  }
  return false
}

/** The box's eight corners in world space. */
function corners(b: BoxSpec): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const w = rotate(b.quaternion, [
          sx * b.halfExtents[0],
          sy * b.halfExtents[1],
          sz * b.halfExtents[2],
        ])
        out.push([b.position[0] + w[0], b.position[1] + w[1], b.position[2] + w[2]])
      }
    }
  }
  return out
}

/**
 * A point in a doorway's own plane, put back into the world.
 *
 * `t` is the tangential offset from the centre line and `y` the height above the
 * sill, exactly the coordinates doorwayCutter's section is drawn in. `depth` is
 * how far past the room face the point sits — the stone the walker's capsule
 * would be pressing on.
 *
 * DEPTH IS RADIAL, AND UNTIL 2026-08-19 IT WAS NOT. This function used to put
 * the point at PERPENDICULAR distance `face + depth` from the tower's axis along
 * the doorway's own bearing, which is only the same thing on the centre line.
 * A metre round the wall it is 0.13 m further out, and the room face has not
 * moved at all — so `pointAt(d, 1.15, y, 0.05)`, asking for stone «0.05 m behind
 * the face», was asking for it at radius 3.71 in a jamb whose passage cheek is
 * at 3.695. The test was demanding a collider ON THE STAIR, the reveal obliged,
 * and the walker could not get past the fourth tread of any flight in the tower.
 *
 * The convention is the same one the shell is drawn in — the section is a
 * straight prism, so `t` stays a perpendicular offset — but the point is now
 * carried to its own azimuth before the depth is added, so `depth` means into
 * the stone at the place the point actually is.
 */
function pointAt(
  d: (typeof doorways)[number],
  t: number,
  y: number,
  depth: number,
): [number, number, number] {
  const worldY = d.bottomY + y + d.bottomRake * t
  const r = innerRadiusAt(worldY) + depth
  const rad = (d.azimuthDeg * Math.PI) / 180 + Math.asin(Math.min(0.99, Math.abs(t) / r)) * Math.sign(t)
  return [Math.sin(rad) * r, worldY, -Math.cos(rad) * r]
}

describe('the vault does not hang across a doorway onto the stair', () => {
  /**
   * The cupola's springing course is drawn WALL_EMBED below the springing and
   * that far out into the masonry (lib/cupola.ts → cupolaProfile). It is a ring
   * round the whole drum, so it crosses every doorway's bearing.
   */
  const skirtOf = (f: (typeof FLOORS)[number]) => f.cupolaSpringY - WALL_EMBED - f.floorY

  it('clears the head of every doorway the model CUTS, not just the config figure', () => {
    /*
     * chamberSection.test.ts asserts this for STAIR.doorwayHeight. The heads the
     * cutter produces are not all that height: stairDoorways() measures from
     * whatever the walker stands on IN the opening, so the opening onto storey 5
     * — reached from the middle of the 4→6 run, over treads that are climbing —
     * comes out 1.986 m above that floor rather than 1.688 m. It is the tightest
     * one in the tower and nothing had ever looked at it.
     *
     * FAILED AT EVERY DOORWAY on the values shipped before 4f92518: skirt at
     * floor + 1.350, heads at floor + 2.100.
     */
    for (const d of doorways) {
      const storey = FLOORS.reduce((best, f) =>
        Math.abs(f.floorY - d.bottomY) < Math.abs(best.floorY - d.bottomY) ? f : best,
      )
      const skirt = storey.floorY + skirtOf(storey)
      expect(d.topY, `doorway at az ${d.azimuthDeg.toFixed(1)}`).toBeLessThan(skirt)
    }
  })

  it('names the margin, and the tightest one is not the ordinary one', () => {
    const margins = doorways.map((d) => {
      const storey = FLOORS.reduce((best, f) =>
        Math.abs(f.floorY - d.bottomY) < Math.abs(best.floorY - d.bottomY) ? f : best,
      )
      return storey.floorY + skirtOf(storey) - d.topY
    })
    // eleven doorways stand on their own floor: 2.206 − 1.688
    expect(Math.max(...margins)).toBeCloseTo(0.518, 3)
    // and the one that does not is the raked opening onto storey 5
    expect(Math.min(...margins)).toBeGreaterThan(0.2)
    expect(Math.min(...margins)).toBeLessThan(0.3)
  })

  it('would not clear it at the rise and bedding that were shipped before', () => {
    // the arithmetic of the fault, so it is checkable without git: crown 2.5,
    // rise 0.9, bedding 0.25, head PLAYER-sized at 2.100
    const skirtThen = 2.5 - 0.9 - 0.25
    expect(skirtThen).toBeCloseTo(1.35, 12)
    expect(skirtThen).toBeLessThan(2.1)
    // and it came down below the arch's own springing, so no curve was visible
    const chord = drawnClearWidth(doorways[0].outerRadius, doorways[0].widthDeg)
    expect(archSpringHeight(chord, 2.1)).toBeGreaterThan(skirtThen)
  })
})

describe('the head that is drawn is a semicircle, and it is described once', () => {
  it('springs a half-width below the crown, which is what archTunnel strikes', () => {
    expect(archSpringHeight(1.2, 2.0)).toBeCloseTo(1.4, 12)
    // at the shipped doorways the head is a good third of the opening
    for (const d of doorways) {
      const w = clearWidthOf(d)
      const h = d.topY - d.bottomY
      expect(archSpringHeight(w, h)).toBeCloseTo(h - w / 2, 12)
      expect(archHalfWidthAt(w, h, 0)).toBeCloseTo(w / 2, 12)
      expect(archHalfWidthAt(w, h, h)).toBeCloseTo(0, 6)
      // and it is a real arch, not a token curve at the very top: the head is a
      // quarter of the opening's height at the least
      expect(h - archSpringHeight(w, h)).toBeGreaterThan(0.29 * h)
    }
  })

  it('never lets a collider face reach into the opening, raked or not', () => {
    /*
     * THE SAFETY PROPERTY, and the reason the facets are tangents and not
     * chords. A face that cut the arc would wall part of a doorway up, which is
     * a failure this model has had repeatedly and which is far worse than
     * leaving a sliver of stone uncollided.
     *
     * Checked against the SHEARED boundary, so the one raked doorway is tested
     * as the shape it is actually cut to rather than as an upright one.
     */
    for (const d of doorways) {
      const w = clearWidthOf(d)
      const h = d.topY - d.bottomY
      const facets = revealFacets({
        clearWidth: w,
        clearHeight: h,
        depth: w,
        tolerance: 0.017,
        rake: d.bottomRake,
      })
      for (const f of facets) {
        for (let y = 0; y <= h; y += h / 60) {
          const half = archHalfWidthAt(w, h, y)
          for (const t of [half, -half]) {
            // the drawn boundary, after doorwayCutter's own shear
            const sy = y + d.bottomRake * t
            const into = (t - f.faceT) * f.normalT + (sy - f.faceY) * f.normalY
            expect(
              into,
              `az ${d.azimuthDeg.toFixed(1)}, facet ${f.normalT.toFixed(2)},${f.normalY.toFixed(2)}`,
            ).toBeLessThan(1e-9)
          }
        }
      }
    }
  })

  it('is approximated no more coarsely than the drum the doorway is cut in', () => {
    /*
     * The wall ring is a 32-gon and its chord dips r(1 − cos(π/32)) inside the
     * drawn face. The arch is held to that same figure — the tolerance is not a
     * taste, it is the fidelity the collider already had.
     */
    const r = FLOORS[1].innerRadiusAtLevel
    const dip = r * (1 - Math.cos(Math.PI / SECTORS))
    expect(dip).toBeGreaterThan(0.015)
    expect(dip).toBeLessThan(0.02)
    const half = clearWidthOf(doorways[0]) / 2
    const n = archFacetCount(half, dip)
    expect(n).toBe(7)
    expect(half * (1 / Math.cos(Math.PI / (2 * n)) - 1)).toBeLessThanOrEqual(dip)
  })

  it('carries the threshold rake exactly, because a shear takes planes to planes', () => {
    // one doorway in the tower rakes: the opening onto storey 5, off the middle
    // of the single 4→6 flight
    const raked = doorways.filter((d) => Math.abs(d.bottomRake) > 1e-9)
    expect(raked).toHaveLength(1)

    const w = 1.2
    const h = 2.0
    const rake = 0.5
    const base = revealFacets({ clearWidth: w, clearHeight: h, depth: w, tolerance: 0.02 })
    const sheared = revealFacets({ clearWidth: w, clearHeight: h, depth: w, tolerance: 0.02, rake })
    expect(sheared).toHaveLength(base.length)
    for (let i = 0; i < base.length; i += 1) {
      // the face point rides the shear
      expect(sheared[i].faceY).toBeCloseTo(base[i].faceY + rake * base[i].faceT, 12)
      // and the normal transforms by the INVERSE TRANSPOSE, not by the shear
      const nt = base[i].normalT - rake * base[i].normalY
      const len = Math.hypot(nt, base[i].normalY)
      expect(sheared[i].normalT).toBeCloseTo(nt / len, 12)
      expect(sheared[i].normalY).toBeCloseTo(base[i].normalY / len, 12)
    }
  })
})

describe('the walker is stopped by the stone he can see', () => {
  it('holds the jamb beside every doorway, out to where the wall resumes', () => {
    /*
     * THE PROPERTY. A point in the drawn masonry beside a doorway — outside the
     * cut opening, below its head, just behind the room face — must be inside
     * some collider. It was not: wallColliders opens whole sectors, so beyond
     * the drawn jamb the wall simply stopped existing for the walker.
     *
     * FAILED before this change at every doorway that does not happen to sit
     * near a sector boundary, by up to 0.480 m of arc: az 105.49 at storey 4,
     * az 206.58 at storey 3 (0.340), az 206.92 at storey 2 (0.260).
     */
    for (const d of doorways) {
      const w = clearWidthOf(d)
      const h = d.topY - d.bottomY
      const dip = innerRadiusAt(d.bottomY) * (1 - Math.cos(Math.PI / SECTORS))
      for (let y = 0.1; y < h; y += 0.15) {
        const half = archHalfWidthAt(w, h, y)
        // from just outside the drawn opening out past the widest sector the
        // collider can open: widthDeg/2 + sectorDeg, in metres of arc
        const reach = ((d.widthDeg / 2 + sectorDeg) * Math.PI) / 180 * innerRadiusAt(d.bottomY)
        for (let t = half + dip + 0.01; t <= reach; t += 0.08) {
          for (const side of [1, -1]) {
            const p = pointAt(d, side * t, y, 0.05)
            expect(
              solid(p),
              `stone at az ${d.azimuthDeg.toFixed(1)}, ${(side * t).toFixed(2)} m across, ${y.toFixed(2)} m up`,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('holds the haunch of the arch, which had no collider at all', () => {
    /*
     * Above the springing the drawn opening curves in and the collided one did
     * not: the whole spandrel was walkable. At the walker's own head height —
     * 1.60 m, and the arch springs at about 1.06 — the drawn opening is 0.64 m
     * wide against a collided 1.26 m, so he put his head 0.31 m into the stone
     * on each side and the camera came out through the face.
     *
     * Sampled in polar about the head's own centre, because that is the
     * direction the tolerance is measured in: a tangent facet stands off the
     * curve RADIALLY, so a margin taken across the opening would demand
     * coverage inside the sliver the tangents are known to leave.
     */
    for (const d of doorways) {
      const w = clearWidthOf(d)
      const h = d.topY - d.bottomY
      const half = w / 2
      const dip = innerRadiusAt(d.bottomY) * (1 - Math.cos(Math.PI / SECTORS))
      const spring = archSpringHeight(w, h)
      for (let deg = 2; deg <= 178; deg += 4) {
        const a = (deg * Math.PI) / 180
        for (let rho = half + dip + 0.005; rho <= half + 0.3; rho += 0.05) {
          const t = rho * Math.cos(a)
          const y = spring + rho * Math.sin(a)
          const p = pointAt(d, t, y, 0.05)
          expect(
            solid(p),
            `haunch at az ${d.azimuthDeg.toFixed(1)}, ${t.toFixed(2)} m across, ${y.toFixed(2)} m up`,
          ).toBe(true)
        }
      }
    }
  })

  it('leaves the doorway itself open, and says by how much it does not', () => {
    /*
     * THE OTHER DIRECTION, and the one this repository has been burned by: a
     * collider standing in a drawn opening. It was there too, and nobody had
     * looked: a wall box overhangs its own sector by 1.2 chords so that
     * neighbours meet with no seam, and beside a doorway that overhang is
     * invisible stone in a hole.
     *
     * MEASURED BEFORE slideOffOpenings(): 0.070 m eaten at az 102.4, 0.140 at
     * 205.7, 0.220 at 206.3, 0.230 at 218.5, and 0.570 at the raked opening onto
     * storey 5 — where the collider also treated a sheared hole as an upright
     * one. Eleven of the twelve are exactly zero now; the twelfth keeps 0.040 m
     * at 2.10 m above its sill, where its own arch is 0.11 m wide and 0.5 m over
     * a walker's head.
     *
     * Stated as a bound rather than as a boolean, because a boolean here would
     * pass on a coarse grid and this is the sort of thing that must be read off
     * in metres.
     */
    let worst = 0
    let where = ''
    for (const d of doorways) {
      const w = clearWidthOf(d)
      const h = d.topY - d.bottomY
      for (let y = 0.03; y < h; y += 0.03) {
        const half = archHalfWidthAt(w, h, y)
        for (const side of [1, -1]) {
          for (let t = half; t > 0; t -= 0.01) {
            const hit = [0.02, 0.08, 0.15].some((depth) => solid(pointAt(d, side * t, y, depth)))
            if (!hit) break
            if (half - t > worst) {
              worst = half - t
              where = `az ${d.azimuthDeg.toFixed(1)} at ${y.toFixed(2)} m up`
            }
          }
        }
      }
    }
    expect(worst, `worst intrusion ${where}`).toBeLessThan(0.05)
  })

  it('does not put the reveal on the stair — at every corner, in RADIUS', () => {
    /*
     * The reveal is stone in a jamb, and the jamb is 0.19 m thick with the
     * passage behind it. A box that ran past the flight's inner cheek would
     * stand on the treads.
     *
     * THIS TEST EXISTED AND PASSED WHILE THE STAIR WAS BLOCKED, because it asked
     * the wrong question: it took the box's centre, projected it onto the
     * doorway's own outward bearing, added the half-thickness, and compared THAT
     * to the cheek. A perpendicular distance is only a radius on the centre line.
     * A jamb slab runs tangentially, and a face held 3.695 m from the axis along
     * one bearing stands at 4.148 m of RADIUS 1.884 m round the wall — 0.45 m
     * inside a passage 1.03 m wide, over 27° of arc, on both jambs of all twelve
     * doorways. Measured on b2f4c82 as shipped: worst corner 0.4776 m past the
     * cheek, and the walker stopped on the fourth tread of every flight.
     *
     * So it is asked of all eight corners and in the only unit the passage is
     * described in.
     */
    let worst = -Infinity
    let where = ''
    for (const d of doorways) {
      const cheek = Math.min(cheekOf(d), TOWER.outerRadius)
      const own = doorwayRevealBoxes({
        azimuthDeg: d.azimuthDeg,
        clearWidth: clearWidthOf(d),
        sillY: d.bottomY,
        headY: d.topY,
        bottomRake: d.bottomRake,
        innerRadiusAt,
        outerRadius: cheek,
        sectors: SECTORS,
      })
      expect(own.length).toBeGreaterThan(0)
      for (const b of own) {
        for (const c of corners(b)) {
          const over = Math.hypot(c[0], c[2]) - cheek
          if (over > worst) {
            worst = over
            where = `az ${d.azimuthDeg.toFixed(1)} at ${c[1].toFixed(2)} m, cheek ${cheek.toFixed(3)}`
          }
        }
      }
    }
    expect(worst, `worst corner past the cheek ${where}`).toBeLessThanOrEqual(1e-6)
  })

  it('stands on the room face all the way round, not on a chord across it', () => {
    /*
     * The other side of the same coin. A reveal box is a cuboid turned to lay
     * its face on the opening, so its faces are chords of the drum, and a chord
     * that is right at one end is wrong at the other. Both ends are somewhere it
     * matters: outside the arc is stone in the stair, inside it is stone standing
     * in the room where the visitor walks.
     *
     * The budget is the one the whole collider is built to — the wall ring's own
     * chord dip, r(1 − cos(π/32)) — TWICE, because two axes each spend it: the
     * cone, which seats a course at the lowest room face it spans, and the drum,
     * which splits its error between a course's two ends. 0.040 m at the worst
     * corner in the tower, against a 32-gon that is already 0.021 m off the
     * drawn face at that radius.
     */
    let proud = 0
    let where = ''
    for (const d of doorways) {
      const cheek = Math.min(cheekOf(d), TOWER.outerRadius)
      const own = doorwayRevealBoxes({
        azimuthDeg: d.azimuthDeg,
        clearWidth: clearWidthOf(d),
        sillY: d.bottomY,
        headY: d.topY,
        bottomRake: d.bottomRake,
        innerRadiusAt,
        outerRadius: cheek,
        sectors: SECTORS,
      })
      const tolerance = innerRadiusAt(d.bottomY) * (1 - Math.cos(Math.PI / SECTORS))
      for (const b of own) {
        for (const c of corners(b)) {
          const into = innerRadiusAt(c[1]) - Math.hypot(c[0], c[2])
          if (into > proud) {
            proud = into
            where = `az ${d.azimuthDeg.toFixed(1)} at ${c[1].toFixed(2)} m, tolerance ${tolerance.toFixed(4)}`
          }
        }
      }
    }
    expect(proud, `worst corner standing into the room ${where}`).toBeLessThan(0.045)
  })

  it('costs a bounded number of boxes', () => {
    /*
     * WHAT THE COURSING COSTS, stated rather than hidden.
     *
     * Nine facets — seven over the head and a jamb each side — cut into courses
     * on BOTH of the box's free axes: about five up the jamb for the cone and
     * seven into the stone for the drum. That is 995 boxes over twelve doorways
     * where the single-slab version spent 307, and the tower's whole collider set
     * goes from about 1100 to about 2000.
     *
     * It is not free and it is not open-ended: the head is held to the depth the
     * SQUARE hole actually needs filling to rather than the jambs' reach (see
     * revealFacets → headDepth, which halved this), and the courses into the
     * stone are cut adaptively, longer near the doorway's axis where the drum
     * falls away more slowly. Both were worth doing; a third box per course was
     * not worth 900 more colliders.
     */
    expect(reveals.length / doorways.length).toBeLessThan(100)
    expect(reveals.length).toBeLessThan(2 * walls.length)
  })
})
