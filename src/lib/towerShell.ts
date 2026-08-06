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

/** Strip material groups so the single-material CSG evaluator stays happy. */
function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.clearGroups()
  return g
}

/** One opening in world space: a truncated pyramid, small face at the outer wall. */
export interface WindowCut {
  azimuthDeg: number
  /** World Y of the opening's centre. */
  centreY: number
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
}

/**
 * How far a window cutter runs past each face of the wall. CSG hygiene, not a
 * measurement of the building: the tool has to poke out both sides so the
 * boolean never has to resolve two coplanar surfaces.
 */
const WINDOW_CUT_OVERSHOOT = 1 // m

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
 * exactly at r = outerRadius to innerWidth exactly at r = innerRadiusAt(centreY),
 * and the two overshoot rings repeat their neighbour's section unchanged. The
 * wall thickness that governs the splay is the ACTUAL one at this height, which
 * is why the same slit reads differently near the base and near the parapet.
 */
export function windowCutter(w: WindowCut): THREE.BufferGeometry {
  const R = TOWER.outerRadius
  const inner = innerRadiusAt(w.centreY)
  const wall = R - inner // masonry actually crossed at this height
  const depth = wall + 2 * WINDOW_CUT_OVERSHOOT

  // A box spanning the wall and both overshoots, then tapered: the rings from
  // the outer face inward are pushed out to the room-side section.
  const geom = new THREE.BoxGeometry(w.outerWidth, w.outerHeight, depth, 1, 1, 3)
  const pos = geom.attributes.position as THREE.BufferAttribute
  const halfDepth = depth / 2
  const wScale = w.innerWidth / w.outerWidth
  const hScale = w.innerHeight / w.outerHeight
  /*
   * Where the four rings go (local +Z is the inward end after the rotation
   * below) and how far each is through the splay. BoxGeometry spaces them
   * evenly, so the middle two get pulled onto the wall faces; a ring boundary
   * is the only place a linear interpolation across a quad can change slope.
   */
  const ringZ = [
    -halfDepth, // WINDOW_CUT_OVERSHOOT out in front of the outer face
    -halfDepth + WINDOW_CUT_OVERSHOOT, // the outer face
    halfDepth - WINDOW_CUT_OVERSHOOT, // the room-side face
    halfDepth, // and past it into the room
  ]
  const ringT = [0, 0, 1, 1]
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.round(((pos.getZ(i) + halfDepth) / depth) * 3)
    const t = ringT[ring]
    const k = 1 + (wScale - 1) * t
    const kh = 1 + (hScale - 1) * t
    pos.setX(i, pos.getX(i) * k)
    pos.setY(i, pos.getY(i) * kh)
    pos.setZ(i, ringZ[ring])
  }
  pos.needsUpdate = true

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
}

/** Cutting tool for one chase: a box sunk into the face at its azimuth. */
export function chaseCutter(c: WallChase): THREE.BufferGeometry {
  const face = innerRadiusAt((c.bottomY + c.topY) / 2)
  const height = Math.max(0.2, c.topY - c.bottomY)
  // reach back into the room so the mouth is fully open, not a slot
  const depth = c.depth + 0.3
  const geom = new THREE.BoxGeometry(depth, height, Math.max(0.2, c.width))
  geom.rotateY(Math.PI / 2 - c.azimuthDeg * DEG)
  const dir = azimuthToVector(c.azimuthDeg)
  // centre it so the box spans from 0.3 m inside the room to `depth` into the wall
  const mid = face - 0.3 + depth / 2
  geom.translate(dir.x * mid, (c.bottomY + c.topY) / 2, dir.z * mid)
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

  // archTunnel runs its axis along local Z; the doorway's axis is RADIAL, so
  // the tunnel's width becomes the tangential span and its depth the wall run.
  const geom = archTunnel(tangential, height, depth)
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
 * A window reveal that crosses the flight really does eat the passage floor —
 * measured on the built shell, storey 3's opening takes it out from under the
 * top three treads of the first flight and the bottom tread of the second, up to
 * 2.39 m deep. That clash is real and it is between two numbers neither of which
 * is measured: STAIR.startAzimuthDeg is [PLACEHOLDER], and data/windows.json
 * gives its own azimuths ±20° of systematic error. Moving either to make the
 * picture tidy would be fitting geometry to a preference (CLAUDE.md rule 7).
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
      topY: s.bottomY,
      /*
       * A HAUNCH, not a skin. One slab thickness was the first depth tried and
       * it is too thin to do the job: a doorway threshold notches a little way
       * into the bed, a window reveal takes over below the notch, and the two
       * voids merge into 1.98 m of nothing under the top tread of a flight.
       * Three slabs puts the whole of that notch inside protected stone.
       *
       * Deep, but not arbitrary at the other end either — a window is 1.9 m tall
       * and this leaves the great majority of any reveal free to cut. Where the
       * stair and a slit genuinely cross, the reveal reads as interrupted by the
       * flight, which is the honest picture of an unresolved clash between two
       * unsourced azimuths.
       */
      bottomY: s.bottomY - 3 * TOWER.floorSlab,
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
  const crownRise = (Math.sqrt(3) / 2) * span
  // keep at least a little straight wall under the springing
  const springY = Math.max(s.bottomY + 0.15, s.topY - crownRise)

  const pts: Array<[number, number]> = [
    [s.innerRadius, s.bottomY],
    [s.outerRadius, s.bottomY],
    [s.outerRadius, springY],
  ]
  // outer half: arc centred on the INNER springing point
  for (let i = 1; i <= arcSegments; i++) {
    const t = (i / arcSegments) * (Math.PI / 3) // 0 → 60°
    pts.push([s.innerRadius + span * Math.cos(t), springY + span * Math.sin(t)])
  }
  // inner half: mirror, centred on the OUTER springing point
  for (let i = arcSegments - 1; i >= 1; i--) {
    const t = (i / arcSegments) * (Math.PI / 3)
    pts.push([s.outerRadius - span * Math.cos(t), springY + span * Math.sin(t)])
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

  // wall quads between consecutive sections
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * K
    const b = (i + 1) * K
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K
      // Winding must stay outward-facing: reversed, the CSG evaluator stops
      // treating the tool as a solid and subtracts nothing at all.
      indices.push(a + k, b + k, b + k2)
      indices.push(a + k, b + k2, a + k2)
    }
  }

  // caps, so the sweep is a closed solid rather than an open tube
  const last = (sections.length - 1) * K
  for (let k = 1; k < K - 1; k++) {
    indices.push(0, k + 1, k)
    indices.push(last, last + k, last + k + 1)
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

  // Buttress — extrude the beak plan upward, then aim it at its azimuth.
  const beak = new THREE.ExtrudeGeometry(
    beakShape(p.buttressProjection, p.buttressTipWidth, p.buttressRootArcDeg, p.buttressSkewDeg),
    { depth: p.buttressHeight, bevelEnabled: false, steps: 1 },
  )
  beak.rotateX(-Math.PI / 2) // extrude axis Z → up (+Y); plan now faces north (-Z)
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

  // The stair passage: carve it before the windows so a window cut that lands on
  // the flight still resolves cleanly.
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
   * Clipped first against the stone the stair is carried on, where there is a
   * stair to carry — see stairBearingClip().
   */
  const bearing = (p.stairPassage ?? [])
    .map((flight) => stairBearingClip(flight))
    .filter((g): g is THREE.BufferGeometry => g !== null)
    .map((g) => {
      const b = new Brush(prep(g))
      b.updateMatrixWorld(true)
      return b
    })
  for (const w of p.windows ?? []) {
    let tool = new Brush(prep(windowCutter(w)))
    tool.updateMatrixWorld(true)
    for (const clip of bearing) {
      tool = evaluator.evaluate(tool, clip, SUBTRACTION)
      tool.updateMatrixWorld(true)
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
