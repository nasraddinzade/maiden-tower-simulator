import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Colliders } from '../physics/lazyPhysics'
import { TREAD_OVERLAP_FRACTION, planFlight, stairTreadVertices } from '../../lib/staircase'
import {
  helicalGuardBoxes,
  radialGuardBox,
  sectorSlabBoxes,
  stairRampBoxes,
  type BoxSpec,
} from '../../lib/collision'
import {
  MODERN_SPIRAL,
  MODERN_SPIRAL_BAND_AT,
  MODERN_SPIRAL_GUARD_AT,
  MODERN_SPIRAL_LIFT,
  MODERN_SPIRAL_RAIL,
  MODERN_SPIRAL_TREADS,
  MODERN_SPIRAL_WALK_BAND,
  MODERN_SPIRAL_WELL_RADIUS,
} from '../../config/modern'

/** m — chequer plate is thin; this is a plate, not a stone block. */
const TREAD_PLATE = 0.012

/**
 * m — how far the walking-surface boxes hang below the treads.
 *
 * The masonry flights use 0.3 m, which is nothing there: a wall flight rises
 * about 0.9 m in the arc a walker occupies. This spiral climbs 2.25 m in a full
 * turn, so the flight passes right over your head, and a 0.3 m box under each
 * tread cuts the clear height to 1.95 m for a 1.75 m walker. Measured, the
 * capsule was clipping the underside of the run above with 0.29 m of itself and
 * the controller stopped moving. A plate-thin collider under a plate-thin tread.
 */
const COLLIDER_THICKNESS = 0.08

export interface ModernSpiralStairProps {
  visible: boolean
}

/**
 * The flight itself — planned once, from config alone, and shared by the stair
 * you can see and the stair you can stand on.
 *
 * Those two are separate components now (see ModernSpiralStairColliders), which
 * makes this the seam they must not drift across: the drawn tread and the ramp
 * box under it are the same helix or the walk is a lie about the model.
 */
function useSpiralPlan() {
  const steps = useMemo(() => {
    if (!MODERN_SPIRAL_LIFT) return []
    const width = MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius
    return planFlight({
      fromY: MODERN_SPIRAL_LIFT.fromY,
      toY: MODERN_SPIRAL_LIFT.toY,
      startAzimuthDeg: 0,
      // free-standing: the inner edge is the column, at every height
      innerRadiusAt: () => MODERN_SPIRAL.columnRadius,
      width,
      riserTarget: MODERN_SPIRAL.riser,
      goingTarget: MODERN_SPIRAL.going,
      winding: MODERN_SPIRAL.winding,
    })
  }, [])
  /**
   * The flight with the band and the guard read off at every nosing.
   *
   * ONE LIST, used by the walking surface AND by the wall beside it, so the two
   * can never disagree about where the edge of the stair is at a given height —
   * which is the whole design: the walker who is carried outward should arrive
   * at a rail with floor still under their feet, not at an edge.
   */
  const flight = useMemo(() => {
    if (steps.length < 2) return []
    const narrowest = MODERN_SPIRAL_WALK_BAND
    if (!narrowest) return []
    return steps.map((s) => {
      const band = MODERN_SPIRAL_BAND_AT(s.treadY) ?? narrowest
      const g = MODERN_SPIRAL_GUARD_AT(s.treadY)
      return {
        azimuthDeg: s.azimuthDeg,
        treadY: s.treadY,
        midRadius: band.midRadius,
        halfWidth: band.width / 2,
        ...(g ?? {}),
      }
    })
  }, [steps])

  return { steps, flight }
}

/**
 * The inserted steel spiral from the entry chamber up to storey 2.
 *
 * Laid out with the SAME planFlight() the masonry flights use — a helix is a
 * helix — with the inner edge pinned to the central tube instead of to the wall
 * face. Reusing it means this stair inherits every fix the stone one has had:
 * the tread winding, the tread block reaching down to the walking surface, and
 * the ramp-chain collider that the character controller can actually climb.
 *
 * Everything about its size comes from config/modern.ts, where each figure
 * carries how it was measured off the 2026 footage and how far it might be out.
 * The tread COUNT is not measured — no frame shows the whole flight — so it is
 * derived from the storey height and the measured riser, and moves by itself if
 * the storey height is ever corrected.
 */
export function ModernSpiralStair({ visible }: ModernSpiralStairProps) {
  const { steps } = useSpiralPlan()

  const treadGeometry = useMemo(() => {
    if (steps.length === 0) return null
    const width = MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius
    const { positions, indices } = stairTreadVertices(steps, width, () => TREAD_PLATE)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    const uv: number[] = []
    for (let i = 0; i < positions.length / 3; i++) uv.push(0, 0)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeBoundingSphere()
    return g
  }, [steps])

  useEffect(() => () => treadGeometry?.dispose(), [treadGeometry])

  /**
   * The balustrade as one mesh: a post on every tread's outer corner, the infill
   * between them, and the rail linking their heads.
   *
   * MODERN_SPIRAL.rodsPerTread has recorded three since the survey landed — «one
   * thicker post on each tread's outer corner, with two thinner infill rods
   * between consecutive posts», a direct count off four frames needing no scale
   * — and nothing read it. What got built was one post per tread and a single
   * tube over the top, leaving a 0.468 m gap between uprights: «кажется там
   * перила просто фасад прозрачный». It was, in both senses.
   *
   * Merged rather than drawn as 66 cylinders, which is not tidiness: the draw
   * budget is 120 for the whole interior (config/perf.ts) and the balustrade
   * alone was spending 43 of it.
   */
  const balustradeGeometry = useMemo(() => {
    if (steps.length === 0) return null
    const parts: THREE.BufferGeometry[] = []
    const D = Math.PI / 180
    const at = (azimuthDeg: number, y: number, radius: number) => {
      const a = azimuthDeg * D
      return new THREE.Vector3(Math.sin(a) * radius, y, -Math.cos(a) * radius)
    }
    /** An upright tube standing on `bottom` and reaching `top`. */
    const upright = (azimuthDeg: number, bottom: number, top: number, radius: number) => {
      const h = top - bottom
      if (h <= 0) return
      const g = new THREE.CylinderGeometry(radius, radius, h, 8)
      const p = at(azimuthDeg, (bottom + top) / 2, MODERN_SPIRAL_RAIL.postRadius)
      g.translate(p.x, p.y, p.z)
      parts.push(g)
    }

    const railY = (s: (typeof steps)[number]) => s.treadY + MODERN_SPIRAL.guardHeight
    for (const s of steps) upright(s.azimuthDeg, s.treadY, railY(s), MODERN_SPIRAL.rodRadius)

    for (let i = 0; i < steps.length - 1; i++) {
      const a = steps[i]
      const b = steps[i + 1]
      // the infill: rodsPerTread counts the post and the rods between it and the
      // next, so the gaps are that many and the rods one fewer
      for (let k = 1; k < MODERN_SPIRAL.rodsPerTread; k++) {
        const t = k / MODERN_SPIRAL.rodsPerTread
        const az = a.azimuthDeg + (b.azimuthDeg - a.azimuthDeg) * t
        // the treads are level plates centred on their own nosings, so an infill
        // rod stands on whichever plate it is over, not on the sloping mean
        const foot = t < 0.5 ? a.treadY : b.treadY
        upright(az, foot, railY(a) + (railY(b) - railY(a)) * t, MODERN_SPIRAL.infillRodRadius)
      }

      const ha = at(a.azimuthDeg, railY(a), MODERN_SPIRAL_RAIL.postRadius)
      const hb = at(b.azimuthDeg, railY(b), MODERN_SPIRAL_RAIL.postRadius)
      const dir = hb.clone().sub(ha)
      const g = new THREE.CylinderGeometry(
        MODERN_SPIRAL.rodRadius,
        MODERN_SPIRAL.rodRadius,
        dir.length(),
        8,
      )
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      )
      g.applyQuaternion(q)
      const mid = ha.clone().add(hb).multiplyScalar(0.5)
      g.translate(mid.x, mid.y, mid.z)
      parts.push(g)
    }

    if (parts.length === 0) return null
    const merged = mergeGeometries(parts, false)
    for (const g of parts) g.dispose()
    return merged
  }, [steps])

  useEffect(() => () => balustradeGeometry?.dispose(), [balustradeGeometry])

  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#3a3a3e', roughness: 0.55, metalness: 0.75 }),
    [],
  )
  const bright = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.3, metalness: 0.9 }),
    [],
  )
  useEffect(
    () => () => {
      steel.dispose()
      bright.dispose()
    },
    [steel, bright],
  )

  if (steps.length === 0 || !MODERN_SPIRAL_LIFT) return null
  if (!visible) return null

  const rise = MODERN_SPIRAL_LIFT.toY - MODERN_SPIRAL_LIFT.fromY
  const newelHeight = rise + 0.3

  return (
    <group>
      {treadGeometry && <mesh geometry={treadGeometry} material={steel} castShadow receiveShadow />}

      {/* the central tube, running the full rise plus a little into each floor */}
      <mesh material={bright} position={[0, MODERN_SPIRAL_LIFT.fromY + rise / 2, 0]} castShadow>
        <cylinderGeometry
          args={[MODERN_SPIRAL.columnRadius, MODERN_SPIRAL.columnRadius, newelHeight, 16]}
        />
      </mesh>

      {balustradeGeometry && <mesh geometry={balustradeGeometry} material={bright} castShadow />}
    </group>
  )
}

/**
 * The spiral as something to climb, in a component of its own because it belongs
 * in a different part of the tree: collision lives inside <Physics>, which is
 * mounted only for a walk and which rebuilds everything under it when it
 * appears. The drawn steel must not be rebuilt because somebody pressed a
 * button, so it stays above.
 *
 * Same ramp chain as the masonry flights, and for the same reason: this
 * character controller will not climb a vertical face, so a box per tread makes
 * the stair unclimbable however correct it looks.
 */
export function ModernSpiralStairColliders() {
  const { steps, flight } = useSpiralPlan()

  const ramp = useMemo(() => {
    if (steps.length < 2) return []
    /*
     * THE WALKING LINE IS THE WELL'S, NOT THE TREAD'S — AND IT IS NO LONGER
     * THE SAME LINE ALL THE WAY UP.
     *
     * MODERN_SPIRAL_WALK_BAND is where a body fits between the newel and the
     * rim of the hole this flight rises through, and it still bounds the top of
     * the climb exactly as it did. MODERN_SPIRAL_BAND_AT adds the term that
     * argument left out: the rim is 0.3 m of stone at the head of a 3.78 m
     * flight, and a walker whose head is two metres below the soffit is not
     * near it. Below that the band ends at the BALUSTRADE instead, so there is
     * collider under the walker's feet the whole way out to the rail they can
     * lean on. Null means the survey says a walker does not fit through the
     * well at all, and the honest collider for that is none.
     */
    const narrowest = MODERN_SPIRAL_WALK_BAND
    if (!narrowest) return []
    const width = MODERN_SPIRAL.outerRadius - MODERN_SPIRAL.columnRadius
    const first = steps[0]
    /*
     * A ramp up to the bottom tread, exactly as the masonry flights get.
     *
     * Free-standing or not, the first tread is a riser above the chamber floor
     * and this character controller will not climb a vertical face of any
     * height — measured, it refused a 0.20 m one with autostep set to 0.60 m. So
     * without this the stair is decoration: you can walk round it and never get
     * on it. The ramp runs radially OUTWARD from the flight into the room, since
     * for a free-standing stair the room is outside it, not inside.
     */
    /*
     * ACROSS THE WHOLE BOTTOM TREAD, not on one line of it.
     *
     * One ramp at the first tread's own azimuth is a needle: walked, the visitor
     * crossing the chamber missed it, circled the stair at floor level and never
     * got on — I took that for a broken stair before noticing it was a broken
     * approach. On the real thing you step onto the bottom step anywhere along
     * its open edge, so the ramps are spread across that edge and one step-angle
     * either side of it, which is about the width of a doorway.
     *
     * They still all rise to the FIRST tread. The ones beyond its wedge sit under
     * the treads above and are simply buried — a ramp under stone costs nothing,
     * and pretending otherwise would mean a separate approach per tread, which is
     * a spiral staircase with a ramp round it.
     */
    const floorY = MODERN_SPIRAL_LIFT ? MODERN_SPIRAL_LIFT.fromY : 0
    const stepAngle = steps.length > 1 ? steps[1].azimuthDeg - steps[0].azimuthDeg : 30
    const footBand = MODERN_SPIRAL_BAND_AT(first.treadY) ?? narrowest
    const approaches = [-1, -0.5, 0, 0.5, 1].map((k) => [
      {
        azimuthDeg: first.azimuthDeg + stepAngle * k,
        treadY: floorY,
        midRadius: MODERN_SPIRAL.outerRadius + 0.5,
      },
      {
        azimuthDeg: first.azimuthDeg + stepAngle * k,
        treadY: first.treadY,
        // onto the WALKING LINE AT THE FOOT, not onto the tread's middle and no
        // longer onto the whole flight's narrowest line either: the approach
        // exists to put the walker where the flight is collided, and down here
        // that band runs out to the balustrade
        midRadius: footBand.midRadius,
      },
    ])
    /*
     * STILL ONE BOX PER TREAD, and that was checked rather than assumed.
     *
     * A chain of yawed boxes cannot follow a helix without leaving a ridge at
     * every joint — the tops meet on the walking line and diverge away from it,
     * a shallow V measured at 0.020 m deep at the band's edge — and the obvious
     * reading of the owner's «обваливаешься» is that the ridge sheds the
     * capsule sideways. It does not. Cut four ways per tread the outward
     * deflection was unchanged to three decimal places, and widening the boxes
     * to the full drawn tread left it unchanged too: 0.278 against 0.284 of
     * their own length at r 0.46. The deflection is the pitch and the capsule,
     * not the chain, and the thing that actually made it fatal was the
     * controller welding itself to whatever it met — see PLAYER.normalNudgeFactor.
     * So the chain stays as coarse as it was, and 84 colliders were not spent on
     * a theory the walk refused.
     */
    return [
      ...stairRampBoxes(flight, narrowest.width, 1, COLLIDER_THICKNESS),
      ...approaches.flatMap((a) => stairRampBoxes(a, width, 1, COLLIDER_THICKNESS)),
    ]
  }, [steps, flight])


  /**
   * THE HEAD OF THE FLIGHT: a landing that is a floor, and a stop past it.
   *
   * The owner: «последние ступени неудобно на ярус выходят.» Walked before it
   * was touched: the ramp chain ends AT the last nosing while the drawn tread
   * runs half a wedge further, so the walker overran the end of the collider by
   * 0.09 m onto drawn steel with nothing under it, lost the ground and fell back
   * into the flight's own well — seven treads down, four times over, the stair
   * feeding him back into itself. Outward there was a 0.32 m annulus of nothing
   * between the band's edge at 0.580 and the storey's slab at 0.900, and getting
   * out meant turning inside a single tread: 0.17 seconds of walking.
   *
   * The top tread is the ONE tread in this flight that lands on a floor level,
   * and therefore the one tread whose full drawn width a body may occupy: its
   * feet are on storey 2's floor, so its shoulders are above the slab and the
   * rim it has been dodging the whole way up is behind it. So that wedge is
   * collided as it is DRAWN — newel to 1.1 m, out past the well's edge at 0.9,
   * flush at floorY with the storey's own slab. Nothing new is drawn: this is
   * the chequer-plate landing MODERN_SPIRAL has described since the survey
   * landed, meeting the stone in one level, exactly as up/036 shows it.
   *
   * And the run is closed at its head, on approachGuardBoxes' argument: past the
   * landing the model has a well it should not have — the flight is wider than
   * its own hole — and a walker who does not turn should meet a rail, not 3.78 m
   * of air. It stops at the well's edge so the room beyond stays open.
   */
  const head = useMemo<BoxSpec[]>(() => {
    if (steps.length < 2 || !MODERN_SPIRAL_LIFT) return []
    const last = steps[steps.length - 1]
    const sign = Math.sign(steps[1].azimuthDeg - steps[0].azimuthDeg) || 1
    // the drawn tread's forward half-wedge: stairTreadVertices centres each
    // plate on its own nosing and stretches it by TREAD_OVERLAP_FRACTION
    const halfSpanDeg = (last.angularWidthDeg / 2) * (1 + TREAD_OVERLAP_FRACTION)
    const endDeg = last.azimuthDeg + sign * halfSpanDeg
    const band = MODERN_SPIRAL_BAND_AT(last.treadY)
    return [
      ...sectorSlabBoxes({
        centreAzimuthDeg: last.azimuthDeg + (sign * halfSpanDeg) / 2,
        widthDeg: halfSpanDeg,
        innerRadius: MODERN_SPIRAL.columnRadius,
        outerRadius: MODERN_SPIRAL.outerRadius,
        surfaceY: last.treadY,
        thickness: COLLIDER_THICKNESS,
        sectors: 3,
      }),
      /*
       * And the plate BEHIND the last nosing, outboard of the ramp chain only.
       *
       * The drawn tread is a level plate centred on its own nosing, so half of
       * it lies back over the arriving flight, where the ramp is still climbing
       * the last 0.086 m to the floor. Collided at full width it would put a
       * step up in the walker's path; left out altogether it was a 0.32 m
       * annulus of drawn steel with nothing under it, and the walk that found
       * this ended there — feet on the floor's level at r 0.817, resting on the
       * slab's inner corner, unable to go on. So it is carried from the band's
       * outer edge outward: past where a body walks, up to the drawn edge, and
       * flush with the storey's slab at 0.900.
       */
      ...sectorSlabBoxes({
        centreAzimuthDeg: last.azimuthDeg - (sign * halfSpanDeg) / 2,
        widthDeg: halfSpanDeg,
        innerRadius: band ? band.outerRadius : MODERN_SPIRAL_WELL_RADIUS,
        outerRadius: MODERN_SPIRAL.outerRadius,
        surfaceY: last.treadY,
        thickness: COLLIDER_THICKNESS,
        sectors: 3,
      }),
      ...radialGuardBox({
        azimuthDeg: endDeg,
        innerRadius: MODERN_SPIRAL.columnRadius,
        // stops at the well's edge: outboard of that is storey 2's own floor,
        // which a visitor must be able to walk along
        outerRadius: MODERN_SPIRAL_WELL_RADIUS,
        floorY: last.treadY,
        height: MODERN_SPIRAL.guardHeight,
      }),
    ]
  }, [steps])

  /**
   * THE BALUSTRADE'S COLLIDERS — and which chords get one.
   *
   * The first is skipped: that is where the approach ramps deliver a visitor
   * onto the flight, and a guard across it would seal the only way on.
   *
   * The last is skipped too, and for the conflict this whole stair is built
   * over. The flight is Ø 2.2 m and its well Ø 1.8 m, so at the top the drawn
   * rail stands OUTSIDE the floor the flight arrives on — 1.06 m against a slab
   * that begins at 0.90. A collider there is not a handrail, it is a fence
   * between the landing and the room, which is exactly the objection
   * GUARDED_OPENINGS raises against ringing this well. Nothing is lost by
   * leaving it out: on those treads the walker's shoulders are inside the slab
   * band, so the rim already stops them at 0.580, well short of the rail.
   *
   * The upper chords that DO get one are the incidental gain. Their posts stand
   * through storey 2's floor — drawn that way, because the stair is wider than
   * the hole — so from the storey they are a guard round two fifths of the well
   * head, built from what the model already draws rather than invented for the
   * purpose.
   */
  const guard = useMemo<BoxSpec[]>(
    () =>
      flight.length < 3
        ? []
        : helicalGuardBoxes({
            steps: flight,
            innerRadius: MODERN_SPIRAL_RAIL.faceRadius,
            height: MODERN_SPIRAL.guardHeight,
            fromChord: 1,
            toChord: flight.length - 3,
          }),
    [flight],
  )

  if (steps.length === 0 || !MODERN_SPIRAL_LIFT) return null
  if (ramp.length === 0 && guard.length === 0 && head.length === 0) return null

  const rise = MODERN_SPIRAL_LIFT.toY - MODERN_SPIRAL_LIFT.fromY
  const newelHeight = rise + 0.3

  return (
    <Colliders
      keyPrefix="spiral"
      boxes={[...ramp, ...guard, ...head]}
      /*
        THE NEWEL, which was drawn and carried nothing.
        throughOpeningWalkBand says so in as many words, and the walk proved what
        it costs: aimed inward off the band a capsule passed clean through the
        115 mm tube — measured at r 0.061 against a column of 0.0575 — and fell
        down the middle of the stair. It is a steel column; you can put a hand on
        it.
      */
      cylinders={[
        {
          halfHeight: newelHeight / 2,
          radius: MODERN_SPIRAL.columnRadius,
          position: [0, MODERN_SPIRAL_LIFT.fromY + rise / 2, 0],
        },
      ]}
    />
  )
}


/** Treads the flight ends up with, for the budget readout and for tests. */
export const MODERN_SPIRAL_STEP_COUNT = MODERN_SPIRAL_TREADS
