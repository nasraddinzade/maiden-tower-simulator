/**
 * Collision geometry, built from primitives — deliberately NOT the CSG mesh.
 *
 * docs/optimization-addendum.md, Phases 4 and 6: "визуальная геометрия и
 * коллизионная — РАЗНЫЕ меши... Trimesh-коллайдер по CSG-мешу башни убьёт
 * физику". There is a second, measured reason: the CSG result is not watertight
 * (14 183 boundary edges out of 26 876 at the time of writing), and a trimesh
 * collider off a non-watertight mesh gives unreliable contacts — which is
 * exactly the wall-tunnelling seen while walking the model.
 *
 * three.js-free so it can be unit-tested (CLAUDE.md rule 6). Returns plain
 * specs; the React layer turns them into rapier colliders.
 *
 * Conventions (CLAUDE.md rule 3): metres, Y up, north = -Z, east = +X, azimuth
 * clockwise from north.
 */

import type { PassageSection } from './staircase'

const DEG = Math.PI / 180

/** One cuboid collider. Local +X is radial (outward), +Z tangential, +Y up. */
export interface BoxSpec {
  /** Half-extents along the box's own X, Y, Z. */
  halfExtents: [number, number, number]
  position: [number, number, number]
  /** Orientation as a quaternion (x, y, z, w). */
  quaternion: [number, number, number, number]
  /** What this box is, for the F4 debug view and for tests. */
  kind: 'wall' | 'passageOuter' | 'floor' | 'ramp' | 'guard'
}

/**
 * The yaw that points a box's local +X radially OUTWARD at an azimuth.
 *
 * rotateY(π/2 − az) sends +X to (sin az, 0, −cos az). The first version of this
 * module used −az, which sends +X TANGENTIALLY — every box was turned 90°, so
 * walls presented their thin side to the room (the face sat 8–13 cm off) and
 * the floor annuli ran their radial extent sideways, leaving ring-shaped holes
 * a walker fell straight through. The orientation is now pinned by tests that
 * transform the actual corners.
 */
export function radialYaw(azimuthRad: number): number {
  return Math.PI / 2 - azimuthRad
}

/** Quaternion for: yaw about world Y, then tilt about the box's local Z axis. */
export function yawThenTilt(yaw: number, tilt: number): [number, number, number, number] {
  // q = qYaw * qTilt, with qYaw about (0,1,0) and qTilt about (0,0,1)
  const cy = Math.cos(yaw / 2)
  const sy = Math.sin(yaw / 2)
  const ct = Math.cos(tilt / 2)
  const st = Math.sin(tilt / 2)
  // (0, sy, 0, cy) * (0, 0, st, ct)
  return [sy * st, sy * ct, cy * st, cy * ct]
}

/** Quaternion for: yaw about world Y, then pitch about the box's local X axis. */
export function yawThenPitch(yaw: number, pitch: number): [number, number, number, number] {
  const cy = Math.cos(yaw / 2)
  const sy = Math.sin(yaw / 2)
  const cp = Math.cos(pitch / 2)
  const sp = Math.sin(pitch / 2)
  // (0, sy, 0, cy) * (sp, 0, 0, cp)
  return [cy * sp, sy * cp, -sy * sp, cy * cp]
}

/** Apply a quaternion to a vector. */
export function rotate(
  q: [number, number, number, number],
  v: [number, number, number],
): [number, number, number] {
  const [qx, qy, qz, qw] = q
  const [vx, vy, vz] = v
  // t = 2 q × v; v' = v + qw t + q × t
  const tx = 2 * (qy * vz - qz * vy)
  const ty = 2 * (qz * vx - qx * vz)
  const tz = 2 * (qx * vy - qy * vx)
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ]
}

/**
 * Where the stair passage sits at one azimuth: a vertical band and a radial span.
 *
 * Called PassageWindow, and the function below passageWindowsAt(), until
 * 2026-08-10. "Window" meant a gap in the collider band, which was harmless
 * while the tower's windows were all in chamber walls somewhere else. Since
 * [OWNER] said the openings are at the ends of the stair passages there really
 * are windows in a passage, and the old name would have read as a promise this
 * type does not keep. Same shape, honest name.
 */
export interface PassageBand {
  bottomY: number
  topY: number
  /** Room-side boundary of the void — the back of the jamb. */
  innerRadius: number
  outerRadius: number
}

export interface WallColliderParams {
  /** Number of boxes around the circumference. The addendum asks for 24–32. */
  sectors: number
  outerRadius: number
  /** Inner (room-side) face radius at a height. */
  innerRadiusAt: (y: number) => number
  /** Bottom and top of the wall. */
  baseY: number
  topY: number
  /** One band per storey keeps each box short enough for the taper to matter little. */
  bandBoundaries: number[]
  /** Openings that must not be walled over, as azimuth ranges and height ranges. */
  entrance: { azimuthDeg: number; widthDeg: number; sillY: number; headY: number }
  /**
   * Further holes right through the wall — the arched doorways onto the stair.
   * Treated exactly like the entrance: no collider across the opening, wall
   * above and below it intact.
   */
  openings?: Array<{ azimuthDeg: number; widthDeg: number; sillY: number; headY: number }>
  /**
   * For an azimuth, the parts of the passage that cross it. Where the passage
   * crosses, the wall box starts at the passage's OUTER face instead of the
   * room face, so the passage stays open but its outer side is still solid.
   */
  passageAt: (azimuthDeg: number) => PassageBand[]
}

/** Shortest signed difference a − b, in (−180, 180]. */
function angleDelta(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180
}

/**
 * `span` with every range in `holes` removed, as the pieces that survive.
 * Used to stop a collider being emitted across an opening.
 */
export function subtractRanges(
  span: [number, number],
  holes: Array<[number, number]>,
): Array<[number, number]> {
  let pieces: Array<[number, number]> = [span]
  for (const [hb, ht] of holes) {
    const next: Array<[number, number]> = []
    for (const [pb, pt] of pieces) {
      if (ht <= pb || hb >= pt) {
        next.push([pb, pt]) // no overlap
        continue
      }
      if (hb > pb) next.push([pb, Math.min(hb, pt)])
      if (ht < pt) next.push([Math.max(ht, pb), pt])
    }
    pieces = next
  }
  return pieces.filter(([b, t]) => t - b > 1e-9)
}

/**
 * A ring of boxes per band, following the wall's inner face.
 *
 * Each box is tilted by the taper angle so its inner face lies ON the cone
 * rather than chording it — otherwise a 3.6 m band would stop the walker up to
 * 0.16 m short of the wall they can see.
 */
/**
 * The thinnest jamb that may be built beside a passage, metres.
 *
 * Not a measurement — a floor. Anything thinner is a modelling accident, and the
 * alternative to a thin jamb is no jamb, which is a hole in the room wall.
 */
export const MIN_JAMB_THICKNESS = 0.15

/** A passage section that knows which flight it belongs to. */
export type FlightSection = PassageSection & { flight: number }

/**
 * The passage crossings at one azimuth, ONE OPENING PER FLIGHT.
 *
 * This used to live in TowerColliders and merge any two crossings less than
 * 0.5 m apart vertically. That was right while the stair was a single helix
 * wrapping 1.4 turns: the two crossings at an azimuth were then some 17 m apart
 * and could not be confused. Stacking the flights killed that premise, and this
 * was not touched.
 *
 * What it cost, measured on the built model: the flights run one above another
 * at every azimuth with 0.654 m of stone between them, while a sector samples
 * ±8.625° of arc, over which the stair rises 0.865 m. The sampled crossings
 * therefore OVERLAP before the tolerance is consulted, and three storeys'
 * passages merged into one opening — 9.97 m tall, 14 sections, at azimuth
 * 73.125. A merged opening takes the innerRadius of the LOWEST flight, the wall
 * thins going up, so the jamb came out zero or negative thickness and was
 * dropped: 7 m tall open slots in the room wall at seven of the 32 sectors, and
 * falls of up to 12.3 m for anyone stepping off a slab at the wall.
 *
 * Keyed on the flight, two passages cannot be confused however close they run.
 * That is the real invariant and it survives whatever the flights do next.
 */
export function stairPassageBandsAt(
  sections: FlightSection[],
  azimuthDeg: number,
  sectorDeg: number,
  marginDeg = 3,
): PassageBand[] {
  const byFlight = new Map<number, PassageBand>()
  for (const s of sections) {
    const d = Math.abs(((((s.azimuthDeg - azimuthDeg) % 360) + 540) % 360) - 180)
    if (d > sectorDeg / 2 + marginDeg) continue
    const w = byFlight.get(s.flight)
    if (!w) {
      byFlight.set(s.flight, {
        bottomY: s.bottomY,
        topY: s.topY,
        innerRadius: s.innerRadius,
        outerRadius: s.outerRadius,
      })
      continue
    }
    w.bottomY = Math.min(w.bottomY, s.bottomY)
    w.topY = Math.max(w.topY, s.topY)
    w.outerRadius = Math.max(w.outerRadius, s.outerRadius)
    // within ONE flight the jamb is still only as thick as its thinnest crossing
    w.innerRadius = Math.min(w.innerRadius, s.innerRadius)
  }
  return [...byFlight.values()].sort((a, b) => a.bottomY - b.bottomY)
}


export function wallColliders(p: WallColliderParams): BoxSpec[] {
  const out: BoxSpec[] = []
  const sectorDeg = 360 / p.sectors
  // half-width of the chord, plus a little so neighbours overlap and leave no seam
  const halfChord = p.outerRadius * Math.tan((sectorDeg / 2) * DEG) * 1.06

  for (let b = 0; b < p.bandBoundaries.length - 1; b++) {
    const y0 = p.bandBoundaries[b]
    const y1 = p.bandBoundaries[b + 1]
    if (y1 <= y0) continue
    const midY = (y0 + y1) / 2
    const halfHeight = (y1 - y0) / 2

    // taper of the inner face across this band: positive as the radius grows upward
    const slope = (p.innerRadiusAt(y1) - p.innerRadiusAt(y0)) / (y1 - y0)
    const tilt = Math.atan(slope)
    const innerMid = p.innerRadiusAt(midY)

    for (let s = 0; s < p.sectors; s++) {
      const azimuthDeg = s * sectorDeg + sectorDeg / 2

      /**
       * Everything that interrupts the wall at this azimuth, as height ranges.
       *
       * Two kinds, and they must be handled the same way — as interruptions
       * within a band, never by dropping the whole band. The entrance is a
       * 2 m doorway; dropping its band opened a 7 m gash you could walk out of.
       */
      const cuts: Array<{
        bottomY: number
        topY: number
        startRadius: number | null
        jambTo?: number
      }> = []

      for (const o of [p.entrance, ...(p.openings ?? [])]) {
        const d = Math.abs(angleDelta(azimuthDeg, o.azimuthDeg))
        if (d <= o.widthDeg / 2 + sectorDeg / 2) {
          // right through the wall: no box at all across the opening
          cuts.push({ bottomY: o.sillY, topY: o.headY, startRadius: null })
        }
      }
      for (const w of p.passageAt(azimuthDeg)) {
        /*
         * The passage is solid on BOTH sides: the jamb between it and the room,
         * and the mass beyond it. Emitting only the outer side left the jamb
         * without a collider, so a walker crossed 0.25 m of drawn masonry and
         * stepped straight onto the stair anywhere along its length.
         */
        cuts.push({
          bottomY: w.bottomY,
          topY: w.topY,
          startRadius: w.outerRadius,
          jambTo: w.innerRadius,
        })
      }

      const inBand = cuts
        .filter((c) => c.topY > y0 && c.bottomY < y1)
        .sort((a, c) => a.bottomY - c.bottomY)

      /** Heights at this azimuth where the wall is open right through. */
      const openRanges: Array<[number, number]> = inBand
        .filter((c) => c.startRadius === null)
        .map((c) => [Math.max(c.bottomY, y0), Math.min(c.topY, y1)])

      if (inBand.length === 0) {
        out.push(boxAt(azimuthDeg, innerMid, p.outerRadius, midY, halfHeight, halfChord, tilt, 'wall', sectorDeg))
        continue
      }

      let cursor = y0
      for (const c of inBand) {
        const cTop = Math.min(c.topY, y1)
        const cBottom = Math.max(c.bottomY, y0)
        if (cBottom > cursor) {
          const mid = (cursor + cBottom) / 2
          out.push(
            boxAt(azimuthDeg, p.innerRadiusAt(mid), p.outerRadius, mid, (cBottom - cursor) / 2, halfChord, tilt, 'wall', sectorDeg),
          )
        }
        if (cTop > cBottom && c.startRadius !== null) {
          const mid = (cBottom + cTop) / 2
          const halfH = (cTop - cBottom) / 2
          // the mass beyond the passage
          out.push(
            boxAt(azimuthDeg, c.startRadius, p.outerRadius, mid, halfH, halfChord, tilt, 'passageOuter', sectorDeg),
          )

          /*
           * The jamb — but NOT across a doorway.
           *
           * The doorway and the passage occupy the same azimuth and overlapping
           * heights, so emitting the jamb blindly walls the doorway up: cut in
           * the drawn stone, solid in the physics. You could see the stair and
           * not walk into it. The jamb is therefore emitted only over the parts
           * of its band that no opening covers.
           */
          if (c.jambTo !== undefined) {
            for (const [jb, jt] of subtractRanges([cBottom, cTop], openRanges)) {
              const jMid = (jb + jt) / 2
              const face = p.innerRadiusAt(jMid)
              if (jt - jb <= 0.02) continue
              /*
               * A JAMB TOO THIN TO BUILD IS STILL A JAMB. It used to be skipped.
               *
               * The thickness is jambTo − face, and the wall thins going up, so
               * whenever a passage opening spans more height than the section it
               * was measured from, the face outruns jambTo and the difference
               * goes to zero or negative. The old guard read that as "nothing to
               * build" and emitted nothing — which does not leave a thin wall, it
               * leaves NO wall, and a walker stepping off the storey slab at that
               * azimuth falls. Measured before the fix: 25 jambs dropped, the
               * worst leaving a 6.97 m tall open slot, and falls of up to 12.3 m.
               *
               * The cause was upstream — passages from different flights being
               * merged into one opening — and that is fixed. This is the second
               * lock: a degenerate thickness now yields a minimum jamb instead of
               * a hole, so the same class of upstream mistake can never again
               * express itself as somewhere to fall.
               */
              const jambTo = Math.max(c.jambTo, face + MIN_JAMB_THICKNESS)
              out.push(
                boxAt(azimuthDeg, face, jambTo, jMid, (jt - jb) / 2, halfChord, tilt, 'wall', sectorDeg),
              )
            }
          }
        }
        cursor = Math.max(cursor, cTop)
      }
      if (cursor < y1) {
        const mid = (cursor + y1) / 2
        out.push(
          boxAt(azimuthDeg, p.innerRadiusAt(mid), p.outerRadius, mid, (y1 - cursor) / 2, halfChord, tilt, 'wall', sectorDeg),
        )
      }
    }
  }

  return out
}

/**
 * Thickness of a wall box, metres.
 *
 * The wall is up to 5 m thick, but a collider spanning all of it gives every box
 * a huge axis-aligned bounding box overlapping half a dozen neighbours, and a
 * ring of those drops the frame to about a second. Only the inner face is ever
 * touched, so the boxes hug it. 0.8 m cannot be tunnelled: the controller sweeps
 * the capsule, and even unswept, 1.4 m/s at 30 fps moves 0.05 m per step.
 */
const WALL_BOX_THICKNESS = 0.8

function boxAt(
  azimuthDeg: number,
  innerRadius: number,
  outerRadius: number,
  midY: number,
  halfHeight: number,
  _halfChordAtOuter: number,
  tilt: number,
  kind: BoxSpec['kind'],
  sectorDeg: number,
): BoxSpec {
  const thickness = Math.max(0.05, Math.min(outerRadius - innerRadius, WALL_BOX_THICKNESS))
  const midRadius = innerRadius + thickness / 2
  // chord at this box's own radius, with enough overlap that neighbours meet
  const halfChord = (midRadius + thickness) * Math.tan((sectorDeg / 2) * DEG) * 1.2
  const rad = azimuthDeg * DEG
  // Tilt sign: rotating +X (radial) about local Z carries the upper half of the
  // face INWARD for a positive angle, and the room widens upward, so the tilt
  // that lays the face on the cone is the NEGATIVE of the taper angle.
  return {
    halfExtents: [thickness / 2, halfHeight, halfChord],
    position: [Math.sin(rad) * midRadius, midY, -Math.cos(rad) * midRadius],
    quaternion: yawThenTilt(radialYaw(rad), -tilt),
    kind,
  }
}

export interface FloorColliderParams {
  /** Segments around the ring. */
  sectors: number
  floorY: number
  thickness: number
  /** Central opening; the slab is an annulus between this and outerRadius. */
  oculusRadius: number
  outerRadius: number
  /**
   * Where the stair pierces the slab. `innerRadius` matters as much as the arc:
   * the flight runs inside the WALL, so only the outer lip of the slab has to
   * go. Dropping the whole wedge instead took the floor out from the oculus to
   * the wall over 50° of arc, and since the visible slab kept its inner part,
   * you walked onto floor that was drawn but had no collider under it and fell
   * a storey.
   */
  stairwell?: { centreAzimuthDeg: number; widthDeg: number; innerRadius: number }
}

/**
 * An annular slab as a ring of boxes, with the oculus and the stairwell left out.
 *
 * The addendum: "пол яруса — cylinder-коллайдер с вырезом под окулюс,
 * собранный из кольцевых сегментов". Rapier has no annulus, so the ring is
 * segments; the stairwell is simply a run of segments that are not emitted.
 */
export function floorColliders(p: FloorColliderParams): BoxSpec[] {
  if (p.outerRadius <= p.oculusRadius) return []
  const out: BoxSpec[] = []
  const sectorDeg = 360 / p.sectors
  const halfChord = p.outerRadius * Math.tan((sectorDeg / 2) * DEG) * 1.06

  for (let s = 0; s < p.sectors; s++) {
    const azimuthDeg = s * sectorDeg + sectorDeg / 2

    // default: the full ring segment, oculus out to the wall
    let inner = p.oculusRadius
    let outer = p.outerRadius

    if (p.stairwell) {
      const d = Math.abs(angleDelta(azimuthDeg, p.stairwell.centreAzimuthDeg))
      if (d <= p.stairwell.widthDeg / 2) {
        /*
         * Inside the well the segment is SHORTENED, not dropped.
         *
         * The flight runs in the wall, so only the slab's outer lip has to go.
         * Dropping the whole wedge cut the floor from the oculus to the wall
         * over some 50° of arc while the drawn slab kept its inner part — so
         * you walked onto floor that was visibly there, with nothing under it,
         * and fell a storey. Reproduced at azimuth 132° on storey 2.
         */
        outer = p.stairwell.innerRadius
        if (outer - inner < 0.15) continue // nothing worth keeping
      }
    }

    const rad = azimuthDeg * DEG
    const half = (outer - inner) / 2
    const mid = (outer + inner) / 2
    out.push({
      halfExtents: [half, p.thickness / 2, halfChord],
      position: [Math.sin(rad) * mid, p.floorY - p.thickness / 2, -Math.cos(rad) * mid],
      quaternion: yawThenTilt(radialYaw(rad), 0),
      kind: 'floor',
    })
  }
  return out
}

/**
 * Radial thickness of a guard-ring collider box, metres.
 *
 * Deliberately thicker than the glass it stands for. OPENING_GUARD.thickness is
 * 20 mm, and 20 mm is thinner than a solver step: WALL_BOX_THICKNESS's note runs
 * this same sum the other way — at 1.4 m/s and 30 fps the walker covers 0.047 m
 * between steps, 0.087 m at the run speed. A pane-thin collider is exactly the
 * shape a contact can be missed on, and the thing missing it falls down the hole
 * the guard exists to close. 0.12 m is more than the worst step and still well
 * under a 0.3 m capsule radius, so the walker is never stopped anywhere they
 * could see they had room to stand.
 */
const GUARD_BOX_THICKNESS = 0.12

export interface GuardRingParams {
  /** Boxes round the ring. */
  sectors: number
  /** Radius of the opening being guarded. This is the ring's INNER face. */
  openingRadius: number
  /** World Y of the floor surface the guard stands on. */
  floorY: number
  /** Height of the guard above that surface. */
  height: number
  /** Radial thickness of the boxes; defaults to GUARD_BOX_THICKNESS. */
  thickness?: number
}

/**
 * A closed ring of boxes standing on a floor round a hole in it.
 *
 * The ring grows OUTWARD from the opening's edge, and that is the whole of its
 * collision design. floorColliders() ends its annulus at exactly `oculusRadius`,
 * so putting the guard's inner face on the same radius makes floor and guard
 * meet on one plane: no strip of unguarded floor between them, and nothing
 * standing over the void with no slab under it.
 *
 * It is a WALL, not a step, which is the distinction this controller cares
 * about. Its bottom face is flush with the floor surface — floorColliders hangs
 * its boxes below floorY, so there is no lip at the join in either direction —
 * and its only horizontal face is the top, a metre up, far past anything the
 * autostep will try to mount. The walker walks into it and stops, the way they
 * stop at a wall. Nothing here has to be climbed, so the rule that governs every
 * walking surface in this model — ramps, never lips — simply does not apply: a
 * guard the walker COULD get onto would be a launch pad into the hole.
 *
 * Rapier has no annulus, so the ring is segments, like the floors. Each box's
 * inner face is tangent to the opening at its own azimuth, which leaves the free
 * space a hair wider at the corners than the drawn circle — 21 mm on a 1.2 m
 * ring at 16 sectors, against a 300 mm capsule.
 */
export function guardRingBoxes(p: GuardRingParams): BoxSpec[] {
  const out: BoxSpec[] = []
  if (p.openingRadius <= 0 || p.height <= 0 || p.sectors < 3) return out

  const thickness = p.thickness ?? GUARD_BOX_THICKNESS
  const sectorDeg = 360 / p.sectors
  // half-chord taken at the OUTER face, as floorColliders does: measured at the
  // mid radius the corners fall short of the sector and a gap opens between
  // neighbours — narrow, but the thing on the far side of it is a drop
  const halfChord = (p.openingRadius + thickness) * Math.tan((sectorDeg / 2) * DEG) * 1.06
  const midRadius = p.openingRadius + thickness / 2

  for (let s = 0; s < p.sectors; s++) {
    const rad = (s * sectorDeg + sectorDeg / 2) * DEG
    out.push({
      halfExtents: [thickness / 2, p.height / 2, halfChord],
      position: [
        Math.sin(rad) * midRadius,
        // stands ON the surface: floorColliders hangs its slab below floorY
        p.floorY + p.height / 2,
        -Math.cos(rad) * midRadius,
      ],
      quaternion: yawThenTilt(radialYaw(rad), 0),
      kind: 'guard',
    })
  }
  return out
}

export interface RampStep {
  azimuthDeg: number
  treadY: number
  midRadius: number
}

/**
 * The stair's walking surface as a chain of inclined boxes.
 *
 * docs/optimization-addendum.md: "лестница — НЕ отдельный коллайдер на каждую
 * ступень. Один наклонный box-коллайдер вдоль марша (пандус) + autostep." One
 * box cannot follow a helix, so it is one inclined box per couple of steps —
 * still an order of magnitude fewer shapes than treads, and every one convex.
 *
 * Each box's top face passes through the two nosings it spans, so the walker's
 * feet track the visible treads to within half a riser. The pitch (~34° for a
 * 0.2 rise on a 0.3 going) stays well inside the controller's 60° climb limit.
 */
export function stairRampBoxes(
  steps: RampStep[],
  width: number,
  stepsPerBox = 2,
  thickness = 0.3,
): BoxSpec[] {
  const out: BoxSpec[] = []
  if (steps.length < 2) return out

  for (let i = 0; i < steps.length - 1; i += stepsPerBox) {
    const a = steps[i]
    const b = steps[Math.min(i + stepsPerBox, steps.length - 1)]

    const ra = a.azimuthDeg * DEG
    const rb = b.azimuthDeg * DEG
    const pa: [number, number, number] = [Math.sin(ra) * a.midRadius, a.treadY, -Math.cos(ra) * a.midRadius]
    const pb: [number, number, number] = [Math.sin(rb) * b.midRadius, b.treadY, -Math.cos(rb) * b.midRadius]

    const run = Math.hypot(pb[0] - pa[0], pb[2] - pa[2])
    const rise = pb[1] - pa[1]
    if (run < 1e-6) continue

    // heading of the chord: the yaw that points local +Z along the travel
    const heading = Math.atan2(pb[0] - pa[0], pb[2] - pa[2])
    // that same yaw expressed in radialYaw terms: local +Z of radialYaw(θ) is
    // tangential; easiest is to build the yaw directly so +Z = travel direction
    const yaw = heading
    // pitch about local X: positive lifts +Z, sign fixed by the corner test
    const pitch = -Math.atan2(rise, run)

    const length = Math.hypot(run, rise)
    const mid: [number, number, number] = [
      (pa[0] + pb[0]) / 2,
      (pa[1] + pb[1]) / 2,
      (pa[2] + pb[2]) / 2,
    ]
    const q = yawThenPitch(yaw, pitch)
    // sink the centre half a thickness along the box's own down-normal, so the
    // TOP face carries the nosings
    const down = rotate(q, [0, -thickness / 2, 0])

    out.push({
      // slight length overlap so consecutive boxes leave no seam at the joint
      halfExtents: [width / 2, thickness / 2, length / 2 + 0.05],
      position: [mid[0] + down[0], mid[1] + down[1], mid[2] + down[2]],
      quaternion: q,
      kind: 'ramp',
    })
  }
  return out
}

export interface StraightStairGuardParams {
  /** Foot of the flight's walking line — the point the ramp chain starts at. */
  foot: RampStep
  /** Head of it. Must differ from the foot in plan. */
  head: RampStep
  /** Clear width between the two guards: the full width of the walking surface. */
  width: number
  /** How far the guard stands above the walking line. */
  height: number
  /** Lateral thickness of each slab; defaults to GUARD_BOX_THICKNESS. */
  thickness?: number
}

/**
 * A guard down each side of a STRAIGHT flight, as one upright slab per side.
 *
 * It is a wall, not a step, so guardRingBoxes' argument carries over whole: the
 * inner face sits on the walking surface's own edge, at exactly ±width/2, which
 * takes nothing off the width the ramp chain gives; it grows OUTWARD from that
 * edge; and its only horizontal face is the top, a guard height up and far past
 * anything the autostep will try to mount. Nothing here has to be climbed, so
 * the rule that governs every walking surface in this model — ramps, never lips
 * — does not apply. A guard the walker could get onto beside a flight would be
 * a launch pad off it.
 *
 * UPRIGHT, and that is the whole of the shape's design. The obvious slab is one
 * pitched to the rake, occupying exactly the band the drawn balustrade does. But
 * pitching a cuboid leans its END faces back with it, and at the head of a
 * flight that is fatal: a 1.2 m guard on a 29° rake carries its top edge 0.6 m
 * further down the flight than its bottom edge, so from about knee height upward
 * the slab stops short of the landing — and the landing is the one place on a
 * flight where the drop beside the walker is its whole rise. An upright slab
 * makes the opposite error, hanging below the walking line at the top of the
 * flight and standing proud of the rail at the bottom, and both of those are in
 * places nothing can reach: under the flight, where the clear height only
 * becomes a walker's own within the last stride against the wall, and above a
 * guard nobody's capsule can top.
 *
 * One slab, not a chain: the flight is straight, so a single box IS the shape,
 * and a chain would only introduce seams to get wrong.
 */
export function straightStairGuardBoxes(p: StraightStairGuardParams): BoxSpec[] {
  if (p.width <= 0 || p.height <= 0) return []
  const thickness = p.thickness ?? GUARD_BOX_THICKNESS
  const footRad = p.foot.azimuthDeg * DEG
  const headRad = p.head.azimuthDeg * DEG
  const fx = Math.sin(footRad) * p.foot.midRadius
  const fz = -Math.cos(footRad) * p.foot.midRadius
  const hx = Math.sin(headRad) * p.head.midRadius
  const hz = -Math.cos(headRad) * p.head.midRadius

  const run = Math.hypot(hx - fx, hz - fz)
  if (run < 1e-6) return []

  // local +Z along the travel, as stairRampBoxes builds it, so the two agree on
  // which way is "across the flight" without either restating the other's maths
  const quaternion = yawThenPitch(Math.atan2(hx - fx, hz - fz), 0)
  const lateral = rotate(quaternion, [1, 0, 0])

  const bottomY = Math.min(p.foot.treadY, p.head.treadY)
  const topY = Math.max(p.foot.treadY, p.head.treadY) + p.height
  const offset = p.width / 2 + thickness / 2

  return [-1, 1].map(
    (side): BoxSpec => ({
      halfExtents: [thickness / 2, (topY - bottomY) / 2, run / 2],
      position: [
        (fx + hx) / 2 + side * lateral[0] * offset,
        (bottomY + topY) / 2,
        (fz + hz) / 2 + side * lateral[2] * offset,
      ],
      quaternion,
      kind: 'guard',
    }),
  )
}

/**
 * Depth of the entrance sill slab, metres.
 *
 * Nothing measures it and nothing needs to: only the sill's TOP face is ever
 * touched, and that face is pinned to the threshold. This is the figure the
 * component carried before the passage moved into this module.
 */
const ENTRANCE_SILL_THICKNESS = 0.3

export interface EntrancePassageParams {
  azimuthDeg: number
  /** Clear width of the doorway; the passage is cut this wide right through. */
  width: number
  /** Clear height of the opening above the threshold. */
  height: number
  /** World Y of the threshold — the top of the sill. */
  thresholdY: number
  /** Room-side end of the passage: the wall's inner face at the threshold. */
  innerRadius: number
  /** Outer face of the drum. */
  outerRadius: number
  /** Depth of the sill slab below the threshold. */
  sillThickness?: number
  /** Lateral thickness of the masonry cheek either side of the passage. */
  jambThickness?: number
}

export interface EntrancePassageColliders {
  /** The walking surface through the wall. Also drawn, so the doorway is a floor. */
  sill: BoxSpec
  /** The cheeks either side of it. Collider only — the shell already draws them. */
  jambs: BoxSpec[]
}

/**
 * The entrance passage as the walker meets it: a sill to walk in on, and a
 * solid cheek either side of it.
 *
 * The sill alone was not enough, and the reason is the one that governs every
 * wall box in this module. boxAt() clamps each box to WALL_BOX_THICKNESS at the
 * room face, so past about 4.14 m of radius the drum carries no collider at ANY
 * azimuth — and this passage is 4.9 m deep. With only the sill emitted, a
 * walker who drifted 0.85 m off the centreline (half the doorway plus a capsule
 * radius) ran out of plank, fell 2 m onto the site's ground cylinder, which
 * runs UNDER the tower, and stood inside solid drawn masonry. Photographed.
 *
 * So the entrance is treated exactly as the stair passage already is above:
 * solid on BOTH sides, never a walking surface floating in a void. The cheeks
 * take the same WALL_BOX_THICKNESS for the same argument — thin enough that the
 * AABBs stay small, thick enough that 1.4 m/s at 30 fps cannot cross one
 * between steps.
 *
 * Two choices worth stating, because both are approximations of drawn stone:
 *
 *  - the cheeks stand ON the sill's edges, at ±width/2, so they take nothing
 *    off the 1.1 m the doorway is sourced at. Their inner faces are the drawn
 *    reveal.
 *  - they rise as one box to the full clear height instead of following the
 *    drawn barrel vault. Above the springing that puts the face slightly
 *    OUTSIDE the stone, which lets a head clip some 9 cm into masonry it cannot
 *    see and costs nothing; chasing the arch would take five boxes a side to
 *    buy the same walk.
 */
export function entrancePassageBoxes(p: EntrancePassageParams): EntrancePassageColliders {
  const sillThickness = p.sillThickness ?? ENTRANCE_SILL_THICKNESS
  const jambThickness = p.jambThickness ?? WALL_BOX_THICKNESS
  const rad = p.azimuthDeg * DEG
  const depth = p.outerRadius - p.innerRadius
  const midRadius = p.innerRadius + depth / 2
  const quaternion = yawThenTilt(radialYaw(rad), 0)
  const centre: [number, number] = [Math.sin(rad) * midRadius, -Math.cos(rad) * midRadius]
  // local +X is radial, so local +Z is the lateral axis the cheeks sit on. Taken
  // off the quaternion rather than written out again, so the two cannot drift.
  const lateral = rotate(quaternion, [0, 0, 1])

  const sill: BoxSpec = {
    halfExtents: [depth / 2, sillThickness / 2, p.width / 2],
    position: [centre[0], p.thresholdY - sillThickness / 2, centre[1]],
    quaternion,
    kind: 'floor',
  }

  const offset = p.width / 2 + jambThickness / 2
  const jambs = [-1, 1].map(
    (side): BoxSpec => ({
      halfExtents: [depth / 2, p.height / 2, jambThickness / 2],
      position: [
        centre[0] + side * lateral[0] * offset,
        // stands on the sill's top face, so the two are flush in plan
        p.thresholdY + p.height / 2,
        centre[1] + side * lateral[2] * offset,
      ],
      quaternion,
      kind: 'wall',
    }),
  )

  return { sill, jambs }
}

/** Total collider count, for the budget readout. */
export function colliderCount(...groups: BoxSpec[][]): number {
  return groups.reduce((n, g) => n + g.length, 0)
}
