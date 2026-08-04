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
 * Cutting tool for one window.
 *
 * Built as a box whose inner end is scaled up, then aimed along the opening's
 * azimuth. It runs from beyond the outer face to well inside the room, so the
 * subtraction removes the whole reveal in one go rather than leaving a lip.
 */
export function windowCutter(w: WindowCut): THREE.BufferGeometry {
  const R = TOWER.outerRadius
  const inner = innerRadiusAt(w.centreY)
  const depth = R - inner + 2 // overshoot both faces so no coplanar slivers remain

  // A box spanning the wall, then tapered: vertices at the inner end pushed out.
  const geom = new THREE.BoxGeometry(w.outerWidth, w.outerHeight, depth, 1, 1, 1)
  const pos = geom.attributes.position as THREE.BufferAttribute
  const halfDepth = depth / 2
  const wScale = w.innerWidth / w.outerWidth
  const hScale = w.innerHeight / w.outerHeight
  for (let i = 0; i < pos.count; i++) {
    // local +Z is the inward end after the rotation below
    const t = (pos.getZ(i) + halfDepth) / depth // 0 at outer end, 1 at inner end
    const k = 1 + (wScale - 1) * t
    const kh = 1 + (hScale - 1) * t
    pos.setX(i, pos.getX(i) * k)
    pos.setY(i, pos.getY(i) * kh)
  }
  pos.needsUpdate = true

  // Aim it so local +Z (the widened end) points INWARD. rotateY(θ) sends local
  // +Z to (sin θ, 0, cos θ); the inward direction is −dir = (−sin az, 0, cos az),
  // so θ = −az. Adding π here would flare the opening outward — the wrong way round.
  const dir = azimuthToVector(w.azimuthDeg)
  geom.rotateY(-w.azimuthDeg * DEG)
  // place it so the narrow end overshoots the outer face
  geom.translate(dir.x * (R + 1 - depth / 2), w.centreY, dir.z * (R + 1 - depth / 2))
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
  geom.rotateY(-d.azimuthDeg * DEG)
  const dir = azimuthToVector(d.azimuthDeg)
  geom.translate(dir.x * midRadius, d.bottomY, dir.z * midRadius)
  return mergeVertices(geom)
}

/**
 * The masonry bed the stair passage rests on: the same swept tube, dropped to
 * sit directly beneath the passage floor.
 *
 * One floor-slab thickness deep, so it uses no number that is not already in
 * config/tower.ts. Unioned back into the shell after the window cuts, since a
 * window reveal that crosses the flight would otherwise cut the floor out from
 * under the steps.
 */
export function stairBedGeometry(sections: PassageSection[]): THREE.BufferGeometry | null {
  /*
   * Inset from the passage walls, and lapped a centimetre up into it.
   *
   * The bed is only NEEDED where a window reveal has carved the passage floor
   * away; everywhere else it is redundant, buried in stone that was never cut.
   * Redundant or not, if its sides sit exactly ON the passage walls the two
   * surfaces are coplanar, and a CSG evaluator that is not watertight leaves
   * both — which shows in-game as bright vertical seams running the height of
   * the passage. Pulling the sides in puts every leftover face inside solid
   * rock; lapping the top up keeps the floor itself closed.
   */
  const inset = 0.02
  return stairPassageGeometry(
    sections.map((s) => ({
      ...s,
      innerRadius: s.innerRadius + inset,
      outerRadius: Math.max(s.innerRadius + inset + 0.05, s.outerRadius - inset),
      topY: s.bottomY + 0.01,
      bottomY: s.bottomY - TOWER.floorSlab,
    })),
    { arched: false },
  )
}

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
  const H = TOWER.height

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

  // Window openings — each a truncated pyramid, narrow face outward, so the
  // reveal flares into the room exactly as [ref] describes.
  for (const w of p.windows ?? []) {
    const tool = new Brush(prep(windowCutter(w)))
    tool.updateMatrixWorld(true)
    result = evaluator.evaluate(result, tool, SUBTRACTION)
  }

  /**
   * Put back the masonry the stair is carried on — AFTER the windows.
   *
   * Measured: the two storey-6 slits (az 141 and az 132, both centred at
   * y 19.35) flare inward far enough that their reveals merge into one 25° pit
   * through the stair passage floor, from az 149 down to az 124, between 1.07
   * and 2.08 m deep. A stair in a wall is carried on stone; a window opening
   * cannot take that stone away and leave the steps hanging.
   *
   * This deliberately leaves the conflict VISIBLE rather than tuning it away:
   * the bed crosses those two slits, so the reveal reads as interrupted by the
   * stair. That is the honest picture. The clash is between two unsourced
   * numbers — STAIR.startAzimuthDeg, flagged [PLACEHOLDER], and the azimuths in
   * data/windows.json, which that file itself gives ±20° of systematic error.
   * Moving either to make the picture tidier would be fitting geometry to a
   * preference (CLAUDE.md rule 7).
   */
  for (const flight of p.stairPassage ?? []) {
    const bed = stairBedGeometry(flight)
    if (!bed) continue
    const tool = new Brush(prep(bed))
    tool.updateMatrixWorld(true)
    result = evaluator.evaluate(result, tool, ADDITION)
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
