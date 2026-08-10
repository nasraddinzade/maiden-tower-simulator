import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Canvas, useFrame } from '@react-three/fiber'
import { ACESFilmicToneMapping } from 'three'
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Leva, useControls } from 'leva'
import {
  stairSettings,
  PASSAGE_OPENING,
  BUTTRESS,
  ENTRANCE,
  FLOORS,
  ROOF_QUESTION,
  STAIR,
  TOWER,
  WALL_LIFTS,
  WATER,
  WELL,
  innerRadiusAt,
} from './config/tower'
import { LAMP, PLAYER } from './config/player'
import {
  headroomStepsFor,
  planAllFlights,
  stairDoorways,
  stairPassageSections,
  stairwellSpanDeg,
  type Winding,
} from './lib/staircase'
import {
  passageEndAnchors,
  planPassageOpenings,
  testimonyConflicts,
  type OpeningFitting,
} from './lib/passageOpenings'
import { Staircase } from './components/tower/Staircase'
import { ModernSpiralStair } from './components/modern/ModernSpiralStair'
import { SiteAndEntranceStair, OUTDOOR_START } from './components/modern/SiteAndEntranceStair'
import type { StairwellCut } from './components/tower/FloorStructures'
import type { WallChase, WindowCut } from './lib/towerShell'
import { WindowGrilles } from './components/tower/WindowGrilles'
import { WindowSurrounds } from './components/tower/WindowSurrounds'
import { CourseBands } from './components/tower/CourseBands'
import { EntranceArchivolt } from './components/tower/EntranceArchivolt'
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
import type { OpeningAperture } from './lib/sun'
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
  /**
   * The panel outside the Canvas needs the openings too, and it must be the SAME
   * list the shell was cut from.
   *
   * Recomputing them out there from the module-level STAIR defaults would be the
   * silent divergence this refactor exists to close: the panel would name and
   * test apertures the building does not have, and nothing on screen would say
   * so. Lifted through a callback, exactly as the shell's own stats are.
   */
  onApertures: (a: OpeningAperture[]) => void
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
 * THE STEPPED EMBRASURES ARE GONE FROM THE SCENE, and this is where they stood.
 *
 * [OWNER], 2026-08-10: "НА ЯРУСАХ ОКНА ТОЛЬКО В НАЧАЛЕ И В КОНЦЕ ПРОХОДОВ
 * ЛЕСТНИЦ. НА САМИХ ЯРУСАХ НИКАКИХ ОКОН НЕТ." With no openings in the chamber
 * walls there is nothing for a chamber recess to serve, and the layer would be
 * steps up to a window that is not there — which is exactly what the brief
 * forbids leaving behind.
 *
 * It is not a loss of evidence: planEmbrasure() decides by height, and every
 * opening at the end of a passage has its sill 0.30 m above the landing it opens
 * off, so the rule returns null for all of them. Zero receivers, checkable.
 *
 * src/lib/embrasure.ts and its tests are KEPT. The owner's other statement —
 * that steps lead up to some of the tower's windows — has not gone away, and its
 * only surviving carrier is a short branch off a stair landing. See
 * PASSAGE_OPENING.branchAtEnds, which ships empty because no source gives that
 * branch a length, a bearing or a gradient.
 */

/**
 * The storey level at each end of a flight, defined ONCE.
 *
 * The doorway at an end and the slit at the same end are two holes in the same
 * landing. Computing that landing's level twice is how they would come to
 * disagree, and this model has already paid for placing a doorway and the ramp
 * up to it from separate arithmetic.
 */
const LANDING_Y_OF = (i: number, end: 'foot' | 'head'): number =>
  end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY

/** The editable half of each passage opening — see src/data/windows.json. */
const OPENING_FITTINGS = windowData.passageOpenings as OpeningFitting[]

/**
 * THERE IS NO CHAMBER OPENING LEFT TO BUILD, and this is where the last one was.
 *
 * [OWNER], 2026-08-10, twice: «на ярусах самих окон нет». The first time, the
 * later arched window on storey 4 was kept anyway, on the argument that a modern
 * insertion sits outside a rule about how the building works. That argument was
 * put to him; he restated the rule instead of accepting the exception, and went
 * on to describe the openings end by end without an exception for anything. The
 * record of what the window was, why it was believed to be a later insertion and
 * what would bring it back is in src/data/windows.json → chamberOpeningsHistory.
 */

function Scene({ onStats, onApertures, onPerf, date, hypothesis, hotspot, onHotspot, firstPerson, touchInput, touchLook }: SceneProps) {
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

  /**
   * ONE layout for the whole stair, and everything derived from it downstream.
   *
   * This used to be four separate calls to planAllFlights(), each rebuilding the
   * same six-field literal from the same sliders. That was already the failure
   * stairSettings() was written to stop — a literal kept in sync by hand — and it
   * became load-bearing on 2026-08-10: the exterior openings are now ends of
   * these flights, so a stale plan would cut the shell in one place and put the
   * grilles, the surrounds, the course breaks and the sun beams in another, with
   * nothing on screen to say so.
   */
  const flightPlan = useMemo(() => {
    const settings = stairSettings({
      winding,
      riserTarget: stair.riserTarget,
      goingTarget: stair.goingTarget,
      width: stair.stairWidth,
      wallClearance: stair.wallClearance,
      startAzimuthDeg: stair.startAzimuthDeg,
    })
    const flights = planAllFlights(settings, WALL_LIFTS, innerRadiusAt)
    // Vault height above each tread. [ASSUMPTION] — no source gives it. 2.0 m
    // was the first guess and proved unwalkable: it left 0.14 m over a 1.75 m
    // head, and the character controller has to lift the capsule a full riser
    // to mount the next step, so it hit the vault and refused every time.
    const tubes = stairPassageSections(
      flights,
      stair.stairWidth,
      PLAYER.stairHeadroom,
      innerRadiusAt,
      // and where the stone stops, so the roof climb's vault is not asserted in
      // mid-air — see the note on the argument and ROOF_QUESTION
      TOWER.topY,
      undefined,
      STAIR.doorwayWidth,
    )
    return { settings, flights, tubes }
  }, [
    winding,
    stair.riserTarget,
    stair.goingTarget,
    stair.stairWidth,
    stair.wallClearance,
    stair.startAzimuthDeg,
  ])

  /** Where each flight breaks through the structure above it. */
  const stairwells = useMemo<Array<StairwellCut | undefined>>(() => {
    if (!stair.cutStairwells) return []
    const { flights } = flightPlan
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
  }, [stair.cutStairwells, flightPlan, stair.stairWidth, stair.wallClearance])

  /**
   * The void the stair needs through the masonry. Cutting it is what turns the
   * treads from blocks entombed in stone into a passage you can actually walk.
   */
  const stairPassage = useMemo(
    () => (stair.cutStairwells ? flightPlan.tubes : undefined),
    [stair.cutStairwells, flightPlan],
  )

  /**
   * The arched openings between each room and the stair passage. With the
   * passage sealed inside the masonry these are the only way onto the stair —
   * which is what the walkthrough footage of the tower shows.
   */
  const doorways = useMemo(() => {
    if (!stair.cutStairwells) return undefined
    return stairDoorways(
      flightPlan.flights,
      stair.stairWidth,
      PLAYER.height + 0.35,
      innerRadiusAt,
      LANDING_Y_OF,
      TOWER.topY,
      WALL_LIFTS.map((l) => l.opensAtY),
      STAIR.doorwayWidth,
    )
  }, [stair.cutStairwells, flightPlan, stair.stairWidth])

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
    return out
  }, [])

  // Phase-5 spec: openings come from src/data/windows.json so they can be edited
  // without a rebuild. Every value there is photo-derived, not surveyed.
  //
  // THERE IS NO AZIMUTH CONTROL ANY MORE. An opening at the end of a passage has
  // no bearing of its own — nudging it would slide it off the landing it opens
  // off and out of the tunnel the walker is standing in. The control that moves
  // the slits is Staircase → start az°, and it moves every one of them at once.
  const windowCtl = useControls('Windows', {
    cutWindows: true,
    widthScale: { value: 1, min: 0.4, max: 2.5, step: 0.05, label: 'outer width ×' },
    flareScale: { value: 1, min: 0.5, max: 3, step: 0.05, label: 'inward flare ×' },
  })

  /**
   * Every opening in the tower, cut from ONE list.
   *
   * The shell, the course breaks, the grilles, the surrounds and the sun beams
   * all take this array, so the hole in the stone and everything hung in it
   * cannot come from different arithmetic.
   */
  const openings = useMemo(() => {
    const anchors = passageEndAnchors(flightPlan.flights, flightPlan.tubes, LANDING_Y_OF)
    return planPassageOpenings({
      anchors,
      fittings: OPENING_FITTINGS,
      liftLabel: (i) => ({
        from: WALL_LIFTS[i].fromFloorNumber,
        to: WALL_LIFTS[i].toFloorNumber,
      }),
      cfg: PASSAGE_OPENING,
      buttress: BUTTRESS,
      outerRadius: TOWER.outerRadius,
      /*
       * The pier runs the full height of the drum in the model, and the config is
       * explicit that this is UNRESOLVED — one reading of the exterior set puts
       * its head level with the parapet, another at 18.3 ± 0.5 m. That question
       * used to be cosmetic. It now decides how many openings the tower has: at
       * the low reading the feet of 6→7 and 7→8 rise clear of the pier and the
       * count goes from six to eight.
       */
      buttressTopY: Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY),
      towerTopY: TOWER.topY,
    })
  }, [flightPlan])

  const windows = useMemo<WindowCut[] | undefined>(() => {
    if (!windowCtl.cutWindows) return undefined
    const scale = (outer: number, inner: number) => {
      const o = outer * windowCtl.widthScale
      return { outerWidth: o, innerWidth: o + (inner - outer) * windowCtl.flareScale }
    }
    const cuts: WindowCut[] = openings
      .filter((o) => o.built)
      .map((o) => ({
        id: o.id,
        azimuthDeg: o.azimuthDeg,
        centreY: o.centreY,
        ...scale(o.outerWidth, o.innerWidth),
        outerHeight: o.outerHeight,
        innerHeight: o.innerHeight,
        revealEndRadius: o.revealEndRadius,
        head: o.head,
        barrierAt: o.barrierAt,
        // it IS the passage, so the clash the clip arbitrates does not arise.
        // At these numbers the clip would miss it by 0.27 m anyway — see the
        // measurement on stairBearingClip().
        clipAgainstStairBearing: false,
      }))
    return cuts
  }, [openings, windowCtl.cutWindows, windowCtl.widthScale, windowCtl.flareScale])

  /*
   * THE FINDINGS NOBODY MAY WALK PAST, printed where the person editing the model
   * is looking.
   *
   * Two of them, and both are the same kind of thing: a place where the record is
   * empty or where the record and the model disagree. Neither is repaired here —
   * the repair for both is six questions to the owner (windows.json →
   * openEndsQuestion), and the repair that must NOT be made is turning
   * STAIR.startAzimuthDeg until the disagreement goes away (CLAUDE.md rule 7).
   *
   * It fires on every load as this ships, because all twelve ends are
   * [PLACEHOLDER] and because no passage comes out open at both ends, which is
   * the first case the owner names. That is deliberate: a warning that appears
   * once and then is fixed teaches nothing, and this one is the state of the
   * evidence rather than a bug. Dev only — it is a note to whoever is building
   * the model, not to a visitor.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    for (const line of testimonyConflicts(openings)) {
      console.warn(`[passage openings] ${line}`)
    }
  }, [openings])

  /*
   * AND THE ROOF, which belongs in the same place for the same reason.
   *
   * This one is not a conflict between two statements — it is a hole in the
   * record with a visible consequence: the roof climb's last 1.55 m cannot be
   * roofed by the measured stack, so the cutter takes the parapet ring away over
   * about 50° of arc and the final steps come out under the sky. Whether the
   * building does that is unknown and unknowable from docs/. Printed once per
   * load so that whoever next stands on the deck and sees the breach finds the
   * question already written rather than reaching for a plausible terrace.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.warn(`[roof]\n${ROOF_QUESTION.join('\n')}`)
  }, [])

  const apertures = useMemo(() => buildApertures(windows ?? []), [windows])
  useEffect(() => onApertures(apertures), [apertures, onApertures])

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

  /*
   * The slider's default has to BE the derived value, not a number that happens
   * to look like it. This control is passed straight to the walker, so whatever
   * sits here overrides the component's default — which is how the hand-tuned 26
   * survived every later attempt to reason about the lamp. Range and step follow
   * the derived value so the panel stays useful around it.
   */
  const lampCtl = useControls('Lamp', {
    lamp: true,
    lampIntensity: { value: LAMP.intensity, min: 0, max: LAMP.intensity * 6, step: 0.05 },
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
      {showShell && !cutaway && <EntranceArchivolt material={shellMat} />}
      {showShell && !cutaway && windows && <CourseBands windows={windows} material={shellMat} />}
      {showShell && !cutaway && windows && <WindowGrilles windows={windows} />}
      {showShell && !cutaway && windows && (
        <WindowSurrounds windows={windows} material={shellMat} />
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

      {/*
        The apertures are the SAME array that cuts the shell, not a second
        reading of the data file. buildApertures() used to rebuild each centre
        from floorY + heightAboveFloor while the shell was cutting from the
        photographic fraction, so the beams were drawn through openings a metre
        away from the openings that exist. Both fields are gone now, and so is
        the chance of the two disagreeing again.
      */}
      <SunBeams
        date={date}
        apertures={apertures}
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
  /** The openings the shell was actually cut with; see SceneProps.onApertures. */
  const [apertures, setApertures] = useState<OpeningAperture[]>([])

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
        apertures={apertures}
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
      {/*
        THE SCENE'S WHITE POINT IS DECLARED HERE, and it used not to be.
        These two values were r3f's defaults, never written down, and every light
        in the model was tuned against them by eye: the sun at ~1, the hand lamp
        at 26. That is a fifteenfold spread agreed with nothing, and it is how the
        interior could be blown out while the exterior was correct. Naming them
        does not change a pixel — ACES at exposure 1 is exactly what was running —
        but it makes the reference an intensity is a ratio TO, which is what this
        file asks of every other number. Move the exposure and every light in the
        model moves with it; that is the point of having one.
      */}
      {/*
        `shadows="percentage"` rather than `shadows`, and it changes nothing you
        can see. Bare `shadows` makes r3f ask for PCFSoftShadowMap, which three
        r185 has deprecated: it warns and silently substitutes PCFShadowMap, once
        per frame, so the console filled with a notice about a setting that was
        never taking effect. Asking for PCFShadowMap by name is what the renderer
        is already doing — rule 5 wants the console clean, and a warning nobody
        can act on is how a real one gets missed.
      */}
      <Canvas
        shadows="percentage"
        gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1 }}
        camera={{ position: [36, 24, 36], fov: 50, near: 0.1, far: 600 }}
      >
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
            onApertures={setApertures}
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
