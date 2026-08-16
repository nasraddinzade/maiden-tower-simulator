import { useMemo } from 'react'
import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { cupolaProfile, domeHeightAt, effectiveOpeningRadius } from '../../lib/cupola'
import { azimuthToVector } from '../../lib/geometry'
import { stairwellCutTools } from '../../lib/staircase'
import { FLOORS, ROOF, TOWER, innerRadiusAt } from '../../config/tower'
import { GUARDED_OPENINGS, OPENING_GUARD } from '../../config/modern'
import { MIN_LATHE_SEGMENTS, WALL_EMBED } from '../../lib/bedding'
import { isStoreyVisible, lodSegments } from '../../lib/visibility'

/** Where a flight breaks through the structure above, in plan. */
export interface StairwellCut {
  centreAzimuthDeg: number
  widthDeg: number
  innerRadius: number
  outerRadius: number
}

interface FloorStructuresProps {
  /** Oculus radius, shared by every storey (leva-tunable placeholder). */
  oculusRadius: number
  /** Rise of the shallow cupolas. */
  cupolaRise: number
  /** Render the cupolas. */
  showCupolas: boolean
  /** Render the annular floor slabs. */
  showFloors: boolean
  /**
   * Where each flight breaks through, keyed by the index of the storey the
   * flight LANDS on. Undefined entries leave that storey's structure intact.
   */
  stairwells?: Array<StairwellCut | undefined>
  /** Attach fixed colliders so the player can stand on the floors. */
  withColliders?: boolean
  /** Interior limestone from Phase 7. */
  material?: THREE.Material
  /** Phase-9 "Водосбор" layer: fade the floors so the vertical run reads. */
  xray?: boolean
  /** Storey the viewer is on; storeys far from it are dropped (Phase 11). */
  viewerStorey?: number
  /** Skip the storey window — used when inspecting the tower from outside. */
  showAllStoreys?: boolean
}

const RADIAL_SEGMENTS = 64
const PROFILE_SEGMENTS = 20
const DEG = Math.PI / 180

/*
 * WALL_EMBED — how far floors and domes are bedded into the wall — used to be
 * DECLARED here, as 0.25, "only deep enough that the join cannot show". It is
 * lib/bedding.ts's now and it is DERIVED, because the wall it is bedded into has
 * a stair passage cut through it and 0.25 was 0.16 m more stone than the passage
 * leaves. The whole argument is at the head of that file; MIN_LATHE_SEGMENTS
 * comes from the same place and for the same reason.
 *
 * Re-exported because RoofTerrace has always taken it from here and the paving's
 * junction with the parapet is a different junction from this one — eleven
 * metres out, with no stair anywhere near it. It borrows the depth; it is not
 * governed by the jamb. The day the terrace wants its own number, that is where
 * it goes, and this line is what will have to be deleted to give it one.
 */
export { WALL_EMBED } from '../../lib/bedding'

/**
 * Cut the stairwell out of a lathe surface.
 *
 * The opening is an annular sector — where the flight arrives, spanning the
 * flight's radial band — and what cuts it is a chain of boxes rather than one,
 * for the reason argued at stairwellCutTools(): a single box IS a fair sector
 * over 16° of arc and is not a sector at all over the 70° the roof opening
 * needs, where its flat inner face would stand a metre out at the ends and cut
 * the paving near the parapet while leaving the stair roofed. The shapes come
 * from lib/staircase.ts so the arithmetic sits in the tested half of the
 * codebase; this only turns them into boxes and subtracts them with the same
 * evaluator the shell uses.
 *
 * A CUTTER THAT CANNOT REACH THE STONE DOES NOTHING, and says so rather than
 * running. `maxRadius` is how far out the surface being cut actually goes, and
 * every storey's fell EXACTLY on the opening's inner radius: a slab was bedded
 * WALL_EMBED into the wall, the stair stands STAIR.wallClearance off the same
 * face, and those two were both 0.25 m. So the tool was tangent to the slab it
 * was handed and removed precisely nothing — six openings, six booleans
 * resolving a tangency for no result, which is the CSG case that has cost this
 * model a floor twice. Passing the radius retires them.
 *
 * THE EQUALITY THAT MADE IT A TANGENCY IS GONE (2026-08-16) and the early-out is
 * the better for it. WALL_EMBED is now the middle of the jamb the stair leaves —
 * 0.044 against the clearance's 0.250 — so the slab stops 0.206 m short of the
 * flight instead of just touching it. The tool still removes nothing, but now
 * because the opening is genuinely outside the slab rather than because two
 * numbers happened to be typed the same. See lib/bedding.ts.
 */
export function cutStairwell(
  geometry: THREE.BufferGeometry,
  cut: StairwellCut,
  yCentre: number,
  yHeight: number,
  /** Outer radius of the surface being cut. Past it the tool meets no stone. */
  maxRadius: number,
  /** Angular step of the lathe being cut, so the hole is as round as the stone. */
  segments = RADIAL_SEGMENTS,
): THREE.BufferGeometry {
  if (cut.innerRadius >= maxRadius) return geometry

  const tools = stairwellCutTools(
    cut.centreAzimuthDeg,
    cut.widthDeg,
    cut.innerRadius,
    cut.outerRadius,
    360 / segments,
  )
  if (tools.length === 0) return geometry

  const evaluator = new Evaluator()
  evaluator.useGroups = false
  let result = new Brush(geometry)
  for (const t of tools) {
    const dir = azimuthToVector(t.azimuthDeg)
    const tool = new THREE.BoxGeometry(t.radialDepth, yHeight, Math.max(0.2, t.tangentialWidth))
    tool.rotateY(-t.azimuthDeg * DEG + Math.PI / 2)
    tool.translate(dir.x * t.midRadius, yCentre, dir.z * t.midRadius)
    result = evaluator.evaluate(result, new Brush(tool), SUBTRACTION)
    tool.dispose()
  }
  return result.geometry.clone()
}

/**
 * One shallow cupola: the meridian profile revolved about the tower axis.
 * Positioned so the profile's y=0 sits at the springing level.
 */
function useCupolaGeometry(
  spanRadius: number,
  oculusRadius: number,
  rise: number,
  springY: number,
  cut: StairwellCut | undefined,
  segments = RADIAL_SEGMENTS,
  profileSegments = PROFILE_SEGMENTS,
) {
  return useMemo(() => {
    const safeOculus = effectiveOpeningRadius(oculusRadius, spanRadius)
    // the skirt is bedded to the SAME depth as the slabs — it is the same wall
    const pts = cupolaProfile(spanRadius, safeOculus, rise, profileSegments, WALL_EMBED).map(
      (p) => new THREE.Vector2(p.r, p.y),
    )
    // built in world Y so a stairwell cut can be expressed in world coordinates
    const geom = new THREE.LatheGeometry(pts, segments).translate(0, springY, 0)
    if (!cut) return geom
    // a dome reaches its springing and no further
    return cutStairwell(geom, cut, springY + rise / 2, rise * 3, spanRadius, segments)
  }, [spanRadius, oculusRadius, rise, springY, cut, segments, profileSegments])
}

/**
 * Annular floor slab: a rectangular cross-section revolved about the axis,
 * leaving the central opening clear so the oculi line up vertically.
 */
function useSlabGeometry(
  innerR: number,
  holeR: number,
  thickness: number,
  y: number,
  cut: StairwellCut | undefined,
  segments = RADIAL_SEGMENTS,
) {
  return useMemo(() => {
    const safeHole = effectiveOpeningRadius(holeR, innerR)
    // Bedded into the wall for the same reason as the cupola: a slab whose edge
    // only touches the tapering wall leaves a ring of daylight round the room.
    const outer = innerR + WALL_EMBED
    const pts = [
      new THREE.Vector2(safeHole, 0),
      new THREE.Vector2(outer, 0),
      new THREE.Vector2(outer, -thickness),
      new THREE.Vector2(safeHole, -thickness),
      new THREE.Vector2(safeHole, 0),
    ]
    const geom = new THREE.LatheGeometry(pts, segments).translate(0, y, 0)
    if (!cut) return geom
    return cutStairwell(geom, cut, y - thickness / 2, thickness * 3, outer, segments)
  }, [innerR, holeR, thickness, y, cut, segments])
}

/**
 * The masonry between a cupola's crown and the floor above.
 *
 * Every storey had a half-metre band here modelled by nothing at all: looking up
 * through the oculus you saw past the dome into an empty ring and out to the
 * bare shell. That band is the haunch a dome is buried in and the floor above is
 * carried on, and its inner face is the lining of the oculus shaft.
 */
function useCeilingFillGeometry(
  holeR: number,
  crownY: number,
  topY: number,
  segments = RADIAL_SEGMENTS,
) {
  return useMemo(() => {
    if (topY - crownY < 0.02) return null
    const outerAt = (y: number) => innerRadiusAt(y) + WALL_EMBED
    const hole = Math.max(0.05, holeR)
    const pts = [
      new THREE.Vector2(hole, crownY),
      new THREE.Vector2(outerAt(crownY), crownY),
      new THREE.Vector2(outerAt(topY), topY),
      new THREE.Vector2(hole, topY),
      new THREE.Vector2(hole, crownY),
    ]
    return new THREE.LatheGeometry(pts, segments)
  }, [holeR, crownY, topY, segments])
}

function CeilingFill({
  holeR,
  crownY,
  topY,
  cut,
  material,
  xray,
  segments,
}: {
  holeR: number
  crownY: number
  topY: number
  cut: StairwellCut | undefined
  material?: THREE.Material
  xray?: boolean
  segments?: number
}) {
  const base = useCeilingFillGeometry(holeR, crownY, topY, segments)
  const geometry = useMemo(() => {
    if (!base) return null
    if (!cut) return base
    // the fill is bedded into the wall like a slab, and widens as the wall thins
    return cutStairwell(
      base,
      cut,
      (crownY + topY) / 2,
      (topY - crownY) * 3,
      innerRadiusAt(topY) + WALL_EMBED,
      segments,
    )
  }, [base, cut, crownY, topY, segments])
  if (!geometry) return null
  if (material) return <mesh geometry={geometry} material={material} receiveShadow />
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={xray ? '#aab4c0' : '#a89f8c'}
        side={THREE.DoubleSide}
        roughness={0.95}
        transparent={xray}
        opacity={xray ? 0.12 : 1}
        depthWrite={!xray}
      />
    </mesh>
  )
}

function Cupola({
  spanRadius,
  oculusRadius,
  rise,
  springY,
  cut,
  material,
  xray,
  segments,
  profileSegments,
}: {
  spanRadius: number
  oculusRadius: number
  rise: number
  springY: number
  cut: StairwellCut | undefined
  material?: THREE.Material
  xray?: boolean
  segments?: number
  profileSegments?: number
}) {
  const geometry = useCupolaGeometry(spanRadius, oculusRadius, rise, springY, cut, segments, profileSegments)
  if (material) return <mesh geometry={geometry} material={material} receiveShadow />
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={xray ? '#aab4c0' : '#b9b2a2'}
        side={THREE.DoubleSide}
        roughness={0.95}
        transparent={xray}
        opacity={xray ? 0.12 : 1}
        depthWrite={!xray}
      />
    </mesh>
  )
}

/**
 * Structure is now VISUAL ONLY — collision lives in TowerColliders.
 *
 * docs/optimization-addendum.md, Phases 4 and 6: collision geometry must be
 * primitives, not the drawn mesh. The slabs are lathe surfaces with a boolean
 * stairwell cut, so a trimesh collider off them was both expensive and, where
 * the boolean left an open edge, unreliable.
 *
 * Cupolas deliberately get no collider at all: each one is the ceiling of the
 * room below and sits under the next storey's slab, which the walker stands on.
 * Dropping through an oculus should land you on the floor below, which is what
 * an oculus is.
 */
function Solid({ children }: { on: boolean; children: React.ReactNode }) {
  return <>{children}</>
}

function FloorSlab({
  innerR,
  holeR,
  thickness,
  y,
  solid,
  onBedrock,
  cut,
  material,
  xray,
  segments,
}: {
  innerR: number
  holeR: number
  thickness: number
  y: number
  /** No hole in the middle — draw a full disc rather than a ring. */
  solid: boolean
  /**
   * This floor IS the top of the plinth, and the shell already draws it. The
   * only such floor is storey 1; see the branch below for why the distinction
   * had to be made explicit rather than inferred from `solid`.
   */
  onBedrock?: boolean
  cut: StairwellCut | undefined
  material?: THREE.Material
  xray?: boolean
  segments?: number
}) {
  const ring = useSlabGeometry(innerR, holeR, thickness, y, cut, segments)
  if (onBedrock) {
    /*
     * Storey 1 rests on the rock, and the SHELL already draws that surface.
     *
     * buildShellGeometry() stops the inner cavity at this level and leaves the
     * drum solid from here down past the street, so there is an up-facing stone
     * face at exactly this Y across the whole chamber. This used to put a slab
     * on top of it: two opaque surfaces at identical depth carrying DIFFERENT
     * materials, which z-fought across the entry chamber floor.
     *
     * The argument that stood here died with its premise. It said the slab had
     * to be bedded into the wall by WALL_EMBED, because built at innerR exactly
     * the polygonal mismatch between a coarse lathe and the shell's 96-segment
     * drum opened a ring slit round the room — 3.5 mm at the full lathe, 111 mm
     * at the coarsest LOD — "since the drum starts at y = 0 with nothing below
     * it". The drum stopped starting at y = 0 when BASE_Y went down to
     * ENTRANCE.groundY − 0.5. And the slit cannot come back this way round: the
     * cap and the wall face it runs out to are edges of ONE CSG surface, so
     * there is no mismatch left to look through at any LOD.
     *
     * The price is the material — this floor reads in the shell's stone, not in
     * the interior stone the upper floors are paved in. The chamber's walls are
     * that same shell mesh and already read that way, so the room now comes out
     * of one material instead of a dark disc in a light room.
     */
    return null
  }
  if (solid) {
    /*
     * Every OTHER unpierced floor is a real slab and has to be drawn. It is
     * bedded into the wall by WALL_EMBED: built at innerR exactly, its edge and
     * the wall face coincide, and the polygonal mismatch between a coarse lathe
     * and the shell's 96-segment drum opens a ring slit right round the room —
     * 3.5 mm at the full lathe, 111 mm at the coarsest LOD.
     *
     * This branch was briefly deleted along with storey 1's, on the reasoning
     * that the shell already draws the surface. It does — but only at the
     * bottom of the cavity. Storeys 3, 5, 6 and 8 hang in the middle of it with
     * nothing beneath them, so returning null there did not remove a duplicate,
     * it removed the floor. Hence the two separate flags: `onBedrock` is the one
     * floor the shell also draws, `solid` is merely a floor without a hole.
     */
    const outer = innerR + WALL_EMBED
    return (
      <mesh position={[0, y - thickness / 2, 0]} material={material} receiveShadow>
        <cylinderGeometry args={[outer, outer, thickness, segments ?? RADIAL_SEGMENTS]} />
        {!material && <meshStandardMaterial color="#a89f8c" roughness={0.95} />}
      </mesh>
    )
  }
  if (material) return <mesh geometry={ring} material={material} receiveShadow />
  return (
    <mesh geometry={ring}>
      <meshStandardMaterial
        color={xray ? '#aab4c0' : '#a89f8c'}
        side={THREE.DoubleSide}
        roughness={0.95}
        transparent={xray}
        opacity={xray ? 0.12 : 1}
        depthWrite={!xray}
      />
    </mesh>
  )
}

/**
 * The frameless glass guard standing round a pierced floor opening.
 *
 * Modern fabric, drawn by default on this repo's own rule — you can put a hand
 * on it, so it is not a diagram — and it is the object config/tower.ts measured
 * the openings AGAINST: each of those three diameters is a ratio against this
 * guard's height. The model has been drawing the holes and not the thing round
 * them ever since the survey landed.
 *
 * Frameless means frameless: no posts, no cap rail, nothing but the pane. The
 * footage shows glass standing off the floor on its own, and a handrail here
 * would be a fitting nobody has seen. The pane's INNER face sits on the opening's
 * edge, so the guard takes nothing off the surveyed diameter — which is also how
 * the diameter was read, the guard being the thing standing at the rim.
 *
 * Same material as the wellhead's cover in WaterSystem, deliberately: both are
 * the post-2013 visitor fit-out and they should read as one hand.
 */
function OpeningGuard({
  radius,
  floorY,
  segments,
}: {
  radius: number
  floorY: number
  segments?: number
}) {
  const midRadius = radius + OPENING_GUARD.thickness / 2
  return (
    <mesh position={[0, floorY + OPENING_GUARD.height / 2, 0]}>
      <cylinderGeometry
        args={[midRadius, midRadius, OPENING_GUARD.height, segments ?? RADIAL_SEGMENTS, 1, true]}
      />
      <meshPhysicalMaterial
        color="#cfe3ea"
        transparent
        opacity={0.22}
        roughness={0.06}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/**
 * Phase 3 — the eight storeys' ceilings and floors.
 *
 * Each storey's opening comes from ITS OWN surveyed radius, not from one figure
 * applied to all eight. The tower has three openings and they differ in size —
 * see the OPENINGS table in config/tower.ts. A single global radius was drawing
 * all three the same, and worse, drawing the SLAB's hole from the storey's own
 * vault radius instead of the vault BELOW it, which is the one that actually
 * pierces that floor. Measured consequence: the walker climbing the steel spiral
 * met the underside of storey 2's slab at 3.50 m while standing well inside the
 * opening's radius, and the climb stopped there.
 *
 * The leva control stays useful as a MULTIPLIER on the surveyed values, so the
 * openings can still be tuned together without any one of them losing its
 * provenance.
 */
export function FloorStructures({
  oculusRadius,
  cupolaRise,
  showCupolas,
  showFloors,
  stairwells,
  withColliders = false,
  material,
  xray = false,
  viewerStorey = 0,
  showAllStoreys = true,
}: FloorStructuresProps) {
  return (
    <group>
      {FLOORS.map((f, i) => {
        /*
         * Scale factor, not a value: `oculusRadius` from leva is compared against
         * the config default so a untouched control leaves the survey alone.
         */
        const openingScale =
          TOWER.oculusRadius > 0 ? oculusRadius / TOWER.oculusRadius : 1
        /** This storey's own vault opening — 0 where the vault is closed. */
        const vaultOpening = f.oculusRadius * openingScale
        /** The hole in THIS storey's floor is cut by the vault BELOW it. */
        const slabOpening = (FLOORS[f.index - 1]?.oculusRadius ?? 0) * openingScale
        /** Whether that hole is one of the ones a glass guard rings. */
        const guarded = GUARDED_OPENINGS.some((g) => g.floorIndex === f.index)
        // Phase 11: a closed storey three floors away is never visible, so it is
        // not drawn; the ones just above and below drop to a coarser lathe.
        if (!isStoreyVisible(f.index, viewerStorey, { showAll: showAllStoreys })) return null
        /*
         * The floor is MIN_LATHE_SEGMENTS, not lodSegments' own 12. A rim bedded
         * into the wall has to stay inside a jamb 0.089 m thick, and a 12-gon at
         * this radius dips 0.155 m inside its own circle — it would come out of
         * the wall into the room. The LOD used to decide how deep the bedding
         * had to be; the wall decides now, and the LOD follows it.
         */
        const segments = lodSegments(f.index, viewerStorey, RADIAL_SEGMENTS, MIN_LATHE_SEGMENTS)
        // the meridian profile is LODed too: a distant dome needs far fewer rings
        const profile = lodSegments(f.index, viewerStorey, PROFILE_SEGMENTS, 5)
        const springRadius = innerRadiusAt(f.ceilingY - cupolaRise)
        // the flight landing on storey f pierces this storey's floor, and the
        // cupola of the storey below it — both are cut with the same sector
        const throughFloor = stairwells?.[f.index]
        const throughCupola = stairwells?.[f.index + 1]
        return (
          <group key={f.index}>
            {showCupolas && (
              <Solid on={withColliders}>
              <Cupola
                spanRadius={springRadius}
                oculusRadius={vaultOpening}
                rise={cupolaRise}
                springY={f.ceilingY - cupolaRise}
                cut={throughCupola}
                material={xray ? undefined : material}
                xray={xray}
                segments={segments}
                profileSegments={profile}
              />
              </Solid>
            )}
            {showCupolas && (
              <CeilingFill
                holeR={effectiveOpeningRadius(vaultOpening, springRadius)}
                /*
                 * Start where the DOME ends, not at the crown. The crown is the
                 * height the dome would reach on the axis; it never gets there,
                 * because it stops at the oculus rim, which is lower by the
                 * dome's rise between axis and oculus — 0.109 m here. Lining
                 * from the crown leaves exactly that band unlined, and looking
                 * up through the oculus you see straight out through it.
                 */
                crownY={
                  // springing from the LIVE rise, not the config one: f.cupolaSpringY
                  // is derived from the shipped 0.9 m, so mixing the two reopens the
                  // band by exactly (rise − 0.9) as soon as the slider moves
                  f.ceilingY -
                  cupolaRise +
                  domeHeightAt(
                    effectiveOpeningRadius(vaultOpening, springRadius),
                    springRadius,
                    cupolaRise,
                  )
                }
                topY={
                  FLOORS[f.index + 1]
                    ? FLOORS[f.index + 1].floorY - TOWER.floorSlab
                    : // the top storey's fill stops under the terrace's paving,
                      // which RoofTerrace lays over it; running it up to the deck
                      // surface instead put two up-facing stone faces on one plane
                      ROOF.masonryTopY
                }
                cut={throughCupola}
                material={xray ? undefined : material}
                xray={xray}
                segments={segments}
              />
            )}
            {showFloors && (
              <Solid on={withColliders}>
              <FloorSlab
                innerR={f.innerRadiusAtLevel}
                holeR={slabOpening}
                thickness={TOWER.floorSlab}
                y={f.floorY}
                solid={!f.hasFloorOpening}
                onBedrock={i === 0}
                cut={throughFloor}
                material={xray ? undefined : material}
                xray={xray}
                segments={segments}
              />
              </Solid>
            )}
            {/*
              Goes with the floor, not with the vault: no floor drawn means no
              hole drawn, and a glass ring standing in mid-air over an unbroken
              slab. It follows the leva multiplier for the same reason the slab's
              own hole does — the two must not part company on the slider.
            */}
            {showFloors && guarded && slabOpening > 0 && (
              <OpeningGuard
                // through the SAME clamp the slab's hole goes through, or a
                // slider pushed far enough leaves the guard standing out in the
                // room while the hole it rings has stopped growing
                radius={effectiveOpeningRadius(slabOpening, f.innerRadiusAtLevel)}
                floorY={f.floorY}
                segments={segments}
              />
            )}
          </group>
        )
      })}
    </group>
  )
}
