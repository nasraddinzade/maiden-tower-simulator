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

import { revealFacets } from './doorwayArch'
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
 * One upright cylinder collider — axis along world Y, no rotation offered.
 *
 * Two things in the model are round and are stood on or leant against rather
 * than walked around: the paved ground outside, and the steel newel the modern
 * spiral turns about. Both were written straight into JSX as rapier elements;
 * they are specs here for the same reason BoxSpec is — so the collider set can
 * be handed to the physics layer as data, and the physics layer can be the only
 * module in the app that has ever heard of rapier.
 */
export interface CylinderSpec {
  /** Half the height, matching rapier's own CylinderCollider argument. */
  halfHeight: number
  radius: number
  position: [number, number, number]
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
  openings?: Array<{
    azimuthDeg: number
    widthDeg: number
    sillY: number
    headY: number
    /**
     * The width the SHELL is cut to, if it is known — see doorwayArch.ts →
     * drawnClearWidth(). It is not `widthDeg` in metres and it is wider: the
     * cutter strikes one straight section and has to clear the arc at the far
     * end of its run, so the chord it uses subtends about 9.9° at the room face
     * where widthDeg is 15.0/2 = 7.5.
     *
     * Given, no box may lean inside it. Withheld, the opening is still opened —
     * the doorway is never walled up — but a neighbouring box may overhang the
     * drawn jamb, which is what it did: measured, up to 0.230 m of a 1.25 m
     * opening standing full of invisible stone.
     */
    clearWidth?: number
    /**
     * The threshold's rake, if the opening has one — doorwayCutter() shears the
     * whole tool by it, so the drawn hole is a parallelogram and not a rectangle.
     *
     * One doorway in the tower rakes, the opening onto storey 5 off the middle
     * of the 4→6 flight, and its sill drops 0.32 m across the opening. Treated
     * as upright, the collider left that much stone standing in the low corner
     * of a hole the shell had cut — a step out of nothing, at the one doorway
     * where the treads really are climbing past.
     */
    rake?: number
  }>
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


/**
 * The height range an opening REALLY occupies over one sector's slice of it.
 *
 * A rake shears the drawn hole — `y += rake·t` — so its sill and head are not
 * level and a sector away from the centre line meets them somewhere else. The
 * range is taken over the whole slice and to the outside on both ends, so the
 * collider's hole always contains the drawn one: leaving stone inside a cut
 * opening is a step out of nothing, and the extra opened at the far corner is
 * put straight back by doorwayRevealBoxes(), whose jambs are sheared with the
 * same arithmetic.
 */
function rakedOpeningRange(
  o: { sillY: number; headY: number; clearWidth?: number; rake?: number },
  deltaDeg: number,
  sectorDeg: number,
  innerRadiusAt: (y: number) => number,
): [number, number] {
  const rake = o.rake ?? 0
  const half = (o.clearWidth ?? 0) / 2
  if (!rake || half <= 0) return [o.sillY, o.headY]
  const r = Math.max(0.05, innerRadiusAt((o.sillY + o.headY) / 2))
  // the tangential offsets this sector covers, clipped to the opening's own width
  const lo = Math.max(-half, (deltaDeg - sectorDeg / 2) * DEG * r)
  const hi = Math.min(half, (deltaDeg + sectorDeg / 2) * DEG * r)
  if (hi < lo) return [o.sillY, o.headY]
  const shifts = [rake * lo, rake * hi]
  return [o.sillY + Math.min(...shifts), o.headY + Math.max(...shifts)]
}

export function wallColliders(p: WallColliderParams): BoxSpec[] {
  const out: BoxSpec[] = []
  const sectorDeg = 360 / p.sectors
  // half-width of the chord, plus a little so neighbours overlap and leave no seam
  const halfChord = p.outerRadius * Math.tan((sectorDeg / 2) * DEG) * 1.06

  /**
   * The openings a box spanning this height range must not lean into.
   *
   * A box overhangs its own sector by design — `boxAt` gives it 1.2 chords so
   * neighbours meet with no seam — and beside a doorway that overhang is stone
   * standing in a hole. Measured before this: a jamb box two sectors away
   * reaching 0.230 m inside a drawn opening 1.25 m wide, invisible, right where
   * a visitor turns onto the stair.
   *
   * Only openings that state their drawn width are kept out of; see the note on
   * `clearWidth`. It is a keep-out and not a reason to open the wall: the box
   * SLIDES, exactly as floorColliders() slides a deck segment off the stair
   * well, and for the same reason — narrowing it to fit would starve its far
   * side and put a hole where the drawing shows stone.
   */
  const keepOutFor = (lo: number, hi: number) =>
    (p.openings ?? []).filter(
      (o): o is typeof o & { clearWidth: number } =>
        o.clearWidth !== undefined && o.headY > lo + 1e-9 && o.sillY < hi - 1e-9,
    )

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
        const d = angleDelta(azimuthDeg, o.azimuthDeg)
        if (Math.abs(d) > o.widthDeg / 2 + sectorDeg / 2) continue
        // right through the wall: no box at all across the opening
        const [bottomY, topY] = rakedOpeningRange(o, d, sectorDeg, p.innerRadiusAt)
        cuts.push({ bottomY, topY, startRadius: null })
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
        out.push(boxAt(azimuthDeg, innerMid, p.outerRadius, midY, halfHeight, halfChord, tilt, 'wall', sectorDeg, keepOutFor(y0, y1)))
        continue
      }

      let cursor = y0
      for (const c of inBand) {
        const cTop = Math.min(c.topY, y1)
        const cBottom = Math.max(c.bottomY, y0)
        if (cBottom > cursor) {
          const mid = (cursor + cBottom) / 2
          out.push(
            boxAt(azimuthDeg, p.innerRadiusAt(mid), p.outerRadius, mid, (cBottom - cursor) / 2, halfChord, tilt, 'wall', sectorDeg, keepOutFor(cursor, cBottom)),
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
                boxAt(azimuthDeg, face, jambTo, jMid, (jt - jb) / 2, halfChord, tilt, 'wall', sectorDeg, keepOutFor(jb, jt)),
              )
            }
          }
        }
        cursor = Math.max(cursor, cTop)
      }
      if (cursor < y1) {
        const mid = (cursor + y1) / 2
        out.push(
          boxAt(azimuthDeg, p.innerRadiusAt(mid), p.outerRadius, mid, (y1 - cursor) / 2, halfChord, tilt, 'wall', sectorDeg, keepOutFor(cursor, y1)),
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

/**
 * Move a box off an opening it would otherwise lean into, keeping its width.
 *
 * The rule and the reasoning are floorColliders()' — a slide only ever moves a
 * box AWAY from the hole and INTO its far neighbour's overlap, so it can open
 * nothing, whereas narrowing it to fit starves the far side and puts a hole
 * where the drawing shows stone. What is new is that a wall box has to obey it
 * as well, which nobody had asked: an opening in a WALL is entered head-on, and
 * an overhang there is invisible stone standing in a doorway.
 *
 * A box whose centre is inside an opening is left alone. It should not exist —
 * that sector is opened over the opening's height — and shoving it would be
 * guessing which way.
 */
function slideOffOpenings(
  azimuthDeg: number,
  halfChord: number,
  innerRadius: number,
  keepOut: Array<{ azimuthDeg: number; clearWidth: number }>,
): number {
  /*
   * BOTH ANGLES ARE READ AT THE BOX'S INNERMOST CORNER, and it is the same
   * argument floorColliders() makes about a ring: a box is a rectangle, so its
   * tangential half-extent is a fixed length, and a fixed length subtends MORE
   * angle the nearer the axis you read it. Read at the mid-radius instead, the
   * slide came out 0.7° short and left 0.090 m of the opening still blocked.
   */
  const r = Math.max(0.05, innerRadius)
  const cornerRadius = Math.hypot(r, halfChord)
  const reachDeg = Math.atan(halfChord / r) / DEG
  let az = azimuthDeg
  for (const o of keepOut) {
    // the drawn opening is a straight chord too, so its half-angle is an
    // arcsine at the same corner — not half of the opening's own widthDeg
    const halfDeg = Math.asin(Math.min(1, o.clearWidth / 2 / cornerRadius)) / DEG
    const d = angleDelta(o.azimuthDeg, az)
    if (Math.abs(d) <= halfDeg) continue
    const gap = Math.abs(d) - halfDeg
    if (gap >= reachDeg) continue
    az += (d > 0 ? -1 : 1) * (reachDeg - gap)
  }
  return az
}

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
  keepOut: Array<{ azimuthDeg: number; clearWidth: number }> = [],
): BoxSpec {
  const thickness = Math.max(0.05, Math.min(outerRadius - innerRadius, WALL_BOX_THICKNESS))
  const midRadius = innerRadius + thickness / 2
  // chord at this box's own radius, with enough overlap that neighbours meet
  const halfChord = (midRadius + thickness) * Math.tan((sectorDeg / 2) * DEG) * 1.2
  if (keepOut.length > 0) {
    azimuthDeg = slideOffOpenings(azimuthDeg, halfChord, innerRadius, keepOut)
  }
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

export interface DoorwayRevealParams {
  azimuthDeg: number
  /**
   * Clear width of the DRAWN opening — the chord doorwayCutter strikes, not
   * STAIR.doorwayWidth and not the arc `widthDeg` subtends. The reveal has to be
   * laid on the stone that is actually there, so it takes the cutter's own
   * figure and the caller is responsible for handing over the same one.
   */
  clearWidth: number
  sillY: number
  headY: number
  /** The threshold's rake, as doorwayCutter shears the tool by it. */
  bottomRake?: number
  /** Room-side face of the wall at a height. */
  innerRadiusAt: (y: number) => number
  /**
   * Where the stone round the doorway ENDS going outward — the stair passage's
   * inner cheek where the passage crosses, the drum otherwise. A reveal box that
   * ran past this would stand in the passage and stop the walker on the stair.
   */
  outerRadius: number
  /** Sectors the drum's own collider ring is built from; see below. */
  sectors: number
}

/**
 * The stone round a chamber doorway, which the collider did not have.
 *
 * wallColliders() opens a sector WHOLE wherever an opening touches it and opens
 * it SQUARE from sill to head. Both are deliberate — a doorway that gets walled
 * up is the worse failure, and this file's history is mostly that failure — but
 * together they leave the drawn jambs and the whole haunch of the arch standing
 * in nothing. Measured on the shipped configuration: up to 0.480 m of jamb
 * beside an opening 1.25 m wide, and the entire arch above its springing.
 *
 * So the hole stays as it is and the stone is put BACK, laid on the drawn
 * opening's own faces (lib/doorwayArch.ts). Nothing here can wall a doorway up:
 * every face is tangent to the opening, so the boxes lie outside it by
 * construction whatever the arithmetic does.
 *
 * THE FIDELITY IS THE DRUM'S OWN. A flat facet on a curve falls short of it, and
 * the question is how short is short enough. It is answered by the collider the
 * doorway is cut in: the wall ring is a `sectors`-gon, whose chord dips
 * `r·(1 − cos(π/sectors))` inside the drawn face — 17 mm at 32 sectors and the
 * radius of these chambers. The arch is held to the same and no finer, which
 * costs seven facets over the semicircle. Making it sharper than the wall it
 * stands in would buy nothing anybody can feel.
 *
 * THE TAPER IS TAKEN IN COURSES, not by tilting the boxes. A reveal box is
 * turned about the radial axis to lay its face on the opening, and that turn has
 * already spent the freedom the wall boxes use for the cone. So a face that
 * spans height is cut into courses short enough that the room face does not run
 * away from it by more than the same tolerance — the wall leans out 0.044 m per
 * metre, so a course is about a third of a metre and a jamb is five of them.
 *
 * AND SO IS THE CURVE, which for eleven days it was not. The wall is round as
 * well as coned, and the same box that cannot tilt to follow the cone cannot
 * bend to follow the drum: a jamb reaching round to meet the sector boxes beside
 * the doorway ran as a straight chord and came out 0.45 m outside the arc at its
 * far end, in the stair passage, where it stopped the walker on the fourth tread
 * of every flight. Courses on that axis too, seated on the arc across their own
 * span, and hard-capped at the passage cheek read as the radius it is.
 */
export function doorwayRevealBoxes(p: DoorwayRevealParams): BoxSpec[] {
  const height = p.headY - p.sillY
  if (height <= 0 || p.clearWidth <= 0) return []

  const faceAtSill = p.innerRadiusAt(p.sillY)
  if (p.outerRadius <= faceAtSill + 0.02) return []

  // the drum ring's own chord dip at this doorway's radius — see the note above
  const tolerance = Math.max(1e-3, faceAtSill * (1 - Math.cos(Math.PI / Math.max(3, p.sectors))))
  // how fast the room face runs away from a flat box, metres per metre of height
  const taperSlope = Math.abs((p.innerRadiusAt(p.headY) - faceAtSill) / height)
  const courseHeight = taperSlope > 1e-6 ? tolerance / taperSlope : height

  const rad = p.azimuthDeg * DEG
  const yaw = radialYaw(rad)
  // outward radial and tangential unit vectors at the doorway's bearing
  const outward: [number, number] = [Math.sin(rad), -Math.cos(rad)]
  const along: [number, number] = [Math.cos(rad), Math.sin(rad)]

  const halfWidth = p.clearWidth / 2
  const sectorRad = (2 * Math.PI) / Math.max(3, p.sectors)

  /*
   * How far the stone reaches away from the opening: TO THE EDGE OF THE HOLE
   * AND NO FURTHER, and the hole is wallColliders()' own.
   *
   * That ring drops a sector whenever an opening touches it, so the wall is
   * missing from the opening's edge out to the first sector box that survives.
   * The last dropped sector is centred within `widthDeg/2 + sectorDeg/2` of the
   * doorway, the next centre lies one sector beyond that, and every box overhangs
   * its own sector by 1.2 chords — so surviving stone starts within one whole
   * sector of the opening's own edge, whatever the doorway's phase against the
   * sector grid happens to be. Read at the face the reveal stands on, that is
   * `asin(half/face)` of opening plus one sector of arc, and its tangent is the
   * reach. Measured against the shipped tower the widest hole any doorway leaves
   * is 18.1° where this allows 19.3–21.6°.
   *
   * IT USED TO BE `max(0.5, clearWidth)`, which reaches 1.5 clear widths from
   * the doorway's axis where the paragraph above asks for about one — twice the
   * arc this same comment claimed to be crossing. That would have been merely
   * wasteful if the stone followed the drum. It did not: see the coursing below.
   */
  const openingHalfAngle = Math.asin(Math.min(0.95, halfWidth / faceAtSill))
  const reach = faceAtSill * Math.tan(Math.min(1.3, openingHalfAngle + sectorRad))
  const depth = Math.max(halfWidth, reach - halfWidth)

  /**
   * How far a course may run ROUND the drum before its flat face parts company
   * with the arc by more than `tolerance` — the tangential twin of
   * `courseHeight`, and the whole reason this function was rewritten.
   *
   * A reveal box is turned to lay its face on the opening, so its radial axis is
   * the doorway's own bearing and its faces are CHORDS: a face held at
   * perpendicular distance `rho` from the tower's axis stands at radius
   * `hypot(rho, t)` a tangential distance `t` away, which runs out as `t²/2rho`.
   * With the old reach the far end of a jamb slab stood 0.45 m further out than
   * its near end while the drum had not moved at all — so the slab crossed the
   * passage's inner cheek and stood in the stair: 0.45 m of invisible stone
   * across a passage 1.03 m wide, on both jambs of every doorway, and the walker
   * could not climb past the fourth tread of any flight in the tower. The taper
   * was already taken in courses for exactly this reason on the other axis; the
   * curve had been left to one slab.
   *
   * A course seated to split the difference is out by `(tHi² − tLo²)/4·face` at
   * each end, so this is that solved for the tolerance.
   */
  const spanFrom = (t: number) => Math.sqrt(t * t + 4 * faceAtSill * tolerance) - Math.abs(t)

  const out: BoxSpec[] = []

  for (const f of revealFacets({
    clearWidth: p.clearWidth,
    clearHeight: height,
    depth,
    tolerance,
    rake: p.bottomRake,
  })) {
    // how much of the facet's run rises and how much of it goes round: the cone
    // sizes the first, the drum the second
    const rise = Math.abs(f.normalT) * f.halfLength * 2
    const sweep = Math.abs(f.normalY) * f.halfLength * 2
    // the largest tangential offset any box on this facet reaches
    const tReach = Math.abs(f.faceT + f.normalT * f.depth) + Math.abs(f.normalY) * f.halfLength
    const runCourses = Math.max(
      1,
      Math.ceil(rise / Math.max(0.05, courseHeight)),
      Math.ceil(sweep / Math.max(0.02, spanFrom(tReach))),
    )
    const halfLen = f.halfLength / runCourses

    /*
     * The courses INTO the stone, taken adaptively: a course may run further
     * where the drum falls away more slowly, which is nearer the doorway's axis.
     * Uniform courses cut at the far end's rate cost a third more boxes for the
     * same fidelity.
     */
    const cuts = [0]
    while (cuts[cuts.length - 1] < f.depth - 1e-6) {
      const d0 = cuts[cuts.length - 1]
      const tHere = Math.abs(f.faceT + f.normalT * d0) + Math.abs(f.normalY) * f.halfLength
      let step = f.depth - d0
      if (Math.abs(f.normalT) > 1e-9) step = Math.min(step, spanFrom(tHere) / Math.abs(f.normalT))
      if (Math.abs(f.normalY) > 1e-9) step = Math.min(step, courseHeight / Math.abs(f.normalY))
      cuts.push(Math.min(f.depth, d0 + Math.max(0.02, step)))
    }
    // a last course thinner than the solver's own skin is worse than none
    if (cuts.length > 2 && cuts[cuts.length - 1] - cuts[cuts.length - 2] < 0.02) {
      cuts.splice(cuts.length - 2, 1)
    }

    for (let c = 0; c < runCourses; c += 1) {
      const centre = -f.halfLength + (2 * c + 1) * halfLen
      for (let k = 0; k < cuts.length - 1; k += 1) {
        const halfDepth = (cuts[k + 1] - cuts[k]) / 2
        const dMid = cuts[k] + halfDepth
        // along the facet's own face, then into the stone along its normal
        const t = f.faceT - f.normalY * centre + f.normalT * dMid
        const y = p.sillY + f.faceY + f.normalT * centre + f.normalY * dMid
        // what the course spans in the world, from whichever of its own axes carry it
        const tHalf = Math.abs(f.normalT) * halfDepth + Math.abs(f.normalY) * halfLen
        const yHalf = Math.abs(f.normalY) * halfDepth + Math.abs(f.normalT) * halfLen
        /*
         * Vertically the course still starts at the LOWEST room face it spans, so
         * the cone can never leave it standing proud of the wall into the room.
         */
        const face = Math.min(p.innerRadiusAt(y - yHalf), p.outerRadius - 0.02)
        /*
         * Tangentially it is SEATED ON THE ARC across its own span instead, with
         * the error split between its two ends rather than paid at one, because
         * here both ends are somewhere it matters: short of the arc is stone
         * standing in the room, past it is stone standing in the stair.
         */
        const tLo = Math.max(0, Math.abs(t) - tHalf)
        const tHi = Math.abs(t) + tHalf
        const drop = Math.min(tolerance, (tHi * tHi - tLo * tLo) / (4 * face))
        let rho = Math.sqrt(Math.max(0.01, (face - drop) ** 2 - tLo * tLo))
        /*
         * AND IT MAY NOT CROSS THE PASSAGE'S CHEEK AT ITS FAR CORNER, which turns
         * the arithmetic above from a hope into a guarantee: the cheek is a
         * RADIUS, so the perpendicular distance it allows shrinks as the course
         * runs round. Read this way no reveal box can stand in the stair however
         * the coursing is sized — and that property, not the fidelity, is what
         * the shipped version was missing.
         */
        const outerHere = Math.sqrt(Math.max(0, p.outerRadius ** 2 - tHi * tHi))
        if (outerHere - rho < 0.05) rho = outerHere - 0.05
        if (rho <= 0.05) continue
        const thickness = Math.min(WALL_BOX_THICKNESS, outerHere - rho)
        const seat = rho + thickness / 2
        out.push({
          halfExtents: [thickness / 2, halfDepth, halfLen],
          position: [t * along[0] + seat * outward[0], y, t * along[1] + seat * outward[1]],
          // local +Y onto the facet's normal: pitch about the radial axis
          quaternion: yawThenPitch(yaw, Math.atan2(f.normalT, f.normalY)),
          kind: 'wall',
        })
      }
    }
  }
  return out
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
  stairwell?: {
    centreAzimuthDeg: number
    widthDeg: number
    innerRadius: number
    /**
     * Where the well ENDS going outward, if there is floor beyond it.
     *
     * Absent on a storey slab, and rightly: the flight runs in the wall, so the
     * well is a bite out of the slab's outer lip and there is nothing past it
     * but masonry. On the ROOF there is — the terrace crosses the whole wall to
     * the parapet, so the stair mouth is a HOLE with 1.7 m of paving outboard of
     * it, which a visitor walks round. Left undefined there the ring was
     * shortened to the mouth's inner edge instead and the whole outer band went
     * with it: a 50°-wide gap in the deck at the parapet, drawn solid, with
     * nothing under it for eleven metres.
     */
    outerRadius?: number
  }
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
  const well = p.stairwell

  /**
   * The radial band the well is cut in. OUTSIDE it the surface is unbroken all
   * the way round, so a box may overhang its own sector as far as it likes;
   * inside it, an overhang is a box standing across the hole.
   */
  const bandInner = well ? Math.max(well.innerRadius, p.oculusRadius) : 0
  const bandOuter = well ? Math.min(well.outerRadius ?? p.outerRadius, p.outerRadius) : 0
  const hasBand = well !== undefined && bandOuter > bandInner + 1e-9

  /**
   * One segment: an arc of the ring over a radial band.
   *
   * THE CHORD IS TAKEN AT THE RING'S OUTER RADIUS and applied at every radius
   * the box spans, which is the only way a ring of cuboids meets at its rim
   * without gaps — and it means every box reaches FURTHER IN AZIMUTH the nearer
   * the axis you read it. On an unbroken ring that costs nothing but overlap.
   * Beside a hole it is the whole problem: measured on the roof before this was
   * written, the deck's neighbours either side of a 16.47° stair mouth reached
   * 11.5° into it at the walking radius and closed it to 6.70° — 0.61 m of arc
   * where 1.50 m was drawn — and the largest disc that would pass through the
   * physics was 0.348 m against a 0.320 m capsule. Twenty-eight millimetres of
   * clearance in a hole that looked a metre and a half wide.
   *
   * So a box that would reach into the well SLIDES AWAY FROM IT until its
   * furthest corner lands on the well's edge, keeping its width. Sliding rather
   * than narrowing matters, and the alternative was tried on paper first:
   * narrowing to fit starves the far side of the same box, and beside a well cut
   * close to the axis that shortfall is a third of a metre of missing ring — a
   * hole in the floor where the drawing shows stone, which is the one mistake
   * this module exists to prevent. A slide only ever moves a box AWAY from the
   * hole and INTO its far neighbour's overlap, so it can open nothing.
   *
   * The furthest reach is read at the SMALLEST radius the box has inside the
   * band, because that is where a chord subtends the most angle. Below the band
   * the box may overhang the well freely: there the surface is solid, and the
   * well's inner radius is where its hole begins.
   */
  /** How far a box of this width reaches in azimuth at the band's inner radius. */
  const reachAtBand = (spanDeg: number) => {
    const halfChord = p.outerRadius * Math.tan((spanDeg / 2) * DEG) * 1.06
    const rMin = Math.max(0.05, bandInner)
    return rMin > halfChord ? Math.asin(halfChord / rMin) / DEG : 90
  }

  /** Would a full-depth segment on this bearing lean over the well? */
  const slidesOffWell = (azimuthDeg: number) => {
    if (!well) return false
    const toLo = angleDelta(well.centreAzimuthDeg - well.widthDeg / 2, azimuthDeg)
    const toHi = angleDelta(well.centreAzimuthDeg + well.widthDeg / 2, azimuthDeg)
    if (toLo <= 0 && toHi >= 0) return false
    return reachAtBand(sectorDeg) > Math.min(Math.abs(toLo), Math.abs(toHi))
  }

  const emit = (azimuthDeg: number, spanDeg: number, inner: number, outer: number) => {
    if (outer - inner < 0.15 || spanDeg <= 0) return // nothing worth keeping
    const halfChord = p.outerRadius * Math.tan((spanDeg / 2) * DEG) * 1.06
    let centreDeg = azimuthDeg

    if (well && hasBand && outer > bandInner + 1e-9 && inner < bandOuter - 1e-9) {
      const rMin = Math.max(0.05, Math.max(inner, bandInner))
      /*
       * ASIN, NOT ATAN, and the difference is not a rounding matter.
       *
       * A box's half-extent `halfChord` is measured across its own local Z, so
       * the point on its corner nearest the well lies at world radius
       * hypot(r, halfChord) — not at r. The angle it subtends from the axis is
       * therefore asin(halfChord / r), and the arctangent, which is what a first
       * reading of the geometry suggests, is smaller. Measured on the deck the
       * gap between the two was 0.32°, which put the neighbour 0.09 m INSIDE a
       * hole this whole clause exists to keep it out of.
       */
      const reachDeg = rMin > halfChord ? Math.asin(halfChord / rMin) / DEG : 90
      const toLo = angleDelta(well.centreAzimuthDeg - well.widthDeg / 2, azimuthDeg)
      const toHi = angleDelta(well.centreAzimuthDeg + well.widthDeg / 2, azimuthDeg)
      // a box whose own centre is inside the well has no business in this band
      if (toLo <= 0 && toHi >= 0) return
      const near = toLo > 0 ? toLo : toHi
      if (reachDeg > Math.abs(near)) centreDeg = azimuthDeg + near - Math.sign(near) * reachDeg
    }

    const rad = centreDeg * DEG
    const half = (outer - inner) / 2
    const mid = (outer + inner) / 2
    out.push({
      halfExtents: [half, p.thickness / 2, halfChord],
      position: [Math.sin(rad) * mid, p.floorY - p.thickness / 2, -Math.cos(rad) * mid],
      quaternion: yawThenTilt(radialYaw(rad), 0),
      kind: 'floor',
    })
  }

  for (let s = 0; s < p.sectors; s++) {
    const azimuthDeg = s * sectorDeg + sectorDeg / 2

    const inWell =
      well !== undefined &&
      Math.abs(angleDelta(azimuthDeg, well.centreAzimuthDeg)) <= well.widthDeg / 2

    if (!well || !inWell) {
      /*
       * ONLY THE BAND SLIDES, and the sector is split so that only the band can.
       *
       * A slide is right where a box would lean over the hole and wrong
       * everywhere else, because a box carries its whole radial run with it: the
       * two sectors flanking the mouth reach it in the paving's band and are
       * ordinary ring segments out at the parapet, and sliding them bodily left
       * a 0.03 m wedge of deck uncarried at r 7.3, between a slid box and its
       * unslid neighbour. Split at the band's two radii, the parts that never
       * had to move stay on the sector grid with every other box on the ring, and
       * only the middle one goes.
       *
       * Split ONLY where it is needed — one sector at each end of the mouth —
       * so the ring does not pay three boxes a sector for a hole in one place.
       */
      if (well && hasBand && slidesOffWell(azimuthDeg)) {
        emit(azimuthDeg, sectorDeg, p.oculusRadius, bandInner)
        emit(azimuthDeg, sectorDeg, bandInner, bandOuter)
        emit(azimuthDeg, sectorDeg, bandOuter, p.outerRadius)
        continue
      }
      // the full ring segment, oculus out to the wall
      emit(azimuthDeg, sectorDeg, p.oculusRadius, p.outerRadius)
      continue
    }

    /*
     * Inside the well the segment is SHORTENED, not dropped.
     *
     * The flight runs in the wall, so only the slab's outer lip has to go.
     * Dropping the whole wedge cut the floor from the oculus to the wall over
     * some 50° of arc while the drawn slab kept its inner part — so you walked
     * onto floor that was visibly there, with nothing under it, and fell a
     * storey. Reproduced at azimuth 132° on storey 2.
     */
    emit(azimuthDeg, sectorDeg, p.oculusRadius, bandInner)
    /*
     * And where the surface carries on OUTBOARD of the well, that band is
     * emitted too — the roof, where the paving crosses the wall to the parapet.
     * See the note on stairwell.outerRadius.
     */
    if (well.outerRadius !== undefined) emit(azimuthDeg, sectorDeg, bandOuter, p.outerRadius)
    /*
     * AND THE PART OF THIS SECTOR THE WELL DOES NOT TAKE.
     *
     * A well's edges fall where the flight puts them and never on a sector
     * boundary, so one sector at each end of the opening is partly hole and
     * partly floor. Dropping its whole band left that remainder carried by
     * nothing but the neighbour's overhang — and the overhang is exactly what
     * the slide above has just taken away. Two slivers of drawn deck with no
     * collider under them, at the two places a visitor steps round the mouth.
     */
    for (const [lo, hi] of subtractRanges(
      [azimuthDeg - sectorDeg / 2, azimuthDeg + sectorDeg / 2],
      [
        [
          azimuthDeg + angleDelta(well.centreAzimuthDeg - well.widthDeg / 2, azimuthDeg),
          azimuthDeg + angleDelta(well.centreAzimuthDeg + well.widthDeg / 2, azimuthDeg),
        ],
      ],
    )) {
      emit((lo + hi) / 2, hi - lo, bandInner, bandOuter)
    }
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
  /**
   * What to call these boxes, for the F4 debug view and for tests.
   *
   * Defaults to 'guard' because a guard is what this shape usually is. The roof
   * parapet is the exception and it is not a stretch: a ring of masonry standing
   * on the terrace's outer edge is the same solid as a ring of glass standing on
   * a floor's inner edge, and building it here rather than in wallColliders is
   * what keeps the drum's bands free of a discontinuity — see the note where the
   * parapet is raised.
   */
  kind?: BoxSpec['kind']
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
      kind: p.kind ?? 'guard',
    })
  }
  return out
}

export interface HelicalGuardParams {
  /**
   * The flight's nosings, in order: azimuth, the height of each tread, and —
   * where the outer wall of the stair is not the balustrade — the radius and
   * head height of whatever is standing there instead.
   */
  steps: Array<{ azimuthDeg: number; treadY: number; faceRadius?: number; topY?: number }>
  /**
   * Radius of the face a shoulder meets — the INNER surface of the balustrade,
   * not the axis of its posts. The boxes grow outward from it, so this is where
   * the walker is stopped and the drawn steel is what they see stopping them.
   */
  innerRadius: number
  /** Height of the guard above each tread. */
  height: number
  /** Radial thickness, grown outward. Defaults to GUARD_BOX_THICKNESS. */
  thickness?: number
  /** First chord of the chain to build, inclusive. Chord j spans step j → j+1. */
  fromChord?: number
  /** Last chord to build, inclusive. Defaults to the end of the flight. */
  toChord?: number
}

/**
 * The balustrade of a helical flight, as a chain of upright slabs.
 *
 * THE OWNER, ON THE ONE STAIR THIS MODEL HAS THAT NEEDS ONE: «постоянно через
 * перила обваливаешься. кажется там перила просто фасад прозрачный.» Measured
 * on the built model before anything was touched: standing on the tenth tread
 * and casting straight outward from the capsule's centre, the first thing in
 * the physics world was the drum's inner face at 2.99 m. The posts drawn 0.59 m
 * in front of him were not there. He was right in the strongest sense — the
 * balustrade was a facade, and the walk that measured it went through the posts,
 * through the rail, through the drawn tread beyond them and fell to the floor.
 *
 * It is a WALL, on guardRingBoxes' own principle: nothing here is climbed, so
 * the rule that governs walking surfaces — ramps, never lips — does not apply,
 * and a guard the walker could get onto would be a launch pad into the well.
 * Like that one it grows AWAY from the side the walker is on, so the face they
 * meet is the face that is drawn.
 *
 * Each slab spans one chord between nosings and runs from the LOWER of the two
 * treads to the higher one plus the guard's height. The extra riser at the foot
 * is buried under the flight and stops a body squeezing under the rail where
 * the tread rises away from a level box; the extra at the head keeps the guard
 * as tall as the drawn rail at every point of the chord rather than at one end
 * of it.
 *
 * WHICH chords is the caller's business and it is not a detail. On the modern
 * spiral the first chord carries no guard, because that is where the approach
 * ramps deliver a visitor onto the flight and a guard there would seal the only
 * way on; and the last carries none either, because the flight is wider than
 * the well it rises through, so at the top the drawn rail stands OUTSIDE the
 * floor it arrives on — a collider there is not a handrail, it is a fence
 * between the landing and the room.
 *
 * AND WHAT THE WALL IS MADE OF CHANGES WITH HEIGHT, which is why each step may
 * carry its own face. Over the top third of the modern spiral the balustrade is
 * inside the storey's slab and the thing actually beside the walker is the rim
 * of the hole — a ring of 24 cuboids whose inner faces are CHORDS, so it stands
 * at 0.900 m at each sector's middle and bulges to 1.024 at every corner.
 * Walked, that is a trap rather than a wall: the walker rides the outer edge of
 * the flight (climbing deflects them outward, measured below), grazes the
 * inscribed circle and jams in the next corner — pinned, grounded, nothing in
 * front of them at capsule height, which is 9c97c79's symptom exactly. So the
 * caller may put the guard where the WALKER's own limit is instead, a smooth
 * face just inside the stone, and the polygon is never touched.
 */
export function helicalGuardBoxes(p: HelicalGuardParams): BoxSpec[] {
  const out: BoxSpec[] = []
  if (p.steps.length < 2 || p.height <= 0 || p.innerRadius <= 0) return out
  const thickness = p.thickness ?? GUARD_BOX_THICKNESS
  const from = Math.max(0, p.fromChord ?? 0)
  const to = Math.min(p.steps.length - 2, p.toChord ?? p.steps.length - 2)

  for (let j = from; j <= to; j++) {
    const a = p.steps[j]
    const b = p.steps[j + 1]
    const spanDeg = Math.abs(b.azimuthDeg - a.azimuthDeg)
    if (spanDeg <= 0) continue
    const centreDeg = (a.azimuthDeg + b.azimuthDeg) / 2
    // the tighter of the two ends: a wall that steps outward mid-chord would
    // leave the walker a pocket to be pushed into
    const face = Math.min(a.faceRadius ?? p.innerRadius, b.faceRadius ?? p.innerRadius)
    if (face <= 0) continue
    const midRadius = face + thickness / 2
    // half-chord at the OUTER face and a little over, so neighbours interpenetrate
    // at the corners rather than leaving a slot on the outside of every joint
    const halfChord = (face + thickness) * Math.tan((spanDeg / 2) * DEG) * 1.06
    const bottomY = Math.min(a.treadY, b.treadY)
    const topY = Math.max(a.topY ?? a.treadY + p.height, b.topY ?? b.treadY + p.height)
    if (topY <= bottomY) continue
    const rad = centreDeg * DEG
    out.push({
      halfExtents: [thickness / 2, (topY - bottomY) / 2, halfChord],
      position: [
        Math.sin(rad) * midRadius,
        (bottomY + topY) / 2,
        -Math.cos(rad) * midRadius,
      ],
      quaternion: yawThenTilt(radialYaw(rad), 0),
      kind: 'guard',
    })
  }
  return out
}

export interface SectorSlabParams {
  centreAzimuthDeg: number
  widthDeg: number
  innerRadius: number
  outerRadius: number
  /** World Y of the walking surface. The slab hangs BELOW it, as floors do. */
  surfaceY: number
  thickness: number
  /** Boxes across the wedge; more of them follow the arc more closely. */
  sectors?: number
  kind?: BoxSpec['kind']
}

/**
 * A wedge of walking surface — one sector of an annulus, and nothing else.
 *
 * floorColliders builds whole rings and cannot be asked for a piece of one; this
 * is for the piece. The modern spiral's top tread is the only tread in the tower
 * that lands ON a floor level, so it is the only one that may be collided at its
 * full drawn width: everywhere else the flight is inside a hole narrower than
 * itself, and here it is out of it. Carrying that one wedge out to the storey's
 * own slab is what turns the head of the stair from a ledge over a 3.78 m drop
 * into a landing.
 *
 * The chord is taken at the outer radius, exactly as floorColliders takes it, so
 * neighbouring boxes meet at the rim instead of leaving a slot there.
 */
export function sectorSlabBoxes(p: SectorSlabParams): BoxSpec[] {
  const out: BoxSpec[] = []
  const sectors = Math.max(1, p.sectors ?? 3)
  if (p.outerRadius <= p.innerRadius || p.widthDeg <= 0 || p.thickness <= 0) return out
  const spanDeg = p.widthDeg / sectors
  const halfChord = p.outerRadius * Math.tan((spanDeg / 2) * DEG) * 1.06
  const half = (p.outerRadius - p.innerRadius) / 2
  const mid = (p.outerRadius + p.innerRadius) / 2
  for (let s = 0; s < sectors; s++) {
    const rad =
      (p.centreAzimuthDeg - p.widthDeg / 2 + spanDeg * (s + 0.5)) * DEG
    out.push({
      halfExtents: [half, p.thickness / 2, halfChord],
      position: [Math.sin(rad) * mid, p.surfaceY - p.thickness / 2, -Math.cos(rad) * mid],
      quaternion: yawThenTilt(radialYaw(rad), 0),
      kind: p.kind ?? 'floor',
    })
  }
  return out
}

/**
 * A guard standing ACROSS a flight rather than along it — the head of the run.
 *
 * approachGuardBoxes closes the far end of the external stair's landing for the
 * reason this exists: a walker who climbs and does not turn walks off the end.
 * On the modern spiral the end of the run is worse than a fall onto paving,
 * because what is past it is the well the flight has just come up, and the walk
 * measured the consequence — reaching the top, overrunning the last nosing by
 * 0.09 m, losing the ground and landing seven treads down, four times over,
 * with the flight feeding the walker back into its own well each time.
 */
export function radialGuardBox(p: {
  azimuthDeg: number
  innerRadius: number
  outerRadius: number
  /** Surface the guard stands on. */
  floorY: number
  height: number
  /** Thickness along the direction of travel. */
  thickness?: number
  kind?: BoxSpec['kind']
}): BoxSpec[] {
  if (p.outerRadius <= p.innerRadius || p.height <= 0) return []
  const thickness = p.thickness ?? GUARD_BOX_THICKNESS
  const rad = p.azimuthDeg * DEG
  const mid = (p.innerRadius + p.outerRadius) / 2
  return [
    {
      halfExtents: [(p.outerRadius - p.innerRadius) / 2, p.height / 2, thickness / 2],
      position: [Math.sin(rad) * mid, p.floorY + p.height / 2, -Math.cos(rad) * mid],
      quaternion: yawThenTilt(radialYaw(rad), 0),
      kind: p.kind ?? 'guard',
    },
  ]
}

export interface WalkBand {
  /** Nearest the axis a walker may put their feet. */
  innerRadius: number
  /** Furthest from the axis a walker may put their feet. */
  outerRadius: number
  /** The walking line — the middle of the band. */
  midRadius: number
  /** outerRadius − innerRadius, which is what a ramp chain takes as its width. */
  width: number
}

export interface ThroughOpeningBandParams {
  /** Radius of what the flight winds round: a newel, or 0 for an open well. */
  newelRadius: number
  /** Radius of the hole the flight rises THROUGH — not the flight's own. */
  openingRadius: number
  /** Radius of the walker's capsule. */
  walkerRadius: number
  /** The gap the character controller keeps from every surface it meets. */
  skin: number
}

/**
 * The band of a flight a walker may stand on when the flight rises through a
 * hole NARROWER than the flight itself.
 *
 * A walking surface is normally as wide as the thing it is drawn on, and every
 * other flight in this model takes its width straight from the masonry. The
 * modern spiral cannot: config/modern.ts's MODERN_SPIRAL_VS_OPENING records that
 * the stair measures Ø 2.2 m ±0.4 and the well it comes up through measures
 * Ø 1.8 m ±0.3, and the model refuses to adjust either figure to suit the other.
 * The DRAWING can carry that contradiction — it draws both, and the treads
 * simply pass through the slab. Physics cannot. Something has to say where a
 * body may be, and a body is neither of those two diameters.
 *
 * So the band is the walker's own clearance, and nothing else:
 *
 *   inner   newelRadius + walkerRadius   — their shoulder against the tube
 *   outer   openingRadius − walkerRadius − skin
 *                                        — their shoulder against the rim of the
 *                                          hole, less the gap the controller
 *                                          keeps from every surface
 *
 * The skin is subtracted on the OUTER side only, and that asymmetry is the
 * measurement this function was written from. The rim is a collider and the
 * controller inflates the capsule by `skin` before testing it, so the outer
 * limit really is openingRadius − walkerRadius − skin: measured on the walk, the
 * capsule was pinned at r 0.581 against a rim at 0.900 with a 0.300 radius, three
 * times out of three, at three different aiming lines. The newel is only DRAWN —
 * it carries no collider — so nothing enforces the inner limit and nothing needs
 * to keep clear of it; it is there so the walking line does not end up inside a
 * tube the walker can see.
 *
 * Returns null when a walker does not fit through the hole at all. That is not a
 * band to be clamped to zero: it is a building the survey says cannot be walked,
 * and the caller must say so rather than emit a collider a hair wide.
 */
export function throughOpeningWalkBand(p: ThroughOpeningBandParams): WalkBand | null {
  const innerRadius = p.newelRadius + p.walkerRadius
  const outerRadius = p.openingRadius - p.walkerRadius - p.skin
  if (!(outerRadius > innerRadius)) return null
  return {
    innerRadius,
    outerRadius,
    midRadius: (innerRadius + outerRadius) / 2,
    width: outerRadius - innerRadius,
  }
}

/**
 * How wide the walker's capsule is where it crosses one height.
 *
 * A capsule is not a cylinder, and on this stair the difference is the whole
 * argument. throughOpeningWalkBand above takes the walker's FULL radius off the
 * rim of the hole at every height of the flight, because it has no height to
 * work with. But a body only presents its full width over the span between the
 * two cap centres; below and above that it tapers, and a walker eleven treads
 * down is not inside the slab at all — nothing up there is anywhere near them.
 *
 * feetY is the walking surface. The capsule stands on it: caps centred at
 * feetY + radius and feetY + height − radius, which is why `height` must exceed
 * twice the radius for this to describe a capsule rather than a sphere.
 */
export function capsuleRadiusAtHeight(
  radius: number,
  height: number,
  feetY: number,
  y: number,
): number {
  if (y < feetY || y > feetY + height) return 0
  const lowCap = feetY + radius
  const highCap = feetY + height - radius
  if (y >= lowCap && y <= highCap) return radius
  const d = y < lowCap ? lowCap - y : y - highCap
  const inside = radius * radius - d * d
  return inside <= 0 ? 0 : Math.sqrt(inside)
}

/**
 * The widest the capsule is anywhere inside a horizontal band — 0 if it never
 * reaches the band at all.
 *
 * The maximum is analytic, not sampled: the profile rises, holds and falls, so
 * the largest value in any interval is at whichever end is nearest the middle
 * of the capsule, or the full radius when the interval straddles the barrel.
 */
export function capsuleWidestIn(
  radius: number,
  height: number,
  feetY: number,
  bandBottomY: number,
  bandTopY: number,
): number {
  const lo = Math.max(bandBottomY, feetY)
  const hi = Math.min(bandTopY, feetY + height)
  if (hi < lo) return 0
  const mid = feetY + height / 2
  const nearest = mid < lo ? lo : mid > hi ? hi : mid
  return capsuleRadiusAtHeight(radius, height, feetY, nearest)
}

export interface HelicalWalkBandParams {
  /** Radius of the tube the flight winds round. */
  newelRadius: number
  /**
   * Radius of the face a shoulder meets on the balustrade, or null where the
   * flight has no guard and the drawn tread is the only outer limit.
   */
  railRadius: number | null
  /** Outermost the drawn treads reach — nothing may be collided past it. */
  treadOuterRadius: number
  walkerRadius: number
  walkerHeight: number
  /** The gap the character controller keeps from every surface it meets. */
  skin: number
  /**
   * The hole the flight rises through, and the slab that cuts it. `bottomY` and
   * `topY` are the soffit and the floor surface: between them the rim is solid,
   * outside them there is nothing to keep clear of.
   */
  opening: { radius: number; bottomY: number; topY: number } | null
}

/**
 * THE BAND, AS A FUNCTION OF HOW HIGH UP THE FLIGHT THE WALKER IS.
 *
 * throughOpeningWalkBand states the constraint the rim imposes and states it
 * once, for the whole flight. That was right about the top of this stair and
 * wrong about the bottom, and the cost was measured by the owner: 0.2225 m of
 * standing room, on treads drawn 1.0425 m wide, for twenty-two treads — when
 * the rim only exists across the last third of them. The walker's own body is
 * what decides where it starts to matter, and a body has a height.
 *
 * So the outer limit is the tighter of two things:
 *
 *   the RAIL     railRadius − walkerRadius − skin
 *                — where a shoulder meets the balustrade. It bounds the band
 *                  everywhere, and it is the reason a walker who wanders out
 *                  now meets steel instead of falling through it.
 *   the RIM      openingRadius − skin − (the widest the capsule is inside the
 *                  slab). Which is nothing at all until the walker's head
 *                  reaches the soffit, full width while they are passing
 *                  through, and nothing again once their feet are on the floor.
 *
 * Neither surveyed diameter moves. MODERN_SPIRAL_VS_OPENING still records that
 * the stair measures wider than its own well and still refuses to reconcile
 * them; this only says where a BODY may be, which is what 9c97c79 established,
 * and adds the one term that argument left out — that a body 1.6 m tall is not
 * in the slab when it is two metres below it.
 *
 * Returns null when nobody fits at that height, for the same reason as
 * throughOpeningWalkBand: a hair-wide band is a lie about a building.
 */
export function walkBandAtFeet(p: HelicalWalkBandParams, feetY: number): WalkBand | null {
  const innerRadius = p.newelRadius + p.walkerRadius
  const limits: number[] = [p.treadOuterRadius - p.walkerRadius]
  if (p.railRadius !== null) limits.push(p.railRadius - p.walkerRadius - p.skin)
  if (p.opening) {
    const widest = capsuleWidestIn(
      p.walkerRadius,
      p.walkerHeight,
      feetY,
      p.opening.bottomY,
      p.opening.topY,
    )
    /*
     * TWO SKINS OFF THE RIM, NOT ONE, AND THE SECOND IS THE ONE THAT MATTERS.
     *
     * throughOpeningWalkBand takes one, and it is right about where a BODY
     * fits: at openingRadius − walkerRadius − skin the controller's inflated
     * capsule is exactly touching the rim. What the walk shows is that exactly
     * touching is not a place to stand. A capsule of 0.300 m cannot follow a
     * flight whose going is 0.259 m and whose riser is 0.172 m without bridging
     * — its underside rests on the nosings about a tread AHEAD — and on a helix
     * those nosings are yawed, so the ride is steadily outward: measured on the
     * built chain at 1/60 s, 0.005 m per frame at r 0.45, falling to 0.001 at
     * r 0.66. Every walker therefore arrives at the band's outer edge and stays
     * there, whatever line they are put on — five starts from 0.40 to 0.69 all
     * converged on it — so the outer edge has to be somewhere it is SAFE to be
     * pressed against.
     *
     * Below the slab it already is: the rail stands at exactly that radius and
     * holds them. Against the rim it was not, and the symptom is 9c97c79's own
     * — the walker pinned at r 0.580, grounded, nothing in front of them at
     * capsule height, not moving. Pulling the collider one more skin inside
     * leaves 0.020 m of clear air between the inflated capsule and the stone,
     * and the wedge has nothing to close on.
     */
    if (widest > 0) limits.push(p.opening.radius - 2 * p.skin - widest)
  }
  const outerRadius = Math.min(...limits)
  if (!(outerRadius > innerRadius)) return null
  return {
    innerRadius,
    outerRadius,
    midRadius: (innerRadius + outerRadius) / 2,
    width: outerRadius - innerRadius,
  }
}

export interface RampStep {
  azimuthDeg: number
  treadY: number
  midRadius: number
  /**
   * Half the walking band at THIS step, when the band is not the same all the
   * way up. Optional: without it every box takes the chain's single width, which
   * is what every masonry flight in the tower wants.
   */
  halfWidth?: number
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

    /*
     * A box spans the INTERSECTION of the two ends' bands, not a chord between
     * their middles. Where the band tapers — the modern spiral, whose outer
     * limit closes as the walker's head comes up under storey 2's slab — a box
     * built on the wider end would stand out over nothing at the narrower one,
     * and one built on the narrower end's centre line would leave the inner
     * edge of the flight uncarried for the rest of the span. Taking the overlap
     * keeps every box inside both bands and flush with the chain either side.
     */
    const halfA = a.halfWidth ?? width / 2
    const halfB = b.halfWidth ?? width / 2
    const inner = Math.max(a.midRadius - halfA, b.midRadius - halfB)
    const outer = Math.min(a.midRadius + halfA, b.midRadius + halfB)
    const boxWidth = a.halfWidth === undefined && b.halfWidth === undefined ? width : outer - inner
    if (boxWidth <= 0) continue
    const radiusA = a.halfWidth === undefined ? a.midRadius : (inner + outer) / 2
    const radiusB = b.halfWidth === undefined ? b.midRadius : (inner + outer) / 2

    const ra = a.azimuthDeg * DEG
    const rb = b.azimuthDeg * DEG
    const pa: [number, number, number] = [Math.sin(ra) * radiusA, a.treadY, -Math.cos(ra) * radiusA]
    const pb: [number, number, number] = [Math.sin(rb) * radiusB, b.treadY, -Math.cos(rb) * radiusB]

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
      halfExtents: [boxWidth / 2, thickness / 2, length / 2 + 0.05],
      position: [mid[0] + down[0], mid[1] + down[1], mid[2] + down[2]],
      quaternion: q,
      kind: 'ramp',
    })
  }
  return out
}

export interface ApproachGuardParams {
  /**
   * foot → head of the flight → far end of the landing: the approach's own
   * chain, the same three nodes the ramp is built from. One straight line in
   * plan, which is why the guards can be slabs and not chains.
   */
  line: [RampStep, RampStep, RampStep]
  /** Clear width between the guards: the full width of the walking surface. */
  width: number
  /** How far the guard stands above the walking line. */
  height: number
  /** Across the line, pointing AWAY from the tower. Tells the sides apart. */
  outward: { x: number; z: number }
  /** Lateral thickness of each slab; defaults to GUARD_BOX_THICKNESS. */
  thickness?: number
}

/**
 * The guards round the approach: one slab per edge a walker can leave it by.
 *
 * IT USED TO BE A PAIR OF SLABS FOOT TO FAR END, one down each side, and that
 * is the fault this function exists to have fixed. The owner could not get into
 * his own tower: he climbed the stair, turned to the door and walked into
 * something solid 0.32 m short of the stone. The thing he met was the WALL-SIDE
 * slab, and it was sealing the doorway.
 *
 * It was an identity, not a near miss. The walking line is tangent to a circle
 * half a stair-width outside the drum, so `tangentRadius = outerRadius +
 * width/2`; the slab stands `width/2 + thickness/2` in from that line and is
 * `thickness/2` thick from its centre, and the three cancel exactly:
 * outerRadius + w/2 − w/2 − t/2 + t/2 = outerRadius. The slab's outer face lands
 * ON the drum's face at every width and every thickness — harmless all the way
 * round the tower except at the one azimuth where the drum has a hole in it,
 * and that hole is the door the landing exists to serve. Measured on the walk:
 * the slab ran x −8.250…−8.130, y −1.980…+1.215, z −4.300…+0.700, so it covered
 * the doorway's whole 1.1 m width and the bottom 1.215 m of its 2 m height. The
 * 0.785 m left over is not a way in for a 1.75 m capsule, and 1.215 m is a
 * vertical face, which this controller will not climb at any autostep setting.
 *
 * So the wall-side guard now stops at the HEAD OF THE FLIGHT, and it stops
 * there for a reason rather than to clear the door. The guard is there to stop
 * a walker falling off the side, and on the wall side what they would fall into
 * is the wedge between the straight stair and the round tower — 1.21 m wide at
 * the foot, and closing to 0.03 m at the head because the construction makes
 * the flight's inner edge tangent to the stone. Past the head there is nothing
 * to fall into; there is a doorway and then two hand-widths of masonry.
 *
 * AND THE FAR END IS CLOSED, which nothing closed before. A walker who climbed
 * the flight and did not turn walked off the end of the landing and fell its
 * whole 1.98 m onto the paving — walked, measured, y 1.670 → −0.310. DD 06
 * shows the handrail turning at that end and dying into the stone, so the end
 * is guarded in the photographs too; the model had drawn neither the rail nor
 * this.
 *
 * Each slab is UPRIGHT, and that is the whole of the shape's design. The obvious
 * slab is one pitched to the rake, occupying exactly the band the drawn
 * balustrade does. But pitching a cuboid leans its END faces back with it, and
 * at the head of a flight that is fatal: a 1.2 m guard on a 29° rake carries its
 * top edge 0.6 m further down the flight than its bottom edge, so from about
 * knee height upward the slab stops short of the landing — and the landing is
 * the one place on a flight where the drop beside the walker is its whole rise.
 * An upright slab makes the opposite error, hanging below the walking line at
 * the top of the flight and standing proud of the rail at the bottom, and both
 * of those are in places nothing can reach.
 *
 * It is a wall, not a step, so guardRingBoxes' argument carries over whole: the
 * inner face sits on the walking surface's own edge, at exactly ±width/2, which
 * takes nothing off the width the ramp chain gives; it grows OUTWARD from that
 * edge; and its only horizontal face is the top, a guard height up and far past
 * anything the autostep will try to mount. A guard the walker could get onto
 * beside a flight would be a launch pad off it.
 */
export function approachGuardBoxes(p: ApproachGuardParams): BoxSpec[] {
  if (p.width <= 0 || p.height <= 0) return []
  const thickness = p.thickness ?? GUARD_BOX_THICKNESS
  const [foot, head, end] = p.line
  const ground = (n: RampStep) => {
    const rad = n.azimuthDeg * DEG
    return { x: Math.sin(rad) * n.midRadius, z: -Math.cos(rad) * n.midRadius }
  }
  const f = ground(foot)
  const h = ground(head)
  const e = ground(end)

  const openRun = Math.hypot(e.x - f.x, e.z - f.z)
  const wallRun = Math.hypot(h.x - f.x, h.z - f.z)
  if (openRun < 1e-6 || wallRun < 1e-6) return []

  // local +Z along the travel, as stairRampBoxes builds it, so the two agree on
  // which way is "across the flight" without either restating the other's maths
  const yaw = Math.atan2(e.x - f.x, e.z - f.z)
  const quaternion = yawThenPitch(yaw, 0)
  const lateral = rotate(quaternion, [1, 0, 0])
  // which way round `lateral` runs is a consequence of where the foot is; the
  // tower is the thing that decides which side may be closed and which may not
  const away = lateral[0] * p.outward.x + lateral[2] * p.outward.z >= 0 ? 1 : -1

  const bottomY = Math.min(foot.treadY, head.treadY, end.treadY)
  const topY = Math.max(foot.treadY, head.treadY, end.treadY) + p.height
  const offset = p.width / 2 + thickness / 2

  /** A slab of the guard's own height, centred between `a` and `b`. */
  const slab = (
    a: { x: number; z: number },
    b: { x: number; z: number },
    shift: { x: number; z: number },
    boxYaw: number,
  ): BoxSpec => ({
    halfExtents: [thickness / 2, (topY - bottomY) / 2, Math.hypot(b.x - a.x, b.z - a.z) / 2],
    position: [
      (a.x + b.x) / 2 + shift.x,
      (bottomY + topY) / 2,
      (a.z + b.z) / 2 + shift.z,
    ],
    quaternion: yawThenPitch(boxYaw, 0),
    kind: 'guard',
  })

  const acrossBy = (d: number) => ({ x: lateral[0] * d, z: lateral[2] * d })
  const alongBy = (d: number) => ({
    x: ((e.x - f.x) / openRun) * d,
    z: ((e.z - f.z) / openRun) * d,
  })

  return [
    // the OPEN side, foot to the far end of the landing
    slab(f, e, acrossBy(away * offset), yaw),
    // the WALL side, foot to the head of the flight and no further
    slab(f, h, acrossBy(-away * offset), yaw),
    // and the far END, from the wall across to outside the open guard, standing
    // just beyond the landing's edge so it closes the corner rather than
    // stealing walking surface
    slab(
      { x: e.x + lateral[0] * -away * (p.width / 2), z: e.z + lateral[2] * -away * (p.width / 2) },
      {
        x: e.x + lateral[0] * away * (p.width / 2 + thickness),
        z: e.z + lateral[2] * away * (p.width / 2 + thickness),
      },
      alongBy(thickness / 2),
      yaw + Math.PI / 2,
    ),
  ]
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
