import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { STAIRHEAD } from '../../config/tower'
import { SAWN_ASHLAR } from '../../lib/masonry'
import {
  STAIRHEAD_ARC_DEG,
  stairheadCheeks,
  stairheadRibs,
  stairheadSoffitY,
  type Stairhead as StairheadPlan,
  type StairheadRib,
} from '../../lib/stairhead'

/**
 * THE HEAD-HOUSE — the wedge you come out of onto the terrace.
 *
 * WHERE THE DECISIONS ARE. Not here. lib/stairhead.ts says which end is the way
 * out, how the soffit rakes and where the cheeks stand; config/tower.ts's
 * STAIRHEAD carries the four numbers the frames and the borrow supply, and says
 * what each one rests on. This file sweeps sections and merges them, and carries
 * no dimension of its own (rule 2).
 *
 * WHY IT IS A SWEEP AND NOT A LATHE. Everything else round this drum is a
 * surface of revolution and can be a LatheGeometry; this cannot, because its
 * height is a function of azimuth. So the wedge is built the way a mason builds
 * it: one cross-section per rib, each an upright rectangle in the meridian
 * plane, swept round the arc. The section's own order is the winding — see
 * sweepPrism.
 */

/** A cross-section: four points in (radius, world Y), counter-clockwise. */
type Section = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
]

const DEG = Math.PI / 180

/**
 * Sweep a four-sided section round an arc.
 *
 * THE WINDING IS THE WHOLE OF IT, and it is the fault this repo has paid for
 * twice — once on the storey slabs (d50ddc1) and once on the terrace paving
 * (60ac45e), both times a surface whose normals pointed at the floor below it
 * and which therefore was not there when you looked at it.
 *
 * The local frame at azimuth a is (R̂, Ŷ, T̂) with R̂ the outward radial, T̂ the
 * direction of INCREASING azimuth, and R̂ × Ŷ = T̂ — right-handed. A section
 * given counter-clockwise in (r, y) and swept along +T̂ comes out with every side
 * face pointing away from the solid. So the ribs are put in increasing-azimuth
 * order before sweeping, whichever end the way out is at, and the caps are wound
 * to match: the last ring faces +T̂, the first faces −T̂.
 *
 * Degenerate quads are DROPPED rather than emitted. The cheeks come to a knife
 * edge where the rake meets the paving, so the last section is a line and the
 * two triangles on it have no area — the case lib/mesh.ts exists to count, and
 * the one that makes a collider off a drawn mesh unreliable.
 */
function sweepPrism(ribs: StairheadRib[], sectionAt: (rib: StairheadRib) => Section) {
  const ordered =
    ribs.length > 1 && ribs[ribs.length - 1].azimuthDeg < ribs[0].azimuthDeg
      ? [...ribs].reverse()
      : ribs
  const rings = ordered.map((rib) => {
    const rad = rib.azimuthDeg * DEG
    const sx = Math.sin(rad)
    const sz = -Math.cos(rad)
    return sectionAt(rib).map(([r, y]) => new THREE.Vector3(sx * r, y, sz * r))
  })

  const positions: number[] = []
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const abx = b.x - a.x
    const aby = b.y - a.y
    const abz = b.z - a.z
    const acx = c.x - a.x
    const acy = c.y - a.y
    const acz = c.z - a.z
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    if (nx * nx + ny * ny + nz * nz < 1e-14) return
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    pushTri(a, b, c)
    pushTri(a, c, d)
  }

  for (let i = 0; i < rings.length - 1; i += 1) {
    const p = rings[i]
    const q = rings[i + 1]
    for (let k = 0; k < 4; k += 1) {
      const n = (k + 1) % 4
      pushQuad(p[k], p[n], q[n], q[k])
    }
  }
  if (rings.length > 0) {
    const first = rings[0]
    const last = rings[rings.length - 1]
    pushQuad(last[0], last[1], last[2], last[3])
    pushQuad(first[3], first[2], first[1], first[0])
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.computeVertexNormals()
  return geom
}

/**
 * The two cheeks: ashlar from the paving up to the rake.
 *
 * Each stands OUTSIDE its own edge of the well — see stairheadCheeks() for why
 * the inner one's thickness is not a choice. Their tops are the soffit, so the
 * lantern lying on them is lying on stone at every rib rather than floating.
 */
function useAshlarGeometry(plan: StairheadPlan) {
  return useMemo(() => {
    const ribs = stairheadRibs(plan, STAIRHEAD_ARC_DEG)
    const parts = stairheadCheeks(plan, STAIRHEAD).map((cheek) =>
      sweepPrism(ribs, (rib) => [
        [cheek.innerRadius, plan.deckY],
        [cheek.outerRadius, plan.deckY],
        [cheek.outerRadius, rib.soffitY],
        [cheek.innerRadius, rib.soffitY],
      ]),
    )
    return mergeGeometries(parts, false)
  }, [plan])
}

/**
 * The lantern: one inclined sheet lying on the two cheeks, and the metal
 * profile that frames it.
 *
 * The sheet spans the WELL and both bearings — the cheeks' own inner faces are
 * where a sheet would be cut to, and up/243 shows it running out over the ashlar
 * on both sides — so it is drawn from cheek to cheek and the frame straddles the
 * two edges. The eaves profile at the foot is a straight bar rather than a swept
 * one: at that end the soffit IS the paving, and a bar 0.08 m across laid on
 * 0.08 m of arc has no curvature left to describe.
 */
function useLanternGeometry(plan: StairheadPlan) {
  return useMemo(() => {
    const ribs = stairheadRibs(plan, STAIRHEAD_ARC_DEG)
    const t = STAIRHEAD.glazingThickness
    const w = STAIRHEAD.frameWidth
    const glass = sweepPrism(ribs, (rib) => [
      [plan.innerRadius, rib.soffitY],
      [plan.outerRadius, rib.soffitY],
      [plan.outerRadius, rib.soffitY + t],
      [plan.innerRadius, rib.soffitY + t],
    ])
    const bars = [plan.innerRadius, plan.outerRadius].map((r) =>
      sweepPrism(ribs, (rib) => [
        [r - w / 2, rib.soffitY],
        [r + w / 2, rib.soffitY],
        [r + w / 2, rib.soffitY + w],
        [r - w / 2, rib.soffitY + w],
      ]),
    )
    /*
     * The eaves, across the foot where the glass lands on the slabs.
     *
     * MADE TO MATCH THE SWEEPS BEFORE IT IS MERGED WITH THEM. A BoxGeometry is
     * indexed and carries a `uv`; the prisms above are neither. mergeGeometries
     * returns NULL rather than throwing when its inputs disagree about that, and
     * a null geometry reaches the renderer as
     * `Cannot read properties of null (reading 'boundingSphere')` — once per
     * frame, from a mesh that is simply not drawn. Measured: with the box left
     * as it comes, the whole lantern frame was missing from the terrace and the
     * console carried the error fifteen times over. Nothing here is textured, so
     * dropping the channel costs nothing.
     */
    const eaves = new THREE.BoxGeometry(
      plan.outerRadius - plan.innerRadius + w,
      w,
      w,
    ).toNonIndexed()
    eaves.deleteAttribute('uv')
    const footRad = plan.footAzimuthDeg * DEG
    const midR = (plan.innerRadius + plan.outerRadius) / 2
    eaves.rotateY(Math.PI / 2 - footRad)
    eaves.translate(
      Math.sin(footRad) * midR,
      stairheadSoffitY(plan, plan.footAzimuthDeg) + w / 2,
      -Math.cos(footRad) * midR,
    )
    return { glass, frame: mergeGeometries([...bars, eaves], false) }
  }, [plan])
}

/**
 * The threshold profile, set flush in the paving at the way out.
 *
 * roof/007 and down/001: a bright strip lying IN the slabs with the treads
 * starting straight behind it. Flush means flush — its top face is ROOF.deckY,
 * which is `plan.deckY` here — and it gets no collider, on the drainage
 * channel's own reasoning: 0.04 m is under everything the capsule can feel.
 */
function useThresholdGeometry(plan: StairheadPlan) {
  return useMemo(() => {
    const width = STAIRHEAD.thresholdWidth
    const span = plan.outerRadius - plan.innerRadius
    const geom = new THREE.BoxGeometry(span, width, width)
    const rad = plan.exitAzimuthDeg * DEG
    const midR = (plan.innerRadius + plan.outerRadius) / 2
    geom.rotateY(Math.PI / 2 - rad)
    geom.translate(Math.sin(rad) * midR, plan.deckY - width / 2, -Math.cos(rad) * midR)
    return geom
  }, [plan])
}

export interface StairheadProps {
  /** The wedge, as lib/stairhead.ts planned it. Nothing is drawn without one. */
  plan?: StairheadPlan | null
}

export function Stairhead({ plan }: StairheadProps) {
  if (!plan) return null
  return <StairheadMeshes plan={plan} />
}

function StairheadMeshes({ plan }: { plan: StairheadPlan }) {
  const ashlar = useAshlarGeometry(plan)
  const { glass, frame } = useLanternGeometry(plan)
  const threshold = useThresholdGeometry(plan)

  return (
    <group>
      <mesh geometry={ashlar} castShadow receiveShadow>
        <meshStandardMaterial color={SAWN_ASHLAR} roughness={0.85} />
      </mesh>
      {/*
        Stainless, and the SAME stainless as the balustrade's posts and the
        opening guards: all of it is one campaign of visitor fit-out and it
        should read as one hand rather than as three different metals.
      */}
      <mesh geometry={frame} castShadow>
        <meshStandardMaterial color="#d5d7d6" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh geometry={threshold}>
        <meshStandardMaterial color="#c9ced3" metalness={0.85} roughness={0.28} />
      </mesh>
      {/*
        Darker and less clear than the balustrade's glass on purpose: in up/241,
        up/242 and up/243 the light reads as a grey sheet you cannot see the
        stair through, against a fence you can see the city through. That is a
        solar-control glass over a stair, which is what it would be.
      */}
      <mesh geometry={glass} castShadow>
        <meshPhysicalMaterial
          color="#8fa2ac"
          transparent
          opacity={0.55}
          roughness={0.08}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
