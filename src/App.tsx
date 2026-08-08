import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Canvas, useFrame } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Leva, useControls } from 'leva'
import {
  stairSettings,
  WINDOW_EMBRASURE,
  BUTTRESS,
  ENTRANCE,
  FLOORS,
  STAIR,
  TOWER,
  WALL_LIFTS,
  WATER,
  WELL,
  innerRadiusAt,
} from './config/tower'
import { PLAYER } from './config/player'
import {
  headroomStepsFor,
  planAllFlights,
  stairDoorways,
  stairPassageSections,
  stairwellSpanDeg,
  type Winding,
} from './lib/staircase'
import { Staircase } from './components/tower/Staircase'
import { ModernSpiralStair } from './components/modern/ModernSpiralStair'
import { SiteAndEntranceStair, OUTDOOR_START } from './components/modern/SiteAndEntranceStair'
import type { StairwellCut } from './components/tower/FloorStructures'
import type { WallChase, WindowCut } from './lib/towerShell'
import { windowCentreY, windowStoreyIndex, type WindowSpec } from './lib/windows'
import { WindowGrilles } from './components/tower/WindowGrilles'
import { WindowSurrounds } from './components/tower/WindowSurrounds'
import { WindowEmbrasures, type PlacedEmbrasure } from './components/tower/WindowEmbrasures'
import { planEmbrasure } from './lib/embrasure'
import windowData from './data/windows.json'
import { TowerWireframe } from './components/tower/TowerWireframe'
import { TowerShell, type ShellStats } from './components/tower/TowerShell'
import { TowerColliders } from './components/tower/TowerColliders'
import { FloorStructures } from './components/tower/FloorStructures'
import { FirstPersonPlayer } from './components/player/FirstPersonPlayer'
import { TouchControls } from './components/player/TouchControls'
import { NO_INPUT, type MoveInput } from './lib/playerMovement'
import { useMasonry } from './hooks/useMasonry'
import { COURSE_HEIGHT } from './lib/masonry'
import { SunSystem } from './components/sun/SunSystem'
import { SunBeams, buildApertures } from './components/sun/SunBeams'
import { CompassDisc } from './components/sun/CompassDisc'
import { SunControls } from './components/ui/SunControls'
import { WaterSystem } from './components/tower/WaterSystem'
import { HypothesisVisualsLayer } from './components/hypotheses/HypothesisVisuals'
import { HypothesisPanel } from './components/ui/HypothesisPanel'
import { LanguageSwitcher } from './components/ui/LanguageSwitcher'
import { HYPOTHESES, type HypothesisId } from './data/hypotheses'
import { PerfHud, PerfProbe, type PerfSample } from './components/ui/PerfHud'
import { storeyAt } from './lib/visibility'
import { LoadingScreen } from './components/ui/LoadingScreen'
import { HotspotMarkers } from './components/hotspots/HotspotMarkers'
import { HotspotPanel, AttributionScreen } from './components/ui/HotspotPanel'
import type { HotspotId } from './data/hotspots'
import { MaybeXR, useLazyXR } from './components/xr/LazyXR'

interface SceneProps {
  onStats: (s: ShellStats) => void
  hotspot: HotspotId | null
  onHotspot: (id: HotspotId | null) => void
  onPerf: (s: PerfSample) => void
  date: Date
  hypothesis: HypothesisId
  firstPerson: boolean
  touchInput: React.RefObject<MoveInput | null>
  touchLook: React.RefObject<{ dx: number; dy: number }>
}

/**
 * How far the recess is cut outside the reveal on each side, metres.
 *
 * Only enough that the two cuts are never near-coincident; see the note where
 * the chases are built. [ESTIMATE] — the photographs show a recess a little
 * wider than the opening above it but give no figure.
 */
const EMBRASURE_MARGIN = 0.12

/**
 * How far the recess's crown stands above the reveal's inner sill, metres.
 *
 * [ESTIMATE], and its job is structural rather than architectural: it is what
 * keeps the recess's ceiling off the window's floor, which were the same plane
 * before. Half the recess's own width is what a round head rises anyway, so this
 * is the smallest value that does not flatten it.
 */
const EMBRASURE_HEAD_RISE = 0.45

/**
 * The openings that need steps up to them, worked out rather than chosen.
 *
 * Module level, not a hook: it depends on nothing the panel can change, and both
 * the chases and the drawn steps have to agree on it exactly.
 */
const EMBRASURES: PlacedEmbrasure[] = (windowData.windows as WindowSpec[])
  .map((w) => {
    const floorYs = FLOORS.map((f) => f.floorY)
    const centre = windowCentreY(w, TOWER.groundY, TOWER.height)
    const floorY = floorYs[windowStoreyIndex(w, floorYs, TOWER.groundY, TOWER.height)]
    const plan = planEmbrasure(
      centre - w.innerHeight / 2 - floorY,
      floorY,
      PLAYER.eyeHeight,
      WINDOW_EMBRASURE.riserTarget,
      WINDOW_EMBRASURE.going,
      WINDOW_EMBRASURE.platformDepth,
    )
    if (!plan) return null
    // the same taper the chase is cut with, so the stone fills the hole exactly
    const face = innerRadiusAt(plan.platformY)
    const wall = TOWER.outerRadius - face
    const mouthWidth = w.innerWidth + 2 * EMBRASURE_MARGIN
    const backAtFullWall = w.outerWidth + 2 * EMBRASURE_MARGIN
    return {
      id: w.id,
      azimuthDeg: w.azimuthDeg,
      floorY,
      plan,
      mouthWidth,
      backWidth:
        mouthWidth +
        (backAtFullWall - mouthWidth) * Math.min(1, plan.depth / Math.max(0.5, wall)),
    }
  })
  .filter((e): e is PlacedEmbrasure => e !== null)




/** The same recesses as arcs, so the wall colliders open where the stone does. */
const EMBRASURE_OPENINGS = EMBRASURES.map((e) => ({
  azimuthDeg: e.azimuthDeg,
  widthDeg:
    ((WINDOW_EMBRASURE.width + 0.12) / innerRadiusAt(e.plan.platformY)) * (180 / Math.PI),
  sillY: e.floorY,
  headY: e.plan.platformY + PLAYER.eyeHeight,
}))

function Scene({ onStats, onPerf, date, hypothesis, hotspot, onHotspot, firstPerson, touchInput, touchLook }: SceneProps) {
  const { showShell, showWireframe, showScaleRef, cutaway } = useControls('View', {
    showShell: true,
    showWireframe: false,
    /*
     * The 1.75 m scale rod. Off by default now: the model's target is the tower
     * AS IT STANDS, and a debug marker standing on the paving beside it is the
     * clearest possible example of something that is not there. Still one click
     * away in the panel when a size needs checking.
     */
    showScaleRef: false,
    cutaway: { value: false, label: 'cutaway (hide shell)' },
  })

  // Phase-3 spec: cupolas and oculi. Both values are unmeasured — tune and compare.
  const floors = useControls('Floors & cupolas', {
    showCupolas: true,
    showFloors: true,
    oculusRadius: { value: TOWER.oculusRadius, min: 0.3, max: 2.5, step: 0.05, label: 'oculus R m' },
    cupolaRise: { value: TOWER.cupolaRise, min: 0.2, max: 2.0, step: 0.05, label: 'cupola rise m' },
  })

  // Phase-2 spec: tune the buttress and entrance by azimuth against reference photos.
  const buttress = useControls('Buttress', {
    buttressAzimuthDeg: { value: BUTTRESS.azimuthDeg, min: 0, max: 360, step: 0.1, label: 'azimuth°' },
    buttressProjection: { value: BUTTRESS.projection, min: 2, max: 16, step: 0.1, label: 'projection m' },
    buttressTipWidth: { value: BUTTRESS.tipWidth, min: 1, max: 10, step: 0.1, label: 'tip width m' },
    buttressRootArcDeg: { value: BUTTRESS.rootArcDeg, min: 10, max: 120, step: 0.5, label: 'root arc°' },
    buttressSkewDeg: { value: BUTTRESS.skewDeg, min: -40, max: 40, step: 0.5, label: 'skew°' },
    buttressHeight: { value: TOWER.height, min: 5, max: TOWER.height, step: 0.5, label: 'height m' },
  })

  // Phase-4 spec. `winding` is the one value the photographs could not settle.
  const stair = useControls('Staircase', {
    showStair: true,
    withColliders: true,
    winding: { value: STAIR.winding as Winding, options: ['clockwise', 'counterclockwise'] },
    riserTarget: { value: STAIR.riserTarget, min: 0.16, max: 0.24, step: 0.005, label: 'riser m' },
    goingTarget: { value: STAIR.goingTarget, min: 0.2, max: 0.45, step: 0.01, label: 'going m' },
    stairWidth: { value: STAIR.width, min: 0.5, max: 1.6, step: 0.05, label: 'flight width m' },
    wallClearance: { value: STAIR.wallClearance, min: 0, max: 1, step: 0.05, label: 'wall gap m' },
    startAzimuthDeg: { value: STAIR.startAzimuthDeg, min: 0, max: 360, step: 1, label: 'start az°' },
    cutStairwells: true,
  })

  // leva's options control is typed as string; the values are the Winding union
  const winding = stair.winding as Winding

  /** Where each flight breaks through the structure above it. */
  const stairwells = useMemo<Array<StairwellCut | undefined>>(() => {
    if (!stair.cutStairwells) return []
    const flights = planAllFlights(
      stairSettings({
        winding,
        riserTarget: stair.riserTarget,
        goingTarget: stair.goingTarget,
        width: stair.stairWidth,
        wallClearance: stair.wallClearance,
        startAzimuthDeg: stair.startAzimuthDeg,
      }),
      WALL_LIFTS,
      innerRadiusAt,
    )
    const cuts: Array<StairwellCut | undefined> = []
    flights.forEach((steps, i) => {
      const lift = WALL_LIFTS[i]
      if (!lift) return
      // the opening has to be open from where the walker's HEAD meets the slab,
      // not from where their feet do — see headroomStepsFor()
      const riser = steps.length > 1 ? Math.abs(steps[1].treadY - steps[0].treadY) : STAIR.riserTarget
      const headroomSteps = headroomStepsFor(riser, PLAYER.height, TOWER.floorSlab)
      /*
       * A flight pierces the slab it LANDS on — and, for 4→6, also the slab it
       * runs PAST. The cut is measured at the pierced storey's own level, not at
       * the one below: taking the radius from beneath put it 0.27 m inside the
       * room face, which is a hole in the floor at the wall rather than a lip
       * over the passage. No inward margin either, for the same reason.
       *
       * The roof lift lands on the deck, which is not a floor slab and carries
       * no cut here.
       */
      const pierces = [...lift.opensAtFloorNumbers, lift.toFloorNumber].filter(
        (n) => n >= 1 && n <= FLOORS.length,
      )
      for (const floorNumber of pierces) {
        const pierced = FLOORS[floorNumber - 1]
        // for a storey the flight only passes, the opening sits where the flight
        // crosses THAT level, not at the head of the run
        const span = stairwellSpanDeg(
          steps.filter((s) => s.treadY <= pierced.floorY + 1e-9),
          headroomSteps,
        )
        if (!span) continue
        const inner = innerRadiusAt(pierced.floorY) + stair.wallClearance
        cuts[floorNumber - 1] = {
          centreAzimuthDeg: span.centreAzimuthDeg,
          widthDeg: span.widthDeg,
          innerRadius: inner,
          outerRadius: inner + stair.stairWidth + 0.1,
        }
      }
    })
    return cuts
  }, [
    stair.cutStairwells,
    winding,
    stair.riserTarget,
    stair.goingTarget,
    stair.stairWidth,
    stair.wallClearance,
    stair.startAzimuthDeg,
  ])

  /**
   * The void the stair needs through the masonry. Cutting it is what turns the
   * treads from blocks entombed in stone into a passage you can actually walk.
   */
  const stairPassage = useMemo(() => {
    if (!stair.cutStairwells) return undefined
    const flights = planAllFlights(
      stairSettings({
        winding,
        riserTarget: stair.riserTarget,
        goingTarget: stair.goingTarget,
        width: stair.stairWidth,
        wallClearance: stair.wallClearance,
        startAzimuthDeg: stair.startAzimuthDeg,
      }),
      WALL_LIFTS,
      innerRadiusAt,
    )
    // Vault height above each tread. [ASSUMPTION] — no source gives it. 2.0 m
    // was the first guess and proved unwalkable: it left 0.14 m over a 1.75 m
    // head, and the character controller has to lift the capsule a full riser
    // to mount the next step, so it hit the vault and refused every time.
    return stairPassageSections(
      flights,
      stair.stairWidth,
      PLAYER.stairHeadroom,
      innerRadiusAt,
      undefined,
      STAIR.doorwayWidth,
    )
  }, [
    stair.cutStairwells,
    winding,
    stair.riserTarget,
    stair.goingTarget,
    stair.stairWidth,
    stair.wallClearance,
    stair.startAzimuthDeg,
  ])

  /**
   * The arched openings between each room and the stair passage. With the
   * passage sealed inside the masonry these are the only way onto the stair —
   * which is what the walkthrough footage of the tower shows.
   */
  const doorways = useMemo(() => {
    if (!stair.cutStairwells) return undefined
    const flights = planAllFlights(
      stairSettings({
        winding,
        riserTarget: stair.riserTarget,
        goingTarget: stair.goingTarget,
        width: stair.stairWidth,
        wallClearance: stair.wallClearance,
        startAzimuthDeg: stair.startAzimuthDeg,
      }),
      WALL_LIFTS,
      innerRadiusAt,
    )
    return stairDoorways(
      flights,
      stair.stairWidth,
      PLAYER.height + 0.35,
      innerRadiusAt,
      (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
      WALL_LIFTS.map((l) => l.opensAtY),
      STAIR.doorwayWidth,
    )
  }, [
    stair.cutStairwells,
    winding,
    stair.riserTarget,
    stair.goingTarget,
    stair.stairWidth,
    stair.wallClearance,
    stair.startAzimuthDeg,
  ])

  /**
   * The chase the Ø 30 cm downpipe stands in, one per storey it passes.
   *
   * Photographed: an open rectangular recess through several courses, floor to
   * springing, with the pipe inside it. [ref] has the pipe coming out of the
   * niches, and this is the niche.
   */
  const wallChases = useMemo<WallChase[]>(() => {
    const [from, to] = WATER.channelFloorRange
    const out: WallChase[] = []
    for (let i = WELL.startsAtFloorIndex; i <= to && i < FLOORS.length; i++) {
      if (i < from - 1) continue
      const f = FLOORS[i]
      out.push({
        azimuthDeg: WELL.azimuthDeg,
        // wide enough to stand the pipe in with a shoulder either side
        width: WATER.downpipeDiameter * 2.2,
        bottomY: f.floorY,
        topY: f.cupolaSpringY,
        depth: WATER.downpipeDiameter * 1.6,
      })
    }
    /*
     * And the recesses the window steps stand in.
     *
     * Cut as chases rather than as anything new: a chase is exactly what an
     * embrasure is — a blind bite into the room-side face that does not go
     * through. Doing it here also means the steps themselves cut nothing, so a
     * change to them can never open a hole in the wall.
     */
    for (const e of EMBRASURES) {
      /*
       * THE RECESS FOLLOWS THE REVEAL ABOVE IT, a fixed margin wider all the way.
       *
       * It was a parallel-sided box 1.32 m across. The reveal it runs under
       * narrows from 1.50 m at the room face to 0.40 m outside, so the box sat
       * INSIDE the reveal near the room and OUTSIDE it from about 0.7 m deep,
       * and the two sets of side faces crossed at a glancing angle in between.
       * Near-coincident CSG faces are what the owner was seeing as holes you can
       * look through and a lip you catch on — at eye level, because the box's
       * flat top is built to meet the window's inner sill.
       *
       * Given the same taper plus EMBRASURE_MARGIN on each side, the recess is
       * strictly outside the reveal at every depth and the two surfaces never
       * come near each other.
       */
      out.push({
        azimuthDeg: e.azimuthDeg,
        // the placed embrasure already carries both, so the cut and the stone
        // that fills it can never be computed two different ways
        width: e.mouthWidth,
        bottomY: e.floorY,
        /*
         * PAST the reveal's inner sill, not level with it.
         *
         * platformY + eyeHeight IS that sill by construction — the platform is
         * placed to bring the eye to it — so a flat lid there made the recess's
         * ceiling and the window's floor the same plane. Two coincident CSG
         * surfaces, at eye level, which is exactly where the owner was looking
         * when they called the surfaces holey. Carried a head's rise higher, the
         * recess opens INTO the window instead of butting against it, and the
         * round head has somewhere to go.
         */
        topY: e.plan.platformY + PLAYER.eyeHeight + EMBRASURE_HEAD_RISE,
        depth: e.plan.depth,
        arched: true,
        // the reveal's own width where the recess ends
        outerWidth: e.backWidth,
      })
    }
    return out
  }, [])

  // Phase-5 spec: openings come from src/data/windows.json so they can be edited
  // without a rebuild. Every value there is photo-derived, not surveyed.
  const windowCtl = useControls('Windows', {
    cutWindows: true,
    azimuthNudgeDeg: { value: 0, min: -40, max: 40, step: 1, label: 'azimuth nudge°' },
    widthScale: { value: 1, min: 0.4, max: 2.5, step: 0.05, label: 'outer width ×' },
    flareScale: { value: 1, min: 0.5, max: 3, step: 0.05, label: 'inward flare ×' },
  })

  const windows = useMemo<WindowCut[] | undefined>(() => {
    if (!windowCtl.cutWindows) return undefined
    return (windowData.windows as WindowSpec[]).map((w) => {
      // From the photographic fraction, NOT from floorIndex + sill: see
      // windowCentreY(). floorIndex survives only as a grouping key.
      const centreY = windowCentreY(w, TOWER.groundY, TOWER.height)
      const outerWidth = w.outerWidth * windowCtl.widthScale
      return {
        azimuthDeg: w.azimuthDeg + windowCtl.azimuthNudgeDeg,
        centreY,
        outerWidth,
        outerHeight: w.outerHeight,
        innerWidth: outerWidth + (w.innerWidth - w.outerWidth) * windowCtl.flareScale,
        innerHeight: w.innerHeight,
        head: w.head,
        barrierAt: w.barrierAt,
      }
    })
  }, [windowCtl.cutWindows, windowCtl.azimuthNudgeDeg, windowCtl.widthScale, windowCtl.flareScale])

  // Phase-7 spec: procedural limestone. Colours are MEASURED from the reference
  // photographs (see lib/masonry.ts); only the pattern controls are free.
  const stone = useControls('Masonry', {
    proceduralStone: true,
    coursePeriod: { value: COURSE_HEIGHT, min: 0.1, max: 0.8, step: 0.01, label: 'course m' },
    bandContrast: { value: 1, min: 0, max: 2, step: 0.05, label: 'band contrast' },
    diamondStrength: { value: 0.6, min: 0, max: 1.5, step: 0.05, label: 'diamond' },
    diamondScale: { value: 2.2, min: 0.5, max: 8, step: 0.1, label: 'diamond scale' },
    colourNoise: { value: 0.12, min: 0, max: 0.5, step: 0.01, label: 'colour drift' },
  })

  const exteriorStone = useMasonry(stone, { interior: false })
  const interiorStone = useMasonry(stone, { interior: true })
  const shellMat = stone.proceduralStone ? exteriorStone : undefined
  const innerMat = stone.proceduralStone ? interiorStone : undefined

  // Phase-9 spec: the water system gets its own layer — "Водосбор" — because it
  // is the best-documented part of the tower and shown almost nowhere.
  const water = useControls('Водосбор', {
    /*
     * The SCHEMATIC half of the water-collection layer: the ring channels, the
     * junction leg across to the wellhead, the buried intakes. OFF by default.
     *
     * In the tower none of it can be seen — [ref] puts the channels inside the
     * masonry and the intakes under the paving, and the pipe's last courses at
     * the well were lifted long ago. Drawn in the walkable model it puts a
     * 0.22 m ceramic hoop round every chamber and lays a 0.3 m pipe across the
     * floor where visitors stand at the glass. It is a DIAGRAM of a system [ref]
     * describes, not fabric you could touch, and the model's target is the
     * building as it stands. One click away, where a diagram belongs.
     *
     * What this switch NO LONGER hides is the well — the glass-covered head in
     * storey 3's floor, its rim and shaft, and the downpipe standing in the
     * chase this file cuts into the shell a few lines up. Those a visitor CAN
     * touch, and the wellhead is the one thing that storey is known for; hiding
     * it behind the diagram was hiding the building to hide the argument about
     * it. Same rule as the beams and the scale rod, opposite answer.
     */
    showSchematic: false,
    highlightWater: false,
    xrayWalls: false,
  })

  const sky = useControls('Sun', {
    showSky: true,
    /*
     * The solar beams. OFF by default, on the same rule as the water system and
     * the scale rod: fabric is drawn, diagrams are a click away.
     *
     * They are drawn as visible shafts standing in the chambers, and they are a
     * claim about the ORIGINAL building — this file's header is explicit that the
     * purpose and solar layers must never read as statements about the fabric you
     * walk through today. Shown by default inside a current-state model they do
     * exactly that.
     */
    showBeams: false,
    showCompass: false,
  })

  const hotspots = useControls('Hotspots', { showHotspots: true })

  const lampCtl = useControls('Lamp', {
    lamp: true,
    lampIntensity: { value: 26, min: 0, max: 80, step: 1 },
  })

  const [viewerStorey, setViewerStorey] = useState(0)

  // Phase-11 spec: the optimisation must be measurable and switchable, so the
  // before/after can be compared rather than asserted.
  const perf = useControls('Performance', {
    cullStoreys: true,
  })

  const hypothesisVisuals =
    HYPOTHESES.find((h) => h.id === hypothesis)?.visuals ?? {}

  const entrance = useControls('Entrance', {
    entranceAzimuthDeg: { value: ENTRANCE.azimuthDeg, min: 0, max: 360, step: 1, label: 'azimuth°' },
    entranceWidth: { value: ENTRANCE.width, min: 0.6, max: 3, step: 0.05, label: 'width m' },
    entranceHeight: { value: ENTRANCE.height, min: 1.2, max: 4, step: 0.05, label: 'height m' },
    entranceSillY: { value: ENTRANCE.thresholdY, min: -4, max: 8, step: 0.1, label: 'threshold Y m' },
  })

  return (
    <>
      <color attach="background" args={['#16181c']} />
      {/* Phase 8: the light is placed by suncalc from the tower's real
          coordinates, so every shadow here is the shadow of that instant. */}
      <SunSystem date={date} showSky={sky.showSky} />
      <ambientLight intensity={0.06} />

      {/*
        Survey aids, for the orbit view only. Inside the tower they read as a
        green line hanging down the middle of every room and a grid showing
        through the floor — walking the model is the one place they must not
        appear.
      */}
      {!firstPerson && (
        <>
          <Grid
            args={[80, 80]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#2a2d33"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#3a3f47"
            fadeDistance={110}
            infiniteGrid
          />
          {/* axesHelper: +X red = east, +Z blue = south (north = -Z) */}
          <axesHelper args={[14]} />
        </>
      )}

      {showShell && !cutaway && (
        <TowerShell
          xray={water.xrayWalls}
          {...buttress}
          {...entrance}
          windows={windows}
          stairPassage={stairPassage}
          stairDoorways={doorways}
          wallChases={wallChases}
          withCollider={firstPerson}
          material={shellMat}
          onStats={onStats}
        />
      )}
      {/*
        The grilles go with the shell: they exist only where its openings do, and
        without the shell there are no openings to cover.
      */}
      {showShell && !cutaway && windows && <WindowGrilles windows={windows} />}
      {showShell && !cutaway && windows && (
        <WindowSurrounds windows={windows} material={shellMat} />
      )}
      {showShell && !cutaway && (
        <WindowEmbrasures embrasures={EMBRASURES} material={innerMat} withColliders={firstPerson} />
      )}
      {showWireframe && (
        <TowerWireframe showInner showFloors showScaleRef={false} showFeatures={false} />
      )}

      <PerfProbe onSample={onPerf} />
      <ViewerStoreyTracker enabled={firstPerson} onChange={setViewerStorey} />

      {/*
        All static collision, as cuboids — see docs/optimization-addendum.md.
        Built only in walk mode: colliders cost nothing to look at, but building
        several hundred of them for an orbit view is wasted work.
      */}
      {firstPerson && (
        <TowerColliders
          stairPassage={stairPassage}
          stairwells={stairwells}
          doorways={doorways}
          embrasures={EMBRASURE_OPENINGS}
        />
      )}

      <FloorStructures
        oculusRadius={floors.oculusRadius}
        cupolaRise={floors.cupolaRise}
        showCupolas={floors.showCupolas}
        showFloors={floors.showFloors}
        stairwells={stairwells}
        xray={water.xrayWalls}
        withColliders={firstPerson}
        material={innerMat}
        viewerStorey={viewerStorey}
        showAllStoreys={!firstPerson || !perf.cullStoreys}
      />

      <SunBeams
        date={date}
        apertures={buildApertures(windowData.windows as never, FLOORS)}
        visible={sky.showBeams || !!hypothesisVisuals.solarBeam}
      />
      {/*
        Corbels, the string course, the solar cone — a DIAGRAM of whichever
        purpose hypothesis is selected, not fabric. Gated behind the same switch
        as the beams so that walking into the tower shows the building and
        nothing argued about it.
      */}
      {sky.showBeams && <HypothesisVisualsLayer visuals={hypothesisVisuals} />}

      <HotspotMarkers
        visible={hotspots.showHotspots}
        selected={hotspot}
        onSelect={onHotspot}
        showInterior={firstPerson || cutaway}
      />
      <CompassDisc visible={sky.showCompass} year={date.getFullYear()} />
      <WaterSystem
        showSchematic={water.showSchematic}
        highlighted={water.highlightWater}
        viewerStorey={viewerStorey}
        showAll={!firstPerson || !perf.cullStoreys || water.xrayWalls}
      />

      <Staircase
        winding={winding}
        riserTarget={stair.riserTarget}
        goingTarget={stair.goingTarget}
        width={stair.stairWidth}
        wallClearance={stair.wallClearance}
        startAzimuthDeg={stair.startAzimuthDeg}
        visible={stair.showStair}
        withColliders={stair.withColliders}
        material={innerMat}
      />

      {/*
        The inserted steel spiral, entry chamber to storey 2. It is the ONLY way
        between those two floors in the tower as it stands, so without it the
        model has a hole where the visitor route begins.
      */}
      <ModernSpiralStair visible={stair.showStair} withColliders={stair.withColliders} />

      {/*
        The ground outside and the stair up to the doorway. Without them the
        walker has to start inside a sealed tower, which is the one route into
        the building that does not exist.
      */}
      <SiteAndEntranceStair visible withColliders={stair.withColliders} />

      {showScaleRef && (
        <mesh position={[TOWER.outerRadius + 2.5, 1.75 / 2, 0]}>
          <boxGeometry args={[0.4, 1.75, 0.4]} />
          <meshStandardMaterial color="#3fbf6f" />
        </mesh>
      )}

      {/* also a survey aid: it draws into the scene, so it floats in the room */}
      {!firstPerson && (
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#d94f4f', '#3fbf6f', '#4a7fd9']} labelColor="#eee" />
      </GizmoHelper>
      )}

      {firstPerson ? (
        <FirstPersonPlayer
          touchInput={touchInput}
          touchLook={touchLook}
          startAt={OUTDOOR_START}
          lamp={lampCtl.lamp}
          lampIntensity={lampCtl.lampIntensity}
        />
      ) : (
        <OrbitControls target={[0, TOWER.topY / 2, 0]} enableDamping />
      )}
    </>
  )
}

export default function App() {
  const { t } = useTranslation('ui')
  const [stats, setStats] = useState<ShellStats | null>(null)

  // Walk mode is a top-level switch: it decides whether physics runs, whether
  // colliders are built, and which camera controls the view.
  const [firstPerson, setFirstPerson] = useState(false)
  // The moment being shown. Opens on NOW — the sun over Baku as it actually is
  // at this instant. `new Date()` is the right value whatever timezone the
  // viewer is in: the sun's position depends on the absolute instant plus the
  // site's coordinates, and the panel converts that to Baku wall-clock for
  // display. The winter-solstice preset is one click away for the Phase-8 test.
  const [date, setDate] = useState(() => new Date())
  /**
   * While true the clock follows real time in Baku, so leaving the app open
   * lets the sun actually move. The moment the viewer drags a slider or picks a
   * preset they have taken control, and it stops fighting them.
   */
  const [liveClock, setLiveClock] = useState(true)

  useEffect(() => {
    if (!liveClock) return
    const id = window.setInterval(() => setDate(new Date()), 20_000)
    return () => window.clearInterval(id)
  }, [liveClock])
  // Phase 10: which reading of the tower is being shown. Defaults to the UNESCO
  // consensus because it is the least speculative, NOT because it is correct.
  const [hypothesis, setHypothesis] = useState<HypothesisId>('citadel')
  const [hotspot, setHotspot] = useState<HotspotId | null>(null)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const xr = useLazyXR()
  const [perf, setPerf] = useState<PerfSample | null>(null)
  const [perfBaseline, setPerfBaseline] = useState<PerfSample | null>(null)
  const touchInput = useRef<MoveInput | null>({ ...NO_INPUT })
  const touchLook = useRef({ dx: 0, dy: 0 })

  /**
   * Diagnostic overlays, per docs/optimization-addendum.md:
   * F3 — the budget readout, F4 — a wireframe of every collider over the visuals,
   * so the gap between what is drawn and what is collided against is visible.
   */
  const [showPerf, setShowPerf] = useState(true)
  const [showColliders, setShowColliders] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F3') {
        e.preventDefault()
        setShowPerf((v) => !v)
      }
      if (e.code === 'F4') {
        e.preventDefault()
        setShowColliders((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <LoadingScreen />
      <Leva collapsed />
      <LanguageSwitcher />
      {showPerf && (
        <PerfHud
          sample={perf}
          baseline={perfBaseline}
          onCapture={() => setPerfBaseline(perf)}
          onClear={() => setPerfBaseline(null)}
        />
      )}
      <HypothesisPanel selected={hypothesis} onSelect={setHypothesis} />
      <HotspotPanel selected={hotspot} onClose={() => setHotspot(null)} />
      <AttributionScreen open={creditsOpen} onClose={() => setCreditsOpen(false)} />

      <button
        onClick={() => setFirstPerson((v) => !v)}
        style={{
          position: 'fixed',
          left: 12,
          top: 12,
          zIndex: 20,
          font: '13px ui-monospace, monospace',
          color: '#eee',
          background: firstPerson ? '#2f6f4a' : 'rgba(0,0,0,.6)',
          border: '1px solid rgba(255,255,255,.25)',
          borderRadius: 6,
          padding: '7px 12px',
          cursor: 'pointer',
        }}
      >
        {firstPerson ? t('walking') : t('walkInside')}
      </button>

      {firstPerson && (
        <div
          style={{
            position: 'fixed',
            right: 12,
            top: 12,
            zIndex: 20,
            font: '12px/1.5 ui-monospace, monospace',
            color: '#cfc',
            background: 'rgba(0,0,0,.6)',
            padding: '8px 12px',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          {t('controlsHint')}
          <br />
          {t('speedHint', { speed: PLAYER.walkSpeed, eye: PLAYER.eyeHeight })}
        </div>
      )}

      <div style={{ position: 'fixed', left: 12, top: 52, zIndex: 20, display: 'flex', gap: 6 }}>
        <button onClick={() => setCreditsOpen(true)} style={secondaryButton}>
          {t('credits')}
        </button>
        <button onClick={xr.enter} disabled={xr.loading} style={secondaryButton}>
          {xr.loading ? '…' : t('vrMode')}
        </button>
      </div>

      {firstPerson && <TouchControls inputRef={touchInput} lookRef={touchLook} />}

      <SunControls
        date={date}
        live={liveClock}
        onChange={(d) => {
          setLiveClock(false)
          setDate(d)
        }}
        onResumeLive={() => {
          setLiveClock(true)
          setDate(new Date())
        }}
        apertures={buildApertures(windowData.windows as never, FLOORS)}
      />

      {stats && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            bottom: 12,
            zIndex: 10,
            font: '12px ui-monospace, monospace',
            color: stats.degenerateCount === 0 ? '#8fd9a8' : '#e88',
            background: 'rgba(0,0,0,.55)',
            padding: '6px 10px',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          shell: {stats.triangleCount.toLocaleString()} tris · {stats.vertexCount.toLocaleString()} verts ·
          degenerate: {stats.degenerateCount}
        </div>
      )}
      <Canvas shadows camera={{ position: [36, 24, 36], fov: 50, near: 0.1, far: 600 }}>
        {/* Physics is here from Phase 4 so the steps carry colliders; the
            first-person controller that walks on them arrives in Phase 6. */}
        {/* Physics runs only in walk mode: colliders and the solver cost
            nothing while you are inspecting the model from outside. */}
        <Suspense fallback={null}>
        <MaybeXR session={xr.session}>
        {/* debug draws rapier's own collider wireframes — the actual shapes, not a guess */}
        <Physics paused={!firstPerson} debug={showColliders}>
          <Scene
            onStats={setStats}
            onPerf={setPerf}
            date={date}
            hypothesis={hypothesis}
            hotspot={hotspot}
            onHotspot={setHotspot}
            firstPerson={firstPerson}
            touchInput={touchInput}
            touchLook={touchLook}
          />
        </Physics>
        </MaybeXR>
        </Suspense>
      </Canvas>
    </>
  )
}

/**
 * Follows the camera's height and reports which storey it is on, so the scene
 * can drop the storeys the viewer cannot possibly see. Only active in walk mode:
 * from outside, the whole tower is in frame and culling would be visible.
 */
function ViewerStoreyTracker({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (i: number) => void
}) {
  const last = useRef(-1)
  useFrame(({ camera }) => {
    if (!enabled) return
    const s = storeyAt(camera.position.y, FLOORS)
    if (s !== last.current) {
      last.current = s
      onChange(s)
    }
  })
  return null
}

const secondaryButton: React.CSSProperties = {
  font: '11px ui-monospace, monospace',
  color: '#cfd8e3',
  background: 'rgba(0,0,0,.6)',
  border: '1px solid rgba(255,255,255,.2)',
  borderRadius: 5,
  padding: '5px 10px',
  cursor: 'pointer',
}
