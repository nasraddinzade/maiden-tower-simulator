import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Colliders } from '../physics/lazyPhysics'
import {
  PASSAGE_SIDE_CLEARANCE,
  flightRiser,
  landingPaving,
  planAllFlights,
  stairApproaches,
  stairPassageSections,
  stairTreadVertices,
  treadDepth,
  type StepPlacement,
  type Winding,
} from '../../lib/staircase'
import { stairRampBoxes } from '../../lib/collision'
import { ROOF, STAIR, WALL_LIFTS, innerRadiusAt, stairSettings } from '../../config/tower'
import { PLAYER } from '../../config/player'

export interface StaircaseProps {
  winding: Winding
  riserTarget: number
  goingTarget: number
  width: number
  wallClearance: number
  startAzimuthDeg: number
  /** Draw the steps. */
  visible: boolean
  /** Procedural limestone from Phase 7. */
  material?: THREE.Material
}

/**
 * Everything the flights are planned from — the drawn stair and the collided one
 * take the same numbers, and taking them from one type is what keeps the two
 * from drifting apart when a leva slider moves.
 */
export type StairPlan = Pick<
  StaircaseProps,
  'winding' | 'riserTarget' | 'goingTarget' | 'width' | 'wallClearance' | 'startAzimuthDeg'
>

interface PlacedStep extends StepPlacement {
  /** Radial thickness of the tread block. */
  radialWidth: number
  /** Vertical thickness of the tread block. */
  thickness: number
}

/**
 * Lay out every flight, one per storey gap. The flight's inner edge follows the
 * inner wall face, which widens with height, so upper flights sit slightly
 * further out — exactly as the tapering masonry requires.
 */
function useFlights(p: StairPlan): PlacedStep[] {
  return useMemo(() => {
    const flights = planAllFlights(
      stairSettings({
        winding: p.winding,
        riserTarget: p.riserTarget,
        goingTarget: p.goingTarget,
        width: p.width,
        wallClearance: p.wallClearance,
        startAzimuthDeg: p.startAzimuthDeg,
      }),
      WALL_LIFTS,
      innerRadiusAt,
    )

    /*
     * The passage those flights are cut in, planned HERE rather than taken from
     * App, and for the same reason the flights are: this component draws the
     * stair, so the stone it lays has to come off the same arithmetic as the
     * steps it lays it beside. A tube handed in from elsewhere is a tube planned
     * from someone else's copy of the leva settings, and the paving would then be
     * one revision behind the treads it is flush with. See landingPaving().
     */
    const tubes = stairPassageSections(
      flights,
      p.width,
      PLAYER.stairHeadroom,
      innerRadiusAt,
      ROOF.masonryTopY,
      undefined,
      STAIR.doorwayWidth,
    )

    const out: PlacedStep[] = []
    // stairPassageSections() emits one tube per NON-EMPTY flight, so the tubes
    // are walked with their own counter rather than indexed by flight
    let t = 0
    flights.forEach((steps) => {
      if (steps.length === 0) return
      const tube = tubes[t++] ?? []
      /*
       * From the steps, not from rise / count: a flight with a landing has
       * treads that do not rise, and dividing by all of them gives a riser
       * smaller than any real one — which would cut the tread blocks thinner
       * than the drop to the passage floor and hollow the flight out again.
       */
      const riser = flightRiser(steps)
      /*
       * The treads, AND the paving that carries each landing's floor on to the
       * end of its passage. Without the second the floor beside every stair
       * doorway is in two pieces at two levels — see landingPaving() for the
       * raycast and for the owner's two reports of it. Same thickness, because a
       * landing slab has the same stone under it as a tread and for the same
       * reason: bedded, not laid on.
       */
      for (const s of [...steps, ...landingPaving(steps, tube)]) {
        out.push({
          ...s,
          radialWidth: p.width,
          // down to the floor of the passage cut — see treadDepth()
          thickness: treadDepth(riser),
        })
      }
    })
    return out
  }, [p.startAzimuthDeg, p.width, p.riserTarget, p.goingTarget, p.winding, p.wallClearance])
}

/**
 * The invisible surface the walker actually stands on: inclined cuboids along
 * the walking line, one per couple of steps (docs/optimization-addendum.md).
 *
 * A trimesh strip was tried first and FAILED SILENTLY: the mesh carrying it was
 * `visible={false}`, and @react-three/rapier skips invisible meshes when
 * auto-generating colliders, so the physics world simply never contained the
 * stair. Climbing appeared to work anyway because the walker was riding the
 * floor of the passage cut in the shell's trimesh collider — and the moment
 * that trimesh was replaced with primitive boxes, the stair stopped holding
 * anyone. Explicit CuboidColliders cannot vanish that way.
 *
 * ONE CHAIN PER FLIGHT, and no longer one for the whole stair.
 *
 * It used to be one, on the reasoning that the helix is continuous and per-flight
 * chains would leave a hole at every landing. The tower is not built that way:
 * except for 4→6, no flight runs past a storey — you leave the passage, cross the
 * chamber and enter the next doorway. Flattening the flights into one chain
 * fabricated a ramp straight from the head of one flight to the foot of the next,
 * letting the walker skip the room the building makes you walk through.
 */
function useRampBoxes(p: StairPlan) {
  return useMemo(() => {
    const flights = planAllFlights(
      stairSettings({
        winding: p.winding,
        riserTarget: p.riserTarget,
        goingTarget: p.goingTarget,
        width: p.width,
        wallClearance: p.wallClearance,
        startAzimuthDeg: p.startAzimuthDeg,
      }),
      WALL_LIFTS,
      innerRadiusAt,
    )
    /*
     * The ramp chain covers the treads and nothing else, so on its own it starts
     * and ends in mid-air. The approaches are the ends — see stairApproaches().
     */
    const approaches = stairApproaches(
      flights,
      p.width,
      innerRadiusAt,
      (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
      WALL_LIFTS.map((l) => l.opensAtY),
      // the doorway's clear width, which sizes the landing the ramps stand on and
      // the doorway's own bearing along it. NOT p.width: the leva panel moves the
      // flight, and a landing planned off the flight's width would be a landing
      // the shell was never cut for. See passageLeadSteps().
      STAIR.doorwayWidth,
    )
    return [
      ...flights.flatMap((steps) => stairRampBoxes(steps, p.width)),
      // one box each — stepsPerBox is irrelevant on a two-point run
      ...approaches.flatMap((pair) => stairRampBoxes(pair, p.width)),
    ]
  }, [p.startAzimuthDeg, p.width, p.riserTarget, p.goingTarget, p.winding, p.wallClearance])
}

/**
 * Phase 4 — the stair in the wall thickness.
 *
 * The treads are annular sectors merged into ONE geometry — a single draw call,
 * and every tread meets the next exactly. Collision is the separate ramp chain.
 */
export function Staircase(props: StaircaseProps) {
  const steps = useFlights(props)

  const fallback = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#9c9484', roughness: 0.95 }),
    [],
  )
  const stoneMaterial = props.material ?? fallback

  const geometry = useMemo(() => {
    /*
     * The tread fills the passage's FULL width, side clearance included. The
     * clearance is there so the walking surface never fouls the passage wall,
     * but leaving the stone short of it opened a 6 cm slot down each side of
     * every step. A little of the block buried in the masonry costs nothing.
     */
    const { positions, indices } = stairTreadVertices(
      steps,
      props.width + 2 * PASSAGE_SIDE_CLEARANCE,
      (s) => (s as PlacedStep).thickness ?? 0.2,
    )
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    // the shared limestone material samples uv; without it three-bvh-csg and the
    // shader injection both complain
    const uv: number[] = []
    for (let i = 0; i < positions.length / 3; i++) uv.push(0, 0)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeBoundingSphere()
    return g
  }, [steps, props.width])

  useEffect(() => () => geometry.dispose(), [geometry])

  if (!props.visible) return null

  return (
    <group>
      <mesh geometry={geometry} material={stoneMaterial} castShadow receiveShadow />
    </group>
  )
}

/**
 * The same stair as something to stand on, and it is a SEPARATE COMPONENT
 * because it lives in a different part of the tree.
 *
 * Collision belongs inside <Physics>, which is mounted only for a walk and which
 * remounts everything under it when it appears; the drawn treads belong to the
 * model, which must not be rebuilt because somebody pressed a button. Both are
 * planned from the same StairPlan, so the thing you can see and the thing you
 * can stand on cannot come from different numbers.
 *
 * Collision is the inclined ramp chain, not the tread boxes. Per-tread cuboids
 * make a winder stair unclimbable for a capsule controller — it has to be lifted
 * over a riser at every step and grinds on the corner where two boxes meet. The
 * tread boxes stay purely visual.
 */
export function StaircaseColliders(plan: StairPlan) {
  const ramp = useRampBoxes(plan)
  if (ramp.length === 0) return null
  return <Colliders keyPrefix="stair" boxes={ramp} />
}
