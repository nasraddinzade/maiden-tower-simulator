import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import {
  BALUSTRADE,
  ENTRANCE,
  FLOORS,
  ROOF,
  STAIRHEAD,
  TOWER,
  innerRadiusAt,
} from '../../config/tower'
import { GUARDED_OPENINGS, OPENING_GUARD } from '../../config/modern'
import {
  doorwayRevealBoxes,
  floorColliders,
  guardRingBoxes,
  stairPassageBandsAt,
  wallColliders,
  type BoxSpec,
} from '../../lib/collision'
import { drawnClearWidth } from '../../lib/doorwayArch'
import type { PassageSection, StairDoorway } from '../../lib/staircase'
import {
  STAIRHEAD_ARC_DEG,
  stairheadColliders,
  type Stairhead,
} from '../../lib/stairhead'
import type { StairwellCut } from './FloorStructures'

export interface TowerCollidersProps {
  /** The stair passage, so the wall is not built across it. */
  stairPassage?: PassageSection[][]
  /** Openings the stair needs through each floor slab. */
  stairwells?: Array<StairwellCut | undefined>
  /** Arched doorways between the rooms and the stair passage. */
  doorways?: StairDoorway[]
  /**
   * The head-house over the roof stairwell. Two walls and a roof, and the roof
   * is the one that matters: the deck's collider has a HOLE over the whole
   * opening, so without it the far end of the wedge is a knife edge in the
   * paving with nothing standing on it.
   */
  stairhead?: Stairhead | null
  /*
   * There used to be an `embrasures` prop here — the stepped recesses at the high
   * windows, which are cut out of the SHELL as chases and so needed the wall
   * boxes opened for them. There are no chamber openings to recess into since
   * [OWNER] 2026-08-10, the layer is gone, and this component got simpler rather
   * than being taught a new case.
   *
   * A slit at the end of a stair passage needs nothing here either: the void is
   * already the passage, whose own boxes stop at the outer cheek, and the reveal
   * beyond that is masonry the walker must not enter.
   */
  /** Boxes around the circumference. The addendum asks for 24–32 per storey. */
  sectors?: number
  onCount?: (n: number) => void
}

/**
 * Every static collider in the tower, built from cuboids.
 *
 * Replaces the trimesh colliders that used to hang off the CSG shell and the
 * lathe floor slabs. Two reasons, and both matter:
 *
 *  - docs/optimization-addendum.md, Phases 4 and 6: collision geometry must be
 *    primitives, separate from the visual mesh.
 *  - the CSG result is not watertight, and rapier's trimesh contacts off a
 *    non-watertight mesh are unreliable — which is exactly the wall-tunnelling
 *    that made the model look walkable when the stair was still entombed.
 *
 * The shapes themselves come from lib/collision.ts, which is pure and tested.
 */
export function TowerColliders({
  stairPassage,
  stairwells,
  doorways,
  stairhead,
  sectors = 32,
  onCount,
}: TowerCollidersProps) {
  const boxes = useMemo(() => {
    /*
     * TAGGED WITH THE FLIGHT THEY BELONG TO, and flattened only after that.
     *
     * See passageAt: two flights' passages at one azimuth must never be merged
     * into one opening, and once the arrays are flattened there is nothing left
     * to tell them apart by.
     */
    const sections = (stairPassage ?? []).flatMap((tube, flight) =>
      tube.map((s) => ({ ...s, flight })),
    )

    const sectorDeg = 360 / sectors
    const passageAt = (azimuthDeg: number) => stairPassageBandsAt(sections, azimuthDeg, sectorDeg)

    /*
     * One band per storey, AND THE DRUM STOPS AT THE PAVING.
     *
     * The wall these bands describe runs from a room face to the drum, and it
     * only does that as far up as ROOF.masonryTopY. Above that there is no room
     * and no room face: the terrace crosses the whole thickness and the only
     * stone left is the parapet ring, which is raised separately below.
     *
     * It used to run to TOWER.topY, and while the "parapet" was the entire
     * 3.733 m wall top that was right. Left that way after the terrace was cut it
     * would fill the deck back in with a band of masonry from the old room face
     * out to the drum, 0.75 m high, right round the circuit — you would arrive at
     * the stair mouth and be unable to step off it.
     */
    const bands = [ENTRANCE.groundY - 0.5, ...FLOORS.map((f) => f.floorY), ROOF.masonryTopY]
      .filter((y, i, a) => a.indexOf(y) === i)
      .sort((a, b) => a - b)

    const walls = wallColliders({
      sectors,
      outerRadius: TOWER.outerRadius,
      innerRadiusAt,
      // down to the plinth, so the wall is solid where it meets the street and a
      // walker outside cannot step into the tower's base
      baseY: ENTRANCE.groundY - 0.5,
      // the underside of the terrace paving, not the coping — see the bands above
      topY: ROOF.masonryTopY,
      bandBoundaries: bands,
      entrance: {
        azimuthDeg: ENTRANCE.azimuthDeg,
        // arc the opening subtends at the outer face
        widthDeg: (ENTRANCE.width / TOWER.outerRadius) * (180 / Math.PI),
        sillY: ENTRANCE.thresholdY,
        headY: ENTRANCE.thresholdY + ENTRANCE.height,
      },
      openings: [
        ...(doorways ?? []).map((d) => ({
          azimuthDeg: d.azimuthDeg,
          widthDeg: d.widthDeg,
          sillY: d.bottomY,
          headY: d.topY,
          // the width the SHELL is cut to, so no neighbouring box may lean into
          // the drawn opening — see lib/collision.ts → slideOffOpenings
          clearWidth: drawnClearWidth(d.outerRadius, d.widthDeg),
          rake: d.bottomRake,
        })),
      ],
      passageAt,
    })

    /*
     * THE STONE ROUND EACH DOORWAY, which wallColliders() cannot put back.
     *
     * It opens a sector WHOLE wherever a doorway touches it and opens it SQUARE
     * from sill to head — both on purpose, because a walled-up doorway is the
     * worse failure and this model has had several. The cost is that the drawn
     * jambs and the whole haunch of the arch stand in nothing: measured on the
     * shipped configuration, up to 0.480 m of jamb beside an opening 1.25 m
     * wide. That is the stone the owner walks through, and it is the same hole
     * the cupola's skirt used to hang across while nothing stopped him.
     *
     * The reveal is laid on the DRAWN opening's own faces, so it can only ever
     * add stone the shell already shows. Its outer limit is the passage's inner
     * cheek where the passage crosses — a box past that would stand on the
     * stair.
     */
    const reveals: BoxSpec[] = (doorways ?? []).flatMap((d) => {
      const bands = passageAt(d.azimuthDeg).filter(
        (b) => b.topY > d.bottomY && b.bottomY < d.topY,
      )
      const cheek = bands.length ? Math.min(...bands.map((b) => b.innerRadius)) : TOWER.outerRadius
      return doorwayRevealBoxes({
        azimuthDeg: d.azimuthDeg,
        // the width the SHELL is cut to, not STAIR.doorwayWidth — see
        // lib/doorwayArch.ts → drawnClearWidth for why the two differ
        clearWidth: drawnClearWidth(d.outerRadius, d.widthDeg),
        sillY: d.bottomY,
        headY: d.topY,
        bottomRake: d.bottomRake,
        innerRadiusAt,
        outerRadius: Math.min(cheek, TOWER.outerRadius),
        sectors,
      })
    })

    const floors: BoxSpec[] = []
    FLOORS.forEach((f, i) => {
      const cut = stairwells?.[i]
      floors.push(
        ...floorColliders({
          sectors: Math.min(sectors, 24),
          floorY: f.floorY,
          thickness: TOWER.floorSlab,
          /*
           * The hole in THIS floor is cut by the vault BELOW it, not by this
           * storey's own vault — which is usually closed. Reading f.oculusRadius
           * made storey 2's slab solid in the physics world while the model drew
           * an opening in it, and the walker climbing the steel spiral hit the
           * underside at 3.50 m standing well inside the opening's radius.
           * Storey 1 rests on the rock and has nothing beneath it to pierce it.
           */
          oculusRadius: FLOORS[i - 1]?.oculusRadius ?? 0,
          outerRadius: f.innerRadiusAtLevel,
          stairwell: cut
            ? {
                centreAzimuthDeg: cut.centreAzimuthDeg,
                widthDeg: cut.widthDeg,
                innerRadius: cut.innerRadius,
              }
            : undefined,
        }),
      )
    })

    /*
     * THE ROOF DECK, which is walked on and was not carried.
     *
     * The last lift climbs from storey 8 to `TOP_OF_FLOORS` — the level
     * config/tower.ts hands the 8→roof lift as its toY, and ROOF.deckY. FLOORS
     * stops at storey 8, so the loop above emits nothing here, and the parapet
     * band is a vertical ring of wall boxes, which holds a walker in but does not
     * hold one up. Without this the walker arrived at the head of the last flight
     * with nothing underfoot and fell 3.28 m to storey 8.
     *
     * IT NOW REACHES THE PARAPET. It used to stop at innerRadiusAt(deckY), the
     * old room face, because that is where the drawn deck stopped; the wall above
     * was one solid 3.733 m ring and there was nothing out there to stand on. The
     * terrace crosses the whole wall (roof/016), so the collider does too — out
     * to ROOF.deckOuterRadius, where the parapet band's inner face begins.
     *
     * AND IT HAS A HOLE IN IT, which no storey slab's deck ever needed: the stair
     * comes up through the paving, so the well is a hole with 1.7 m of deck
     * outboard of it rather than a bite out of an outer lip. That is what
     * stairwell.outerRadius is for.
     *
     * FLUSH, never proud. floorColliders() hangs its boxes BELOW floorY, so the
     * surface lands exactly on the level the last tread and the head landing sit
     * at, and the walker steps off the landing onto it. A deck a centimetre
     * higher would be a lip, and this controller will not climb a lip of any
     * height — measured, it refused 0.20 m with autostep at 0.60.
     */
    const deckWell = stairwells?.[FLOORS.length]
    floors.push(
      ...floorColliders({
        sectors: Math.min(sectors, 24),
        floorY: ROOF.deckY,
        thickness: ROOF.pavingDepth,
        // the same rule the storeys follow: the hole in a surface is cut by the
        // vault BELOW it. Storey 8's vault is closed, so the deck is unbroken
        // except where the stair comes through it.
        oculusRadius: FLOORS[FLOORS.length - 1].oculusRadius,
        outerRadius: ROOF.deckOuterRadius,
        stairwell: deckWell
          ? {
              centreAzimuthDeg: deckWell.centreAzimuthDeg,
              widthDeg: deckWell.widthDeg,
              innerRadius: deckWell.innerRadius,
              outerRadius: deckWell.outerRadius,
            }
          : undefined,
      }),
    )

    /*
     * THE GLASS GUARDS round the floor openings.
     *
     * floorColliders() cuts each pierced slab back to the opening radius and
     * stops there, which is correct — dropping through an oculus should land you
     * on the floor below, and that is what an oculus is. What was missing is the
     * thing standing at that edge. config/tower.ts's OPENINGS diameters were
     * MEASURED against a frameless glass guard, so the guard is documented in
     * the same sentence as the holes; the model drew the holes and not the
     * guard, leaving two unfenced drops of 1.4 and 2.4 m across in surfaces the
     * walker crosses on the way up.
     *
     * Which openings get one, and why storey 2's does not, is argued out in
     * GUARDED_OPENINGS. The rings are built here rather than in
     * FloorStructures for the reason at the top of that file: structure is
     * drawn, collision is primitives, and the two never come off one mesh.
     */
    const guards: BoxSpec[] = []
    /*
     * THE PARAPET, raised as its own ring rather than as the drum's top band.
     *
     * It is one ring of masonry 0.75 m thick standing on ROOF.masonryTopY, and
     * it could have been the last band of wallColliders — except that
     * wallColliders takes the taper of the inner face across each band and lays
     * its boxes on that cone. The inner face here does not taper, it JUMPS: the
     * room face at the storey-8 band's top is r 4.52 and the parapet's inner face
     * is 7.50, three metres out in no height at all. Fed that as one function the
     * band came out tilted 46° and the wall of the top storey leaned into the
     * room. A step is not a taper, so it is not given to something that
     * interpolates.
     *
     * Full height of the stone, masonryTopY to the coping, which shows 0.751 m
     * above the paving — the measured parapet — with the paving course buried
     * behind the rest.
     */
    guards.push(
      ...guardRingBoxes({
        sectors,
        openingRadius: ROOF.deckOuterRadius,
        floorY: ROOF.masonryTopY,
        height: TOWER.topY - ROOF.masonryTopY,
        thickness: ROOF.parapetThickness,
        kind: 'wall',
      }),
    )
    /*
     * THE BALUSTRADE, on the same principle as the opening guards: you can put a
     * hand on it, so it is not a diagram.
     *
     * It is not redundant against the parapet's own boxes even though it stands
     * on the parapet's inner face. The parapet stops at TOWER.topY, 0.75 m over
     * the deck — low enough to lean out over, which on a terrace 27 m up is
     * exactly what the glass is there to stop and what its own "SÖYKƏNMƏYİN /
     * DON'T LEAN" plate says. Without this the walker leans through 0.28 m of
     * glass and stands with their head out over the city.
     */
    guards.push(
      ...guardRingBoxes({
        sectors: Math.min(sectors, 32),
        openingRadius: BALUSTRADE.glassRadius - BALUSTRADE.glassThickness / 2,
        floorY: ROOF.deckY,
        height: BALUSTRADE.glassTop,
      }),
    )
    for (const g of GUARDED_OPENINGS) {
      guards.push(
        ...guardRingBoxes({
          // a 1.2 m ring does not need the drum's 32: at 16 the chord is 0.23 m
          // and the corners stand 0.02 m proud of the circle, against a 0.3 m
          // capsule. Still taken off `sectors` so it can never exceed the drum's.
          sectors: Math.min(sectors, 16),
          openingRadius: g.radius,
          floorY: g.floorY,
          height: OPENING_GUARD.height,
        }),
      )
    }

    /*
     * THE HEAD-HOUSE, and it is not decoration on the collider side.
     *
     * `sectors` is not offered to it. Every other ring here is described at the
     * drum's own 32 because a chord that far out is short; this thing is a wedge
     * 2.3 m tall over 70° of arc, and at 11.25° a piece the raking roof would
     * step 0.37 m at every joint — a staircase of ledges over the stair. It gets
     * the paving's own angular step, which is also the step the drawn wedge is
     * swept at, so what you can touch and what you can see are one shape.
     */
    const head: BoxSpec[] = stairhead
      ? stairheadColliders(stairhead, STAIRHEAD, STAIRHEAD_ARC_DEG)
      : []

    return [...walls, ...reveals, ...floors, ...guards, ...head]
  }, [stairPassage, stairwells, doorways, stairhead, sectors])

  onCount?.(boxes.length)

  return (
    <RigidBody type="fixed" colliders={false}>
      {boxes.map((b, i) => (
        <CuboidCollider
          key={`${b.kind}-${i}`}
          args={b.halfExtents}
          position={b.position}
          quaternion={b.quaternion}
        />
      ))}
    </RigidBody>
  )
}
