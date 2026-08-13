/**
 * Procedural construction of the tower's solid shell (Phase 2).
 *
 * Pure geometry: depends on three.js but not on React, so it can be built and
 * asserted in tests. The React component in components/tower/TowerShell.tsx is
 * a thin wrapper around buildShellGeometry().
 *
 * Shape = (outer drum ∪ buttress) − inner tapered cavity − entrance opening,
 * evaluated with three-bvh-csg so the result stays a single manifold mesh that
 * a Phase-6 collider can be attached to.
 */

import * as THREE from 'three'
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { azimuthToVector } from './geometry'
import type { PassageSection, StairDoorway } from './staircase'
import { countDegenerateTriangles, filterDegenerateTriangles } from './mesh'
import { ENTRANCE, TOWER, innerRadiusAt } from '../config/tower'

export interface ShellParams {
  buttressAzimuthDeg: number
  buttressProjection: number
  buttressTipWidth: number
  buttressRootArcDeg: number
  buttressSkewDeg: number
  buttressHeight: number
  entranceAzimuthDeg: number
  entranceWidth: number
  entranceHeight: number
  entranceSillY: number
  /** Openings to cut through the wall (Phase 5). Omit for a blind shell. */
  windows?: WindowCut[]
  /**
   * The void the stair needs through the masonry. Without it the treads are
   * entombed in solid stone and only a tunnelling collider can reach them.
   */
  stairPassage?: PassageSection[][]
  /** Arched openings between the rooms and that passage. */
  stairDoorways?: StairDoorway[]
  /** Blind recesses in the room-side face — the chase the downpipe runs in. */
  wallChases?: WallChase[]
}

export interface ShellStats {
  triangleCount: number
  vertexCount: number
  degenerateCount: number
}

const RADIAL_SEGMENTS = 96
const DEG = Math.PI / 180

/**
 * Beak-like plan of the buttress, drawn in the XY plane where
 * X = tangential offset (positive = clockwise / increasing azimuth) and
 * Y = distance from the tower axis. +Y is the buttress axis.
 *
 * Shape measured from the OSM footprint (see BUTTRESS in config/tower.ts):
 * the two flanks spring from an arc of the drum (`rootArcDeg`) and converge on
 * a narrow rounded nose (`tipWidth`) that sits `projection` beyond the wall.
 * The nose is NOT centred on that arc — it leans `skewDeg` to one side, which
 * makes one flank long and the other short. That asymmetry is the real tower's,
 * visible in aerial photographs.
 */
export function beakShape(
  projection: number,
  tipWidth: number,
  rootArcDeg: number,
  skewDeg: number,
): THREE.Shape {
  const R = TOWER.outerRadius
  const tip = R + projection
  const halfTip = tipWidth / 2

  // Root attachment angles, relative to the nose axis. Negative skew shifts the
  // root arc so the nose leans toward the +X flank.
  const arc = (rootArcDeg * Math.PI) / 180
  const skew = (skewDeg * Math.PI) / 180
  const thetaA = -skew - arc / 2
  const thetaB = -skew + arc / 2

  const onDrum = (theta: number, scale = 1) => ({
    x: R * scale * Math.sin(theta),
    y: R * scale * Math.cos(theta),
  })

  const rootA = onDrum(thetaA)
  const rootB = onDrum(thetaB)
  // closing points sunk inside the drum — absorbed by the boolean union
  const innerA = onDrum(thetaA, 0.45)
  const innerB = onDrum(thetaB, 0.45)

  // Nose: a true semicircle of radius halfTip, so the tip reads as the rounded
  // pier seen in photographs rather than a slab with a softened corner. Its
  // centre sits back by halfTip, putting the apex exactly at `tip`.
  const noseCentreY = tip - halfTip

  const s = new THREE.Shape()
  s.moveTo(innerA.x, innerA.y)
  s.lineTo(rootA.x, rootA.y)
  s.lineTo(-halfTip, noseCentreY) // long flank out to the nose
  s.absarc(0, noseCentreY, halfTip, Math.PI, 0, true) // semicircular nose, apex at `tip`
  s.lineTo(rootB.x, rootB.y) // short flank back to the drum
  s.lineTo(innerB.x, innerB.y)
  s.closePath()
  return s
}

/**
 * The outer face in section: (radius, y) up the wall, with the banded coursing.
 *
 * A cylinder cannot show what the photographs show. The stripes on this tower are
 * RELIEF — each band's stones oversail the course below, every bed throws a hard
 * shadow, and the silhouette is visibly serrated. Tone alone cannot do that at
 * any contrast.
 *
 * The drum ITSELF stays a cylinder, and the courses are drawn as masonry added
 * to it — the same rule the grilles and the window surrounds follow. Turning the
 * drum into a lathe of this profile was tried and backed out: it makes the outer
 * radius a function of height, and eight tests are written against a constant
 * 8.25 — the bounding box, the window widths, the outer-radius profile, the
 * through-hole rays and the floor under the treads. Every one of them is
 * answerable and none of them is wrong to ask. Added stone changes nothing they
 * measure, which is the whole argument for building it this way.
 *
 * Three zones, in the order a mason built them: plain large-block work up to the
 * boundary, then the ribbed courses, then a few plain courses and the coping roll
 * that oversails the top. Below the paving the profile runs straight down at the
 * plain radius — it is buried, and stepping it there would only cost triangles.
 *
 * See COURSING in config/tower.ts for where the numbers come from and how far
 * the two readings that produced them disagree.
 */
export function drumProfile(
  baseY: number,
  topY: number,
  radius: number,
  groundY: number,
  c: {
    bandStartAboveGround: number
    bandPitch: number
    bandProjection: number
    proudFraction: number
    plainUnderCoping: number
    copingProjection: number
    copingDepth: number
  },
): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  const push = (r: number, y: number) => {
    const last = pts[pts.length - 1]
    if (!last || Math.abs(last[0] - r) > 1e-9 || Math.abs(last[1] - y) > 1e-9) pts.push([r, y])
  }

  const copingFrom = topY - c.copingDepth
  const ribsTo = copingFrom - c.plainUnderCoping
  const bandFrom = Math.min(groundY + c.bandStartAboveGround, ribsTo)

  push(radius, baseY)
  push(radius, bandFrom)

  const proud = radius + c.bandProjection
  for (let y = bandFrom; y < ribsTo - 1e-6; y += c.bandPitch) {
    /*
     * The step OUT is at the bottom of a proud course and the step BACK at its
     * top, so the ledge that casts the shadow is under the stone. Drawn the other
     * way round the wall corbels inward and reads as a stack of plinths.
     */
    const proudTop = Math.min(y + c.bandPitch * c.proudFraction, ribsTo)
    const bandTop = Math.min(y + c.bandPitch, ribsTo)
    push(proud, y)
    push(proud, proudTop)
    push(radius, proudTop)
    push(radius, bandTop)
  }

  push(radius, copingFrom)
  push(radius + c.copingProjection, copingFrom + c.copingDepth * 0.35)
  push(radius + c.copingProjection, topY - c.copingDepth * 0.15)
  push(radius, topY)
  return pts
}

/** Strip material groups so the single-material CSG evaluator stays happy. */
function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.clearGroups()
  return g
}

/** One opening in world space: a truncated pyramid, small face at the outer wall. */
export interface WindowCut {
  /** Stable identity, so grilles, surrounds, beams and hotspots agree on one. */
  id: string
  azimuthDeg: number
  /** World Y of the opening's centre. */
  centreY: number
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
  /**
   * Radius at which the reveal STOPS and the widths reach their inner values.
   *
   * The room face for a chamber opening, and the passage's OUTER CHEEK for a
   * slit at the end of a flight. It has to be given rather than derived, because
   * innerRadiusAt(centreY) answers the wrong question for a slit: measured at
   * y = 7.06 the room face stands at r 3.65 and the passage cheek at 4.86, so
   * taking the room face would open the reveal to 1.23 m instead of the 1.50 it
   * asks for and then keep cutting through the passage's inner cheek and a metre
   * into the chamber — a hole in the storey wall exactly where the owner says
   * there are none.
   */
  revealEndRadius: number
  /** Shape of the opening's head. Defaults to 'flat'. */
  head?: WindowHead
  /** Which end of the reveal a grille hangs at. Defaults to 'outer'. */
  barrierAt?: 'outer' | 'revealEnd'
  /**
   * Whether the stone the stair is carried on is protected from this cutter.
   *
   * FALSE ON EVERYTHING THE MODEL NOW CUTS, and that is a fact about the tower
   * rather than a default. It was true only for a CHAMBER opening — see
   * stairBearingClip() — and after [OWNER] 2026-08-10 there are none: a slit at
   * the end of a passage IS part of that passage, so the clash the clip
   * arbitrates does not exist for it. It is excluded on that principle rather
   * than on any effect: at the shipped numbers the clip and a slit miss each
   * other by 0.27 m and the flag changes nothing either way. The measurement,
   * and what would make it start to matter, are on stairBearingClip().
   */
  clipAgainstStairBearing?: boolean
}

/**
 * How an opening is finished at the top.
 *
 * Every opening used to be cut square, because the cutter was a BoxGeometry. The
 * photographs disagree, and not uniformly: reading one frame with one light and
 * one camera (exterior/Qız qalası yaxından.jpg), the two topmost slits have flat
 * heads with a separate lintel stone over them, the ones below have clean
 * semicircular heads cut straight through the courses rather than built up out
 * of voussoirs, and the later window is a true two-centred pointed arch with a
 * dressed voussoir surround.
 *
 * Two of the four blind readings disagreed about where the flat ones stop —
 * "all round except the topmost" against "the top two flat, round below" — and
 * the re-check on a montage of one frame supports the second. That is why this
 * is per-opening data rather than one rule.
 */
export type WindowHead = 'flat' | 'round' | 'pointed'

/**
 * The outline of an opening at one depth, as (x, y) about its centre.
 *
 * x across the opening, y up. Every ring of the cutter uses the same number of
 * points so the loft between them is a simple quad strip.
 */
export function windowProfile(
  halfWidth: number,
  halfHeight: number,
  head: WindowHead,
  arcSegments = 8,
): Array<[number, number]> {
  const a = Math.max(1e-4, halfWidth)
  const b = Math.max(1e-4, halfHeight)
  const pts: Array<[number, number]> = [
    [-a, -b],
    [a, -b],
  ]
  if (head === 'flat') {
    // a flat head still needs the same point count, so the head is sampled too
    for (let i = 0; i <= arcSegments; i += 1) pts.push([a - 2 * a * (i / arcSegments), b])
    return pts
  }
  if (head === 'round') {
    // springing where a semicircle of radius `a` would put it, crown at b
    const springY = b - a
    pts.push([a, springY])
    for (let i = 0; i < arcSegments; i += 1) {
      const t = ((i + 1) / arcSegments) * Math.PI
      pts.push([a * Math.cos(t), springY + a * Math.sin(t)])
    }
    return pts
  }
  /*
   * Two-centred: each centre at the OPPOSITE springing, radius equal to the
   * span, so the crown stands √3/2 of the span above the springing — the same
   * construction the stair passage's vault uses, and the reason the later
   * window's head is visibly pointed rather than round in the photographs.
   */
  const span = 2 * a
  const springY = b - (Math.sqrt(3) / 2) * span
  pts.push([a, springY])
  const half = Math.max(1, Math.floor(arcSegments / 2))
  for (let i = 1; i <= half; i += 1) {
    const t = (i / half) * (Math.PI / 3)
    pts.push([-a + span * Math.cos(t), springY + span * Math.sin(t)])
  }
  for (let i = half - 1; i >= 0; i -= 1) {
    const t = (i / half) * (Math.PI / 3)
    pts.push([a - span * Math.cos(t), springY + span * Math.sin(t)])
  }
  while (pts.length < 3 + arcSegments) pts.push(pts[pts.length - 1])
  return pts
}

/**
 * How far a window cutter runs past each face of the wall. CSG hygiene, not a
 * measurement of the building: the tool has to poke out both sides so the
 * boolean never has to resolve two coplanar surfaces.
 */
const WINDOW_CUT_OVERSHOOT = 1 // m

/**
 * How far the passage cutter runs past the top of the stone where the passage
 * has no vault. Same hygiene as WINDOW_CUT_OVERSHOOT and the same warning: this
 * is a tolerance, and nothing in the tower is this tall. See sectionProfile().
 */
const PASSAGE_SKY_OVERSHOOT = 0.05 // m

/**
 * Cutting tool for one window.
 *
 * Built as a box whose inner end is scaled up, then aimed along the opening's
 * azimuth. It runs from beyond the outer face to well inside the room, so the
 * subtraction removes the whole reveal in one go rather than leaving a lip.
 *
 * THE SPLAY IS DEFINED FACE TO FACE, and the overshoot is dead length.
 *
 * The tool used to taper linearly from end to end, over the whole wall + 2 m,
 * which meant the section reaching the outer face had already been widened by
 * the metre of overshoot in front of it: outerWidth × (1 + (innerWidth/outerWidth
 * − 1) / depth). On storey 8, where the wall is thinnest and the tool therefore
 * shortest relative to its overshoot, a 0.40 m slit came out 0.59 m outside —
 * 48% wider than data/windows.json specifies — and by the same error the room-
 * side mouth fell short of innerWidth. Both faces were wrong, in opposite
 * directions, because the ends of the tool were the only places the widths were
 * honoured and neither end is a face of the wall.
 *
 * So the box carries four vertex rings, not two: the taper runs from outerWidth
 * exactly at r = outerRadius to innerWidth exactly at r = w.revealEndRadius, and
 * the two overshoot rings repeat their neighbour's section unchanged. The wall
 * thickness that governs the splay is the ACTUAL one crossed, which is why the
 * same slit reads differently near the base and near the parapet.
 *
 * WHAT CHANGED ON 2026-08-10 IS ONE WORD: the far plane used to be
 * innerRadiusAt(centreY), the room face, because every opening was a chamber
 * opening. Most of them are slits at the ends of stair passages now and their
 * reveal stops on the passage's outer cheek. The four-ring construction and its
 * invariant survive intact; only which plane counts as "the far face" moved, and
 * with it the depth of masonry crossed — from about 4.6 m to 2.5–3.5 m.
 */
export function windowCutter(w: WindowCut): THREE.BufferGeometry {
  const R = TOWER.outerRadius
  const inner = w.revealEndRadius
  const wall = R - inner // masonry actually crossed at this height
  const depth = wall + 2 * WINDOW_CUT_OVERSHOOT
  const halfDepth = depth / 2

  /*
   * Four rings, lofted — not a BoxGeometry with its vertices pushed about.
   *
   * The four positions and the reason for them are unchanged: the taper must run
   * from outerWidth exactly at the outer face to innerWidth exactly at the room
   * face, with the two overshoot rings repeating their neighbour's section, or
   * the widths land nowhere real. What changed is that a ring is now an OUTLINE
   * rather than a rectangle, so the head can be round or pointed. A box could
   * only ever cut a square hole, and the photographs show square heads on just
   * the two topmost slits.
   */
  const ringZ = [
    -halfDepth, // WINDOW_CUT_OVERSHOOT out in front of the outer face
    -halfDepth + WINDOW_CUT_OVERSHOOT, // the outer face
    halfDepth - WINDOW_CUT_OVERSHOOT, // the room-side face
    halfDepth, // and past it into the room
  ]
  const ringT = [0, 0, 1, 1]
  const head = w.head ?? 'flat'
  const rings = ringT.map((t) =>
    windowProfile(
      (w.outerWidth + (w.innerWidth - w.outerWidth) * t) / 2,
      (w.outerHeight + (w.innerHeight - w.outerHeight) * t) / 2,
      head,
    ),
  )
  const K = rings[0].length

  const positions: number[] = []
  rings.forEach((ring, i) => {
    for (const [x, y] of ring) positions.push(x, y, ringZ[i])
  })
  const indices: number[] = []
  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = i * K
    const b = (i + 1) * K
    for (let k = 0; k < K; k += 1) {
      const k2 = (k + 1) % K
      /*
       * Wound so the faces point OUT of the tool. Reversed, three-bvh-csg stops
       * treating it as a solid and the subtraction runs away — measured, the
       * floor vanished from under a whole flight of the stair, which is what the
       * shell's own floor test caught the first time this was lofted.
       */
      indices.push(a + k, b + k2, b + k)
      indices.push(a + k, a + k2, b + k2)
    }
  }
  // caps, so the tool is a closed solid
  const last = (rings.length - 1) * K
  for (let k = 1; k < K - 1; k += 1) {
    indices.push(0, k + 1, k)
    indices.push(last, last + k, last + k + 1)
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  const uv: number[] = []
  for (let i = 0; i < positions.length / 3; i += 1) uv.push(0, 0)
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))

  // Aim it so local +Z (the widened end) points INWARD. rotateY(θ) sends local
  // +Z to (sin θ, 0, cos θ); the inward direction is −dir = (−sin az, 0, cos az),
  // so θ = −az. Adding π here would flare the opening outward — the wrong way round.
  const dir = azimuthToVector(w.azimuthDeg)
  geom.rotateY(-w.azimuthDeg * DEG)
  // place it so the narrow end overshoots the outer face
  const centreRadius = R + WINDOW_CUT_OVERSHOOT - depth / 2
  geom.translate(dir.x * centreRadius, w.centreY, dir.z * centreRadius)
  return mergeVertices(geom)
}


/**
 * Sweep the stair passage into a solid, ready to be subtracted from the shell.
 *
 * Each section is a radial rectangle; consecutive sections are joined into a
 * tube and the ends are capped, so the result is closed and CSG-safe. This is
 * the void a stair in a wall needs — without it the treads sit inside solid
 * masonry and only a tunnelling collider can reach them.
 */
/**
 * A vertical chase cut into the room-side face of the wall.
 *
 * The Ø 30 cm ceramic downpipe does not run down the open room, and it is not
 * buried out of sight either: the owner's photograph 20260801_165527.jpg shows
 * it standing in an open rectangular recess cut through several courses, from
 * floor level up to where the vault springs. [ref] says the same in words —
 * the pipe comes "из ниш", out of the niches. This is that niche.
 */
export interface WallChase {
  azimuthDeg: number
  /** Width across the face, metres. */
  width: number
  bottomY: number
  topY: number
  /** How far it bites into the masonry. */
  depth: number
  /**
   * Width at the far end, if the chase is to taper. Omit for a parallel-sided
   * one — the downpipe's chase is parallel-sided and should stay so.
   *
   * An embrasure MUST taper, and must taper the same way as the window above it.
   * Cut as a parallel box it crosses the window's splayed reveal: the reveal
   * narrows from 1.50 m at the room face to 0.40 m outside, a 1.02 m box sits
   * INSIDE it near the room and OUTSIDE it from about 0.7 m deep, and the two
   * sets of side faces meet at a glancing angle right where they cross. That is
   * a near-coincident CSG pair, and it shows as a lip you catch on and a surface
   * you can see through — at eye level, because the chase's flat top is built to
   * meet the window's inner sill. Tapered a fixed margin wider than the reveal
   * at every depth, the two never come near each other.
   */
  outerWidth?: number
  /**
   * Cut with a round head instead of a flat lid. An embrasure is vaulted; the
   * downpipe's chase is a square-cut groove and stays one.
   */
  arched?: boolean
}

/** Cutting tool for one chase: a box sunk into the face at its azimuth. */
export function chaseCutter(c: WallChase): THREE.BufferGeometry {
  const face = innerRadiusAt((c.bottomY + c.topY) / 2)
  const height = Math.max(0.2, c.topY - c.bottomY)
  // reach back into the room so the mouth is fully open, not a slot
  const depth = c.depth + 0.3

  if (!c.arched) {
    // the downpipe's chase: a plain box, and it should stay one
    const geom = new THREE.BoxGeometry(depth, height, Math.max(0.2, c.width), 1, 1, 1)
    if (c.outerWidth !== undefined && Math.abs(c.outerWidth - c.width) > 1e-6) {
      const pos = geom.attributes.position as THREE.BufferAttribute
      const scale = Math.max(0.2, c.outerWidth) / Math.max(0.2, c.width)
      const halfX = depth / 2
      for (let i = 0; i < pos.count; i += 1) {
        if (pos.getX(i) > halfX - 1e-6) pos.setZ(i, pos.getZ(i) * scale)
      }
      pos.needsUpdate = true
    }
    geom.rotateY(Math.PI / 2 - c.azimuthDeg * DEG)
    const dir = azimuthToVector(c.azimuthDeg)
    const mid = face - 0.3 + depth / 2
    geom.translate(dir.x * mid, (c.bottomY + c.topY) / 2, dir.z * mid)
    return mergeVertices(geom)
  }

  /*
   * AN EMBRASURE IS VAULTED, and its crown must stand ABOVE the reveal it opens
   * into.
   *
   * Two faults in one box. The first is the shape: a rectangular prism with a
   * flat lid, where the photographs show a roughly hewn tunnel whose head dies
   * down to both cheeks along its whole length. The second is worse and was not
   * in the report — the flat lid sat exactly at the reveal's inner sill, so the
   * recess's ceiling and the window's floor were the SAME PLANE. Two coincident
   * CSG surfaces at eye level, which is where the owner was looking when they
   * called the surfaces holey.
   *
   * Lofted from two round-headed outlines instead, tapering with the reveal like
   * the box did, and carried a head's rise past the sill so the recess opens
   * INTO the window rather than butting against it.
   */
  const rings = [
    { r: face - 0.3, halfW: Math.max(0.1, c.width / 2) },
    { r: face - 0.3 + depth, halfW: Math.max(0.1, (c.outerWidth ?? c.width) / 2) },
  ]
  const ARC = 8
  const dir = azimuthToVector(c.azimuthDeg)
  const positions: number[] = []
  const bottom = c.bottomY
  for (const ring of rings) {
    const prof = windowProfile(ring.halfW, height / 2, 'round', ARC)
    for (const [x, y] of prof) {
      // x runs across the opening (tangential), y up, and the ring sits at its radius
      const tx = Math.cos(c.azimuthDeg * DEG) * x
      const tz = Math.sin(c.azimuthDeg * DEG) * x
      positions.push(dir.x * ring.r + tx, bottom + height / 2 + y, dir.z * ring.r + tz)
    }
  }
  const K = positions.length / 3 / rings.length
  const indices: number[] = []
  /*
   * Wound the opposite way round from windowCutter's, and that is not an
   * oversight: there, ring 0 is the OUTER end and the loft runs inward; here
   * ring 0 is the ROOM end and it runs outward. Reversing the sweep reverses
   * which winding faces out, and a tool whose faces face inward stops being a
   * solid to three-bvh-csg and quietly cuts nothing at all.
   */
  for (let k = 0; k < K; k += 1) {
    const k2 = (k + 1) % K
    indices.push(k, K + k, K + k2)
    indices.push(k, K + k2, k2)
  }
  for (let k = 1; k < K - 1; k += 1) {
    indices.push(0, k, k + 1)
    indices.push(K, K + k + 1, K + k)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  const uv: number[] = []
  for (let i = 0; i < positions.length / 3; i += 1) uv.push(0, 0)
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return mergeVertices(geom)
}


/**
 * A tunnel with a round-arched section, built about the origin: sill at y = 0,
 * springing at (height − width/2), crown at `height`, axis along local Z.
 *
 * The tower's doorways are vaulted — the entrance is a barrel-vaulted passage
 * through the wall, and the stair doors are arched openings, both clearly so in
 * the walkthrough footage. A square-cut hole reads as a modern punch.
 */
export function archTunnel(width: number, height: number, depth: number, segments = 10): THREE.BufferGeometry {
  const half = width / 2
  const springY = Math.max(0.01, height - half)

  const shape = new THREE.Shape()
  shape.moveTo(-half, 0)
  shape.lineTo(half, 0)
  shape.lineTo(half, springY)
  for (let i = 1; i <= segments; i++) {
    const t = (i / segments) * Math.PI // 0 at +x springing, π at −x
    shape.lineTo(half * Math.cos(t), springY + half * Math.sin(t))
  }
  shape.lineTo(-half, 0)

  const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 })
  geom.translate(0, 0, -depth / 2)
  return mergeVertices(geom)
}

/**
 * Cutting tool for one doorway onto the stair: an arched opening spanning the
 * opening's width, from inside the room through to the passage.
 */
export function doorwayCutter(d: StairDoorway): THREE.BufferGeometry {
  const midRadius = (d.innerRadius + d.outerRadius) / 2
  const depth = Math.max(0.1, d.outerRadius - d.innerRadius)
  // chord long enough to span the arc at the far side of the opening
  const tangential = Math.max(0.2, 2 * d.outerRadius * Math.sin((d.widthDeg * DEG) / 2))
  const height = Math.max(0.2, d.topY - d.bottomY)

  /*
   * A DOORWAY WITH NO WALL OVER ITS HEAD IS NOT ARCHED. Same fault, same shape of
   * fix as sectionProfile()'s.
   *
   * archTunnel() strikes a semicircle of radius half-the-width, so its crown
   * stands exactly at `height`. Where `height` is the last of the stone — the
   * roof exit, 0.751 m of parapet over a landing on the deck — that crown is
   * tangent to the roof plane, and a boolean asked to resolve a tangency leaves
   * whatever it leaves. Measured on the built shell it left a curved lid over the
   * way out onto the terrace.
   *
   * So: a plain box, carried PASSAGE_SKY_OVERSHOOT past the top of the stone.
   * Nothing about the building is being asserted by the square head — there is no
   * head, the wall simply stops.
   */
  // archTunnel runs its axis along local Z; the doorway's axis is RADIAL, so
  // the tunnel's width becomes the tangential span and its depth the wall run.
  const geom = d.openToSky
    ? (() => {
        const h = height + PASSAGE_SKY_OVERSHOOT
        const box = new THREE.BoxGeometry(tangential, h, depth)
        // archTunnel's origin is at the sill, centred on the span; match it
        box.translate(0, h / 2, 0)
        return mergeVertices(box)
      })()
    : archTunnel(tangential, height, depth)
  /*
   * Rake the tool before it is turned: archTunnel's local X is the tangential
   * span, so shearing Y against X tilts sill AND head together and the clear
   * height stays what topY was computed to give. A stair doorway is raking in
   * the real building for the same reason it has to be here — the floor on one
   * side of it is a flight of steps.
   */
  if (d.bottomRake) {
    const pos = geom.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + d.bottomRake * pos.getX(i))
    }
    pos.needsUpdate = true
  }
  geom.rotateY(-d.azimuthDeg * DEG)
  const dir = azimuthToVector(d.azimuthDeg)
  geom.translate(dir.x * midRadius, d.bottomY, dir.z * midRadius)
  return mergeVertices(geom)
}

/**
 * The stone the stair stands on, as a CLIPPER FOR THE WINDOW TOOLS rather than
 * a solid unioned into the building.
 *
 * IT APPLIES TO CHAMBER OPENINGS ONLY, AND THERE ARE NONE LEFT. This clip exists
 * because a window and a stair were competitors for the same stone — two
 * unmeasured azimuths colliding — and the owner's statement makes the tower's
 * slits PART OF the stair, so the argument does not apply to them. Hence
 * WindowCut.clipAgainstStairBearing; and on 2026-08-10 the last opening it
 * governed, the later arched window, was withdrawn when he restated that the
 * storeys carry no windows at all.
 *
 * SO IS THIS DEAD CODE? Not yet, and the distinction is worth being exact about,
 * because other machinery went out in the same change for being dead — see
 * src/lib/windows.ts. Those functions took a `heightFraction`, which is a
 * property only an opening positioned in its own right can have; they had no
 * possible input. This one takes a stair passage and a cutter, both of which
 * exist and are built every frame, and its argument — a window opening does not
 * remove the stone a stair is carried on — is structural and true of any
 * building. What it lacks is a caller, and windows.json → chamberOpeningsHistory
 * names exactly what would supply one.
 *
 * It is therefore kept and made LAZY: buildShellGeometry() assembles these
 * brushes only if some cutter asks for them, which today none does, so the six
 * sweeps and six prep() passes it used to cost on every rebuild are gone. If a
 * later reader finds this note unchanged and still no caller, delete it — a
 * standing "might be needed" is how a repository fills with furniture.
 *
 * WHAT THE FLAG COSTS TODAY IS NOTHING, AND THAT IS MEASURED, NOT ASSUMED. The
 * first draft of this note claimed that clipping a passage slit "would take out
 * the whole reveal". It would not, and the claim was never checked: this volume
 * is a HAUNCH UNDER THE PASSAGE FLOOR, spanning bottomY − 2·floorSlab to
 * bottomY + 0.05, while a slit's sill stands PASSAGE_OPENING.sillAboveLanding
 * above the landing. Measured on all six built slits: haunch top at landing
 * +0.03, sill at landing +0.30, overlap 0.000 m on every one. Forcing the clip
 * back on for every opening leaves the built shell pierced exactly as before.
 *
 * So the flag is a NO-OP for slits at the shipped numbers and is kept as a
 * statement of which openings the argument covers — with the 0.27 m clearance
 * pinned by a test, because it is only a no-op while the sill stays clear of the
 * haunch. Drop sillAboveLanding to zero, or deepen the haunch, and the clip
 * starts eating reveals silently.
 *
 * A window reveal that crosses the flight really does eat the passage floor —
 * measured on the built shell, storey 3's opening took it out from under the top
 * three treads of the first flight and the bottom tread of the second, up to
 * 2.39 m deep. That clash was between two numbers neither of which was measured:
 * STAIR.startAzimuthDeg was a [PLACEHOLDER] and data/windows.json gave its own
 * azimuths with ±20° of systematic error. Only the second half of that is still
 * true — since 2026-08-13 the stair's bearing is [OWNER] testimony resolved
 * against the [OSM] buttress, and windows.json no longer supplies an azimuth at
 * all — but the conclusion is unchanged and is now firmer: moving the stair to
 * make the picture tidy would be fitting the building to a preference, and it is
 * a witness's word that would be being overruled (CLAUDE.md rule 7).
 *
 * So the rule applied is structural instead, and it is true of any building: a
 * window opening does not remove the stone a stair is carried on. The mason cuts
 * the reveal until it meets the flight and stops. Expressed as geometry, that is
 * this volume subtracted FROM EACH WINDOW CUTTER before the cutter touches the
 * shell.
 *
 * Tool-on-tool is the whole point. The previous attempt put the same volume into
 * the shell as a union, where its walls ran 0.02 m from the passage walls and
 * exactly parallel to them for the length of the helix; three-bvh-csg resolved
 * that by deleting the floor under 112 of the 113 treads. Here the near-parallel
 * surfaces meet another tool, and the worst a stray face can do is leave a
 * little more or less stone inside a wall.
 */
export function stairBearingClip(sections: PassageSection[]): THREE.BufferGeometry | null {
  /*
   * Widened, not narrowed. It has to cover the passage's full footprint or a
   * window could still nibble the edge of the bed, and every millimetre of the
   * extra width is buried in masonry.
   */
  const spread = 0.2
  return stairPassageGeometry(
    sections.map((s) => ({
      ...s,
      innerRadius: Math.max(0.05, s.innerRadius - spread),
      outerRadius: s.outerRadius + spread,
      /*
       * Lapped a little INTO the passage, not stopped flush with its floor.
       *
       * Flush, the protected block's top face is coplanar with the passage floor
       * the cut has just made, and where a window trims round the block the
       * evaluator loses both — leaving the whole haunch reading as void from
       * below. The signature is unmistakable once seen: a drop of exactly one
       * tread-depth plus the haunch, 1.23 m, under the affected treads.
       *
       * The lap is buried inside the tread blocks, which run from the tread
       * surface down to this same floor, so nothing shows.
       */
      topY: s.bottomY + 0.05,
      /*
       * A HAUNCH, not a skin. One slab thickness was the first depth tried and
       * it is too thin to do the job: a doorway threshold notches a little way
       * into the bed, a window reveal takes over below the notch, and the two
       * voids merge into 1.98 m of nothing under the top tread of a flight.
       * Two slabs puts the whole of that notch inside protected stone.
       *
       * Two and not three, and the ceiling is not arbitrary either: with the
       * flights stacked one above another there is only about 0.65 m of masonry
       * between one passage's crown and the next one's floor, and a haunch deeper
       * than that reaches into the tunnel below.
       *
       * Deep, but not arbitrary at the other end either — a window is 1.9 m tall
       * and this leaves the great majority of any reveal free to cut. Where the
       * stair and a slit genuinely cross, the reveal reads as interrupted by the
       * flight, which is the honest picture of an unresolved clash between two
       * unsourced azimuths.
       */
      bottomY: s.bottomY - 2 * TOWER.floorSlab,
    })),
    { arched: false },
  )
}

/*
 * THE STAIR BED IS GONE, AND ITS REMOVAL IS THE FIX, NOT A SIMPLIFICATION.
 *
 * There used to be a "bed" here: the passage tube copied, dropped one slab
 * thickness below the passage floor, narrowed 0.02 m either side, lapped 0.01 m
 * up into the passage, and UNIONED back into the shell after the windows were
 * cut. Its purpose was to put back stone that a window reveal crossing the
 * flight would otherwise have taken out from under the steps.
 *
 * It did the opposite. Measured on the built shell, by casting a ray up from
 * below the plinth at five radii across the passage under every one of the 113
 * treads:
 *
 *     bed union OFF   →   0 / 113 treads without a floor
 *     bed union ON    → 112 / 113 treads without a floor
 *
 * The whole stair was hanging over a void running down to the plinth. That is
 * what the owner kept photographing — black holes under every step — and what
 * three rounds of looking at the tread geometry could never explain, because the
 * treads were never the problem.
 *
 * The mechanism is the narrowing. Pulled IN by 0.02 m, the bed's side walls end
 * up 2 cm from the passage walls and exactly parallel to them along the whole
 * helix, and three-bvh-csg cannot reconcile two near-coincident lofted surfaces:
 * it resolves the union by deleting the floor between them. Pushed OUT instead,
 * so the sides are buried 0.15 m deep in stone, the count falls to 3 / 113 — the
 * mechanism confirmed by reversing it. The comment that stood here argued the
 * narrowing put "every leftover face inside solid rock", which is backwards: it
 * put them a hair from the void.
 *
 * Widening would therefore have worked well enough. It is still deleted,
 * because with the union simply gone the floor is intact under every tread at
 * every radius, and the clash it defended against no longer exists: it was two
 * storey-6 slits flaring into the passage, and the slits moved when window
 * heights started coming from the photographs rather than from a filler sill.
 * A union that must be tuned to avoid destroying the building is worse than no
 * union, and there is now a test that fails the moment a window does eat the
 * floor — see "the shell carries a floor under every tread".
 */

/**
 * Cross-section of the passage, as (radius, height) pairs running from the
 * inner-bottom corner outward along the floor, up the outer side, over the
 * crown and back down to the inner side.
 *
 * Walkthrough footage of the tower shows the stair running under a POINTED
 * vault, not a flat soffit. Two centres, one at each springing, each of radius
 * equal to the span: the crown then stands √3/2 of the span above the
 * springing, which is where the springing line is set from so the crown lands
 * exactly on the headroom the passage was given. Clear height on the walking
 * line is therefore unchanged; only the corners come in.
 */
function sectionProfile(s: PassageSection, arched: boolean, arcSegments = 5): Array<[number, number]> {
  if (!arched) {
    return [
      [s.innerRadius, s.bottomY],
      [s.outerRadius, s.bottomY],
      [s.outerRadius, s.topY],
      [s.innerRadius, s.topY],
    ]
  }

  const span = s.outerRadius - s.innerRadius

  /*
   * A SECTION WITH NO VAULT IS CUT FLAT ON TOP, AND CUT PAST THE TOP OF THE STONE.
   *
   * Where PassageSection.openToSky is set, `topY` is not a crown — it is the top
   * of the building, and there is nothing above it to hold an arch up. Springing
   * one anyway is what this did on 2026-08-10 for the last third of the roof
   * climb, and it is worth recording what came out, because it looked plausible
   * and was not:
   *
   *   - the pointed vault's crown sits exactly AT topY, so with topY on the roof
   *     plane the arch was tangent to the top of the drum along a single line.
   *     Off that line the soffit curves away, so the cutter left a curved lid of
   *     parapet stone roofing the stair, thinning to nothing at the crown.
   *     Raycast down the built shell at r 5.2: solid at 27.500 from azimuth 30 to
   *     70, with the passage floor 1.1 m below it and open air in between — a
   *     tunnel roofed by a stone membrane that nothing holds up.
   *   - along the tangent line the two surfaces are coincident, which is the
   *     exact CSG case that has cost this model the floor under a whole flight
   *     twice.
   *
   * So the arc is flattened — `rise` goes to zero and the top edge is a straight
   * line at the top of the stone — and carried PASSAGE_SKY_OVERSHOOT above it, so
   * the tool's top face is unambiguously outside the solid. FLATTENED rather than
   * replaced by a four-point box, because stairPassageGeometry() lofts section to
   * section vertex by vertex and takes the vertex count from the FIRST profile:
   * hand it a 13-point arch and a 4-point box in one tube and the sweep is
   * garbage. The points stay, they simply lie on the straight.
   *
   * This restores what the shell drew before the clamp — a trench open to the sky
   * over the last stretch of the roof climb — but now it is drawn on purpose,
   * from arithmetic that is written down (26.749 + 2.300 against a top of
   * 27.500), instead of falling out of a cutter that reached 1.55 m into the air
   * and never said so. Whether the tower is like that is ROOF_QUESTION.
   */
  // radius of the two generating arcs — zero flattens the vault onto the straight
  const arcRadius = s.openToSky ? 0 : span
  const springY = s.openToSky
    ? s.topY + PASSAGE_SKY_OVERSHOOT
    : // keep at least a little straight wall under the springing
      Math.max(s.bottomY + 0.15, s.topY - (Math.sqrt(3) / 2) * span)

  const pts: Array<[number, number]> = [
    [s.innerRadius, s.bottomY],
    [s.outerRadius, s.bottomY],
    [s.outerRadius, springY],
  ]
  // outer half: arc centred on the INNER springing point
  for (let i = 1; i <= arcSegments; i++) {
    const t = (i / arcSegments) * (Math.PI / 3) // 0 → 60°
    pts.push([s.innerRadius + span * Math.cos(t), springY + arcRadius * Math.sin(t)])
  }
  // inner half: mirror, centred on the OUTER springing point
  for (let i = arcSegments - 1; i >= 1; i--) {
    const t = (i / arcSegments) * (Math.PI / 3)
    pts.push([s.outerRadius - span * Math.cos(t), springY + arcRadius * Math.sin(t)])
  }
  pts.push([s.innerRadius, springY])
  return pts
}

export function stairPassageGeometry(
  sections: PassageSection[],
  opts: { arched?: boolean } = {},
): THREE.BufferGeometry | null {
  if (sections.length < 2) return null
  const arched = opts.arched ?? true

  const positions: number[] = []
  const indices: number[] = []
  const uv: number[] = []

  const profiles = sections.map((s) => sectionProfile(s, arched))
  const K = profiles[0].length

  sections.forEach((s, i) => {
    const d = azimuthToVector(s.azimuthDeg)
    const u = sections.length > 1 ? i / (sections.length - 1) : 0
    profiles[i].forEach(([r, y], k) => {
      positions.push(d.x * r, y, d.z * r)
      uv.push(u, K > 1 ? k / (K - 1) : 0)
    })
  })

  /**
   * WHICH WAY THE SWEEP RUNS DECIDES BOTH WINDINGS, and it is not the same
   * decision for the walls as for the caps. Reading the sign is the fix.
   *
   * sectionProfile() lists its points counter-clockwise in the (radius, height)
   * plane, and that plane's own normal — radial × up — is the TANGENTIAL
   * direction, the way azimuth increases. Work the two winding rules out from
   * there and they point opposite ways:
   *
   *   walls  (a+k, b+k, b+k2)  face out of the tool only when the sections run
   *                            toward DECREASING azimuth;
   *   caps   (0, k+1, k)       face out of the tool only when they run toward
   *                            INCREASING azimuth.
   *
   * So this function was correct for NEITHER winding. STAIR.winding is
   * 'counterclockwise', azimuth decreases, and the walls were right while both
   * end caps were inside-out; three-bvh-csg then flipped them again on the
   * subtraction and left every passage end wall facing into the masonry —
   * culled by a FrontSide material, so you looked straight through the tower at
   * the end of each flight. Twelve ends, 23.06 m² of it. Turn `winding` back to
   * 'clockwise' — it is a live leva control, and staircase.ts still calls the
   * question UNRESOLVED — and the identical code would have inverted the walls
   * instead, which is 60–97 m² per tube rather than 2.
   *
   * Nothing existing could have caught it. A cap lies in a plane containing the
   * tower axis, so p·n = 0 over the whole fan and the origin-based signed volume
   * comes out +21.58 either way round. What does catch it is Σ area·normal over
   * a closed surface, which must vanish: it measured 7.42 m² here.
   */
  const rising = sections[sections.length - 1].azimuthDeg >= sections[0].azimuthDeg

  // wall quads between consecutive sections
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * K
    const b = (i + 1) * K
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K
      // Winding must stay outward-facing: reversed, the CSG evaluator stops
      // treating the tool as a solid and subtracts nothing at all.
      if (rising) {
        indices.push(a + k, b + k2, b + k)
        indices.push(a + k, a + k2, b + k2)
      } else {
        indices.push(a + k, b + k, b + k2)
        indices.push(a + k, b + k2, a + k2)
      }
    }
  }

  // caps, so the sweep is a closed solid rather than an open tube — wound
  // against the sweep at the near end and with it at the far one, which is the
  // opposite condition from the walls above
  const last = (sections.length - 1) * K
  for (let k = 1; k < K - 1; k++) {
    if (rising) {
      indices.push(0, k + 1, k)
      indices.push(last, last + k, last + k + 1)
    } else {
      indices.push(0, k, k + 1)
      indices.push(last, last + k + 1, last + k)
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()

  // three-bvh-csg requires both operands to carry the same attributes, and the
  // shell comes from primitives that have uv. Without this the evaluator throws
  // "Attribute uv not available on geometry" — which in the browser takes the
  // whole React tree down rather than showing a tidy error.
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))

  return geom
}

export function buildShellGeometry(p: ShellParams): {
  geometry: THREE.BufferGeometry
  stats: ShellStats
} {
  const R = TOWER.outerRadius
  const H = TOWER.topY

  /*
   * Outer drum. It reaches BELOW the threshold, down past the street.
   *
   * It used to start at y = 0, which is the floor of storey 1 and the level the
   * doorway opens onto. Once the ground outside was put where the raised
   * entrance says it is — a sill height lower — the tower stood on nothing: a
   * two-metre gap right round the base, daylight under the wall.
   *
   * [ICOMOS 958] has the foundation going some 15 m below ground, so the drum
   * carrying on down is not an invention; what is arbitrary is only how far
   * below the paving to stop, and that is buried and invisible.
   */
  const BASE_Y = ENTRANCE.groundY - 0.5
  const drumHeight = H - BASE_Y
  const drum = new THREE.CylinderGeometry(R, R, drumHeight, RADIAL_SEGMENTS, 1, false)
  drum.translate(0, BASE_Y + drumHeight / 2, 0)

  // Inner cavity — cone following innerRadiusAt(); extended past both ends so
  // the subtraction cuts cleanly instead of leaving coplanar faces.
  const iB = innerRadiusAt(0)
  const iT = innerRadiusAt(H)
  const slope = (iT - iB) / H
  /*
   * The cavity stops at the floor of storey 1. Below that is the plinth the
   * tower stands on, and it is solid — extending the hollow down into it would
   * open the new base up again from the inside.
   */
  const ext = 1.0
  const cavityHeight = H + ext
  const cavity = new THREE.CylinderGeometry(
    iT + slope * ext,
    iB,
    cavityHeight,
    RADIAL_SEGMENTS,
    1,
    false,
  )
  cavity.translate(0, cavityHeight / 2, 0)

  /*
   * Buttress — extruded from the DRUM'S OWN BASE, not from y = 0.
   *
   * It was laid off from y = 0, which is the floor of storey 1 and the level the
   * doorway opens onto — the same mistake the drum itself had and the comment
   * above records fixing. The pier therefore floated: its underside stood 1.98 m
   * above the paving, so a 10.7 m projection had daylight under it right round
   * its foot, and at the other end it finished at 29.5 m against a parapet at
   * 27.5, standing two metres proud of the tower it leans on. In every
   * photograph that shows its foot the pier runs straight down past the coarse
   * ashlar into the rock.
   *
   * WHERE ITS HEAD BELONGS IS NOT SETTLED. One reading of the exterior set puts
   * it level with the parapet, finished with the same coping running unbroken
   * round the re-entrant; another puts it at 18.3 ± 0.5 m, about 0.62 of the
   * height, with a rounded head curving in to meet the drum, and calls that the
   * largest single silhouette error in the model. They cannot both be right and
   * the verification pass that would have settled it never ran. The parapet is
   * kept because it is what the config already said; a survey, or a fifth
   * reading, decides. Only the clamp is new — whatever the height, the pier may
   * not overshoot the drum.
   */
  const beakTopY = Math.min(BASE_Y + p.buttressHeight, TOWER.topY)
  const beak = new THREE.ExtrudeGeometry(
    beakShape(p.buttressProjection, p.buttressTipWidth, p.buttressRootArcDeg, p.buttressSkewDeg),
    { depth: beakTopY - BASE_Y, bevelEnabled: false, steps: 1 },
  )
  beak.rotateX(-Math.PI / 2) // extrude axis Z → up (+Y); plan now faces north (-Z)
  beak.translate(0, BASE_Y, 0) // and down onto the same footing as the drum
  beak.rotateY(-p.buttressAzimuthDeg * DEG) // north → requested azimuth (clockwise)
  const beakIndexed = mergeVertices(beak) // ExtrudeGeometry is non-indexed; weld to match the primitives

  // Entrance — a barrel-vaulted passage through the wall, not a square hole.
  const dir = azimuthToVector(p.entranceAzimuthDeg)
  const entrance = archTunnel(
    p.entranceWidth,
    p.entranceHeight,
    TOWER.wallThicknessBase * 2 + 2,
  )
  entrance.rotateY(-p.entranceAzimuthDeg * DEG)
  entrance.translate(dir.x * R, p.entranceSillY, dir.z * R)

  const evaluator = new Evaluator()
  evaluator.useGroups = false

  const drumB = new Brush(prep(drum))
  const beakB = new Brush(prep(beakIndexed))
  const cavityB = new Brush(prep(cavity))
  const entranceB = new Brush(prep(entrance))
  for (const b of [drumB, beakB, cavityB, entranceB]) b.updateMatrixWorld(true)

  let result = evaluator.evaluate(drumB, beakB, ADDITION)
  result = evaluator.evaluate(result, cavityB, SUBTRACTION)
  result = evaluator.evaluate(result, entranceB, SUBTRACTION)

  /*
   * The stair passage, carved BEFORE the windows — same order, different reason.
   *
   * It used to be "so a window cut that lands on the flight still resolves
   * cleanly", which described an accident. Since 2026-08-10 most openings are
   * deliberately part of a passage: a slit's reveal starts on the passage's outer
   * cheek and its inner overshoot runs on into the tunnel. Cutting the tunnel
   * first means that overshoot ends in void it does not have to remove, instead
   * of the window tool and the passage tool meeting along a shared surface. This
   * model has lost the floor under a whole flight twice to near-coincident CSG;
   * the order is load-bearing and must not be swapped.
   */
  for (const flight of p.stairPassage ?? []) {
    const passage = stairPassageGeometry(flight)
    if (!passage) continue
    const tool = new Brush(prep(passage))
    tool.updateMatrixWorld(true)
    result = evaluator.evaluate(result, tool, SUBTRACTION)
  }

  /*
   * Window openings — each a truncated pyramid, narrow face outward, so the
   * reveal flares into the room exactly as [ref] describes.
   *
   * An opening that is NOT part of the stair is clipped against the stone the
   * stair is carried on; a slit at the end of a passage is part of it and is not
   * — see WindowCut.clipAgainstStairBearing and the note on stairBearingClip().
   *
   * BUILT ON DEMAND, because since 2026-08-10 nothing demands it. The clip used
   * to be assembled unconditionally: six passage sweeps, six prep() passes and
   * six Brushes on every shell rebuild, and after the last chamber opening was
   * withdrawn not one cutter asked for any of them. Kept lazy rather than
   * deleted, for the reason on stairBearingClip().
   */
  let bearing: Brush[] | null = null
  const stairBearingBrushes = (): Brush[] => {
    if (bearing) return bearing
    bearing = (p.stairPassage ?? [])
      .map((flight) => stairBearingClip(flight))
      .filter((g): g is THREE.BufferGeometry => g !== null)
      .map((g) => {
        const b = new Brush(prep(g))
        b.updateMatrixWorld(true)
        return b
      })
    return bearing
  }
  for (const w of p.windows ?? []) {
    let tool = new Brush(prep(windowCutter(w)))
    tool.updateMatrixWorld(true)
    if (w.clipAgainstStairBearing) {
      for (const clip of stairBearingBrushes()) {
        tool = evaluator.evaluate(tool, clip, SUBTRACTION)
        tool.updateMatrixWorld(true)
      }
    }
    result = evaluator.evaluate(result, tool, SUBTRACTION)
  }

  /**
   * The doorways onto the stair, cut LAST so the bed cannot seal them.
   *
   * With the passage closed inside the wall, these are the only way in; the
   * walkthrough footage shows exactly this — an arched opening the width of the
   * flight at each storey, steps starting immediately behind it.
   */
  for (const d of p.stairDoorways ?? []) {
    const tool = new Brush(prep(doorwayCutter(d)))
    tool.updateMatrixWorld(true)
    result = evaluator.evaluate(result, tool, SUBTRACTION)
  }

  // the chase the downpipe stands in, cut last like the doorways
  for (const c of p.wallChases ?? []) {
    const tool = new Brush(prep(chaseCutter(c)))
    tool.updateMatrixWorld(true)
    result = evaluator.evaluate(result, tool, SUBTRACTION)
  }

  // Weld, then drop the zero-area slivers welding leaves behind — they carry no
  // surface, break vertex normals and would upset the Phase-6 collider.
  let geometry = result.geometry
  geometry = mergeVertices(geometry, 1e-5)
  if (geometry.index) {
    geometry.setIndex(
      filterDegenerateTriangles(geometry.attributes.position.array, geometry.index.array),
    )
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()

  const idx = geometry.index ? geometry.index.array : null
  const stats: ShellStats = {
    triangleCount: idx ? idx.length / 3 : geometry.attributes.position.count / 3,
    vertexCount: geometry.attributes.position.count,
    degenerateCount: countDegenerateTriangles(geometry.attributes.position.array, idx),
  }

  for (const g of [drum, cavity, beak, beakIndexed, entrance]) g.dispose()

  return { geometry, stats }
}

/**
 * Outer surface radius per azimuth at a given height, measured by casting rays
 * inward from outside the tower. Raycasting (not vertex sampling) is required:
 * a CSG result only carries vertices along cut edges, so a horizontal slice
 * usually contains none.
 *
 * Returns the radius of the outermost surface per azimuth bucket, or 0 where a
 * ray hit nothing.
 */
export function outerRadiusProfileAt(
  geometry: THREE.BufferGeometry,
  y: number,
  buckets = 36,
): number[] {
  const mesh = new THREE.Mesh(geometry)
  mesh.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()
  raycaster.firstHitOnly = false
  const far = TOWER.outerRadius * 6

  const out = new Array<number>(buckets).fill(0)
  for (let b = 0; b < buckets; b++) {
    const azDeg = (b / buckets) * 360
    const d = azimuthToVector(azDeg) // outward direction
    const origin = new THREE.Vector3(d.x * far, y, d.z * far)
    const dir = new THREE.Vector3(-d.x, 0, -d.z).normalize() // inward
    raycaster.set(origin, dir)
    const hits = raycaster.intersectObject(mesh, false)
    if (hits.length > 0) {
      const p = hits[0].point
      out[b] = Math.hypot(p.x, p.z)
    }
  }
  return out
}

/**
 * Inner cavity radius per azimuth at a given height, measured by casting rays
 * outward from the tower axis. Returns 0 where a ray escaped without hitting.
 */
export function innerRadiusProfileAt(
  geometry: THREE.BufferGeometry,
  y: number,
  buckets = 36,
): number[] {
  const mesh = new THREE.Mesh(geometry)
  mesh.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()

  const out = new Array<number>(buckets).fill(0)
  for (let b = 0; b < buckets; b++) {
    const azDeg = (b / buckets) * 360
    const d = azimuthToVector(azDeg)
    raycaster.set(new THREE.Vector3(0, y, 0), new THREE.Vector3(d.x, 0, d.z).normalize())
    const hits = raycaster.intersectObject(mesh, false)
    if (hits.length > 0) {
      const p = hits[0].point
      out[b] = Math.hypot(p.x, p.z)
    }
  }
  return out
}
