import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Canvas, useFrame } from '@react-three/fiber'
import { ACESFilmicToneMapping, Matrix4 } from 'three'
import { GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Leva, useControls } from 'leva'
import {
  stairSettings,
  PASSAGE_OPENING,
  BUTTRESS,
  ENTRANCE,
  FLOORS,
  ROOF,
  ROOF_QUESTION,
  STAIR,
  STAIR_BEARING_QUESTION,
  TOWER,
  WALL_LIFTS,
  WALL_SHAFT,
  WATER,
  WELL,
  WELL_BEARING_CONFLICT,
  WINDOW_EMBRASURE,
  innerRadiusAt,
} from './config/tower'
import { LAMP, PLAYER } from './config/player'
import { ORBIT } from './config/orbit'
import {
  planAllFlights,
  stairDoorways,
  stairPassageSections,
  stairwellSpanDeg,
  type Winding,
} from './lib/staircase'
import {
  datumWarnings,
  openingsInsideDatumError,
  branchesDeclined,
  passageEndAnchors,
  planPassageBranches,
  planPassageOpenings,
  testimonyConflicts,
  type OpeningFitting,
  type PassageOpening,
} from './lib/passageOpenings'
import { stairhead, stairheadClearance } from './lib/stairhead'
import { chamberDaylight, daylightCensus } from './lib/chamberDaylight'
import { Staircase } from './components/tower/Staircase'
import { ModernSpiralStair } from './components/modern/ModernSpiralStair'
import { SiteAndEntranceStair, OUTDOOR_START } from './components/modern/SiteAndEntranceStair'
import type { StairwellCut } from './components/tower/FloorStructures'
import type { WindowCut } from './lib/towerShell'
import { chaseBreaches, downpipeChases, type DownpipeChase } from './lib/waterSystem'
import { WindowGrilles } from './components/tower/WindowGrilles'
import { WindowSurrounds } from './components/tower/WindowSurrounds'
import { CourseBands } from './components/tower/CourseBands'
import { EntranceArchivolt } from './components/tower/EntranceArchivolt'
import windowData from './data/windows.json'
import { TowerWireframe } from './components/tower/TowerWireframe'
import { TowerShell, type ShellStats } from './components/tower/TowerShell'
import { TowerColliders } from './components/tower/TowerColliders'
import { FloorStructures } from './components/tower/FloorStructures'
import { RoofTerrace } from './components/tower/RoofTerrace'
import { FirstPersonPlayer } from './components/player/FirstPersonPlayer'
import { OrbitView } from './components/player/OrbitView'
import { TouchControls } from './components/player/TouchControls'
import type { Stick } from './lib/touchInput'
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
import { CompactChrome } from './components/ui/CompactChrome'
import { useScreenLayout } from './hooks/useViewport'
import { describeLayout } from './lib/screenLayout'
import { storeyAt } from './lib/visibility'
import {
  frustumPlanes,
  interiorVisibleFromOutside,
  type Plane,
} from './lib/portal'
import { AdaptiveDpr } from './components/perf/AdaptiveDpr'
import { activeDprPolicy } from './config/perf'
import { initialDpr } from './lib/adaptiveDpr'
import { LoadingScreen } from './components/ui/LoadingScreen'
import { HotspotMarkers } from './components/hotspots/HotspotMarkers'
import { HotspotPanel, AttributionScreen } from './components/ui/HotspotPanel'
import { DatumCaveat } from './components/ui/DatumCaveat'
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
  /**
   * The ends the [OSM] trace cannot settle, lifted for the same reason and by the
   * same route as the apertures: the caveat shown to the VIEWER has to describe
   * the openings this Canvas actually cut, and the stair's bearing is a live leva
   * control. Recomputed out there from the config defaults it would eventually
   * name an opening the model no longer has, which is the failure mode a caveat
   * can least afford. See lib/passageOpenings.ts → pierEdgeReading().
   */
  onDatumCaveats: (o: PassageOpening[]) => void
  hotspot: HotspotId | null
  onHotspot: (id: HotspotId | null) => void
  onPerf: (s: PerfSample) => void
  date: Date
  hypothesis: HypothesisId
  firstPerson: boolean
  touchInput: React.RefObject<Stick | null>
  touchLook: React.RefObject<{ dx: number; dy: number }>
  /**
   * The other direction across the `<Canvas>` wall: OrbitView writes its
   * reset-the-framing function in here so the button in the chrome — which is
   * DOM, and outside the canvas — can call it. Null while walking, because the
   * orbit controls are not mounted then and there is nothing to return.
   */
  resetView: React.RefObject<(() => void) | null>
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

function Scene({ onStats, onApertures, onDatumCaveats, onPerf, date, hypothesis, hotspot, onHotspot, firstPerson, touchInput, touchLook, resetView }: SceneProps) {
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
    /*
     * Step 0.1, not 1, since 2026-08-13. The shipped value is no longer a round
     * placeholder — it is BUTTRESS.azimuthDeg + 90, i.e. 196.7 — and a control
     * that snaps to whole degrees cannot be dragged back to the value the config
     * ships. A slider you cannot return to its default is a slider that silently
     * loses the derivation the moment anybody touches it.
     */
    startAzimuthDeg: { value: STAIR.startAzimuthDeg, min: 0, max: 360, step: 0.1, label: 'start az°' },
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
      /*
       * Where the stone stops OVER THE PASSAGE, which is the underside of the
       * terrace paving and not the top of the parapet.
       *
       * This used to be TOWER.topY, and that one substitution is most of the old
       * roof's fault: the cutter believed it had a metre more stone than the
       * building has above the stair, drove the passage up through the parapet
       * ring and opened 50° of it to the sky. The parapet stands 2 m outboard of
       * the passage's outer cheek and the cutter has no business reaching it.
       */
      ROOF.masonryTopY,
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
      /*
       * A flight pierces the slab it LANDS on — and, for 4→6, also the slab it
       * runs PAST. The cut is measured at the pierced storey's own level, not at
       * the one below: taking the radius from beneath put it 0.27 m inside the
       * room face, which is a hole in the floor at the wall rather than a lip
       * over the passage. No inward margin either, for the same reason.
       *
       * THE ROOF IS ONE OF THEM NOW. It used to be excluded here, on the ground
       * that "the deck is not a floor slab and carries no cut" — which was true
       * of the old terrace, where the deck stopped at the room face and the stair
       * came out by tearing the parapet ring open instead. With the paving
       * carried across the wall the roof is a surface like any other and the
       * stair pierces it like any other: roof/007 shows the stainless threshold
       * set flush IN the paving with the treads starting straight behind it.
       *
       * It is keyed at index FLOORS.length, one past the last storey, which is
       * where FloorStructures and RoofTerrace both look for it.
       */
      const pierces = [...lift.opensAtFloorNumbers, lift.toFloorNumber].filter(
        (n) => n >= 1 && n <= FLOORS.length + 1,
      )
      for (const floorNumber of pierces) {
        const onRoof = floorNumber > FLOORS.length
        const piercedY = onRoof ? ROOF.deckY : FLOORS[floorNumber - 1].floorY
        /*
         * THE UNDERSIDE OF THE THING BEING PIERCED, which is what the walker's
         * head actually meets — a floor slab in a storey, a paving course on the
         * roof. They are the same depth today (ROOF.pavingDepth is borrowed from
         * FLOOR_SLAB) and they are not the same number, so they are written
         * separately: the day the terrace gets a measured course of its own, the
         * opening in it follows without anyone remembering to come back here.
         */
        const soffitY = piercedY - (onRoof ? ROOF.pavingDepth : TOWER.floorSlab)
        // for a storey the flight only passes, the opening sits where the flight
        // crosses THAT level, not at the head of the run
        const span = stairwellSpanDeg(
          steps.filter((s) => s.treadY <= piercedY + 1e-9),
          soffitY,
          // the same clear height the vault is cut to — see stairwellSpanDeg()
          PLAYER.stairHeadroom,
        )
        if (!span) continue
        const inner = innerRadiusAt(piercedY) + stair.wallClearance
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
   * THE HEAD-HOUSE over the roof stairwell — the wedge you come out of.
   *
   * Planned here rather than inside RoofTerrace because it takes two things the
   * terrace does not have: the opening in the paving (above) and the LAST
   * FLIGHT'S STEPS, which are what say which end of that opening is the way out.
   * Hard-coding the end would be right for one winding of the stair and would
   * put the apex at the bottom of the flight for the other.
   *
   * Its rake is PLAYER.stairHeadroom — the same clear height the passage is
   * vaulted to under the paving, carried on above it — so the wedge introduces
   * no height of its own. See lib/stairhead.ts for why the soffit is the chord
   * of that and not an offset of the treads, and STAIRHEAD in config/tower.ts
   * for the two dimensions the frames had to supply.
   */
  const roofStairhead = useMemo(() => {
    const flights = flightPlan.flights
    const last = flights[flights.length - 1]
    if (!last) return null
    return stairhead(stairwells[FLOORS.length], last, ROOF.deckY, PLAYER.stairHeadroom)
  }, [flightPlan, stairwells])

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
   *
   * THE HEIGHT IS THE BUILDING'S NOW, not the walker's. It was
   * `PLAYER.height + 0.35` here and at four other call sites, which cut a 2.100 m
   * opening in a wall whose vault sprang at 1.600 — see STAIR.doorwayHeight and
   * CUPOLA_RISE for the measurement that closed it. The leva sliders below still
   * move the stair; nothing on this panel may move the doorway's head, because
   * it is not a modelling choice any more.
   */
  const doorways = useMemo(() => {
    if (!stair.cutStairwells) return undefined
    return stairDoorways(
      flightPlan.flights,
      stair.stairWidth,
      STAIR.doorwayHeight,
      innerRadiusAt,
      LANDING_Y_OF,
      // the same level the passage is clamped to, and for the same reason. It
      // also decides that the roof exit is NOT a doorway: its landing IS the top
      // of the stone, so the stair leaves through the paving instead.
      ROOF.masonryTopY,
      WALL_LIFTS.map((l) => l.opensAtY),
      STAIR.doorwayWidth,
    )
  }, [stair.cutStairwells, flightPlan, stair.stairWidth])

  /**
   * The chase the Ø 30 cm downpipe stands in, one per storey it passes.
   *
   * Photographed: an open rectangular recess through several courses, floor to
   * springing, with the pipe inside it. [ref] has the pipe coming out of the
   * niches, and this is the niche. up/076 is it from inside storey 3.
   *
   * ITS BEARING IS WALL_SHAFT'S, NOT THE WELLHEAD'S, since 2026-08-17. It ran on
   * WELL.azimuthDeg for as long as this model had one bearing for both, which
   * meant the slot could not be anywhere but over the mouth however the footage
   * read. The storey the run STARTS at is still the wellhead's — whatever route
   * the pipe takes at the bottom, both features are on storey 3.
   *
   * Kept as DownpipeChase rather than narrowed to WallChase on the way out: the
   * extra field is which storey each length belongs to, TowerShell has no use
   * for it, and the breach report below cannot name a storey without it.
   */
  const wallChases = useMemo<DownpipeChase[]>(
    () =>
      downpipeChases(
        FLOORS,
        WATER.channelFloorRange,
        WELL.startsAtFloorIndex,
        WALL_SHAFT.azimuthDeg,
        WATER.downpipeDiameter,
      ),
    [],
  )

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

  /**
   * The steps up from each landing into its embrasure.
   *
   * Planned off `openings` — the same array the holes are cut from — so a branch
   * cannot be given a bearing, a cheek or a height the reveal above it does not
   * have. It rides ON the WindowCut for the same reason; see WindowCut.branch.
   */
  const branches = useMemo(
    () =>
      planPassageBranches({
        openings,
        atEnds: PASSAGE_OPENING.branchAtEnds,
        stepCount: PASSAGE_OPENING.branchSteps,
        going: WINDOW_EMBRASURE.going,
        outerLeaf: WINDOW_EMBRASURE.outerLeaf,
        outerRadius: TOWER.outerRadius,
      }),
    [openings],
  )

  const windows = useMemo<WindowCut[] | undefined>(() => {
    if (!windowCtl.cutWindows) return undefined
    const scale = (outer: number, inner: number) => {
      const o = outer * windowCtl.widthScale
      return { outerWidth: o, innerWidth: o + (inner - outer) * windowCtl.flareScale }
    }
    const branchOf = new Map(branches.map((b) => [b.id, b]))
    const cuts: WindowCut[] = openings
      .filter((o) => o.built)
      .map((o) => {
        const b = branchOf.get(o.id)
        return {
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
          branch: b && {
            landingY: b.landingY,
            stepCount: b.stepCount,
            riser: b.riser,
            going: b.going,
          },
        }
      })
    return cuts
  }, [openings, branches, windowCtl.cutWindows, windowCtl.widthScale, windowCtl.flareScale])

  /*
   * THE FINDINGS NOBODY MAY WALK PAST, printed where the person editing the model
   * is looking.
   *
   * A place where the record is empty, or where the record and the model
   * disagree. Not repaired here — the repair is six questions to the owner
   * (windows.json → openEndsQuestion), and the repair that must NOT be made is
   * turning STAIR.startAzimuthDeg until a disagreement goes away (rule 7).
   *
   * ONE OF ITS TWO LINES WENT QUIET ON 2026-08-13, and the note is kept rather
   * than trimmed because the quiet is the news. Until then this also printed "no
   * passage has an opening at both ends", which contradicted [OWNER] 2026-08-10
   * and which no answer of his could have repaired. The stair moved a quarter
   * turn on his own testimony about the beak and three passages came out open at
   * both ends. The warning was not silenced; it stopped being true.
   *
   * What still fires on every load is the census: all twelve ends are
   * [PLACEHOLDER] and the daylight check is standing in for every one of them.
   * That is deliberate — a warning that appears once and is then fixed teaches
   * nothing, and this one is the state of the evidence rather than a bug. Dev
   * only: it is a note to whoever is building the model, not to a visitor.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    for (const line of testimonyConflicts(openings)) {
      console.warn(`[passage openings] ${line}`)
    }
    /*
     * A branch the record asks for and the stone refuses. Nothing declines one
     * at the shipped numbers, and printing it anyway is the point: the depth is
     * fitted to the wall outboard of each cheek, so a change to the going, the
     * step count or the stair's bearing can start taking branches away, and it
     * must not do it in silence.
     */
    const declined = branchesDeclined(openings, PASSAGE_OPENING.branchAtEnds, branches)
    if (declined.length > 0) {
      console.warn(`[branch] no room for steps at: ${declined.join(', ')}`)
    }
    const cut = branches.filter((b) => b.depthLimitedByWall).map((b) => b.id)
    if (cut.length > 0) {
      console.warn(`[branch] the wall, not the flight, set the going at: ${cut.join(', ')}`)
    }
  }, [openings, branches])

  /**
   * HOW MANY ROOMS YOU CAN SEE DAYLIGHT FROM, swept rather than assumed.
   *
   * It belongs beside testimonyConflicts() and it is the same KIND of thing: a
   * large claim about the building that the model was making in silence. With
   * every opening at the end of a stair passage, a chamber sees out only where
   * its doorway and a slit overlap in bearing — and at one storey of eight they
   * do not overlap at all. It was four of eight until 2026-08-17, and three of
   * those four were a sign in approachAzimuthDeg() rather than the building; the
   * one that remains is storey 5, reached from the middle of a flight, and no
   * turn of the stair reaches it.
   *
   * Live, off the leva sliders, not off the config: turn Staircase → start az°
   * and watch the census move. That is the point of printing it here rather than
   * only asserting it in chamberDaylight.test.ts — the test says what the shipped
   * tower does, this says what the tower on screen does.
   */
  const chambers = useMemo(
    () =>
      doorways
        ? chamberDaylight({
            floors: FLOORS,
            doorways,
            openings,
            entrance: {
              azimuthDeg: ENTRANCE.azimuthDeg,
              width: ENTRANCE.width,
              height: ENTRANCE.height,
              thresholdY: ENTRANCE.thresholdY,
            },
            buttress: BUTTRESS,
            buttressTopY: Math.min(ENTRANCE.groundY - 0.5 + TOWER.height, TOWER.topY),
            outerRadius: TOWER.outerRadius,
            eyeHeight: PLAYER.eyeHeight,
          })
        : [],
    [doorways, openings],
  )

  useEffect(() => {
    if (!import.meta.env.DEV || chambers.length === 0) return
    for (const line of daylightCensus(chambers)) console.warn(`[daylight] ${line}`)
  }, [chambers])

  /*
   * THE ENDS THE [OSM] TRACE CANNOT DECIDE, on a channel of their own.
   *
   * head-6-7 clears the pier's traced edge by 19 mm against a tracing whose own
   * nodes scatter 30 mm, so the model cuts a window on a quantity smaller than
   * the noise of the thing it was measured against. The decision this makes
   * visible — cut it, and stop calling it a fact — is argued in
   * lib/passageOpenings.ts → pierEdgeReading().
   *
   * It is a SECOND report beside testimonyConflicts() rather than another line in
   * it, and the reason is that the other one must be able to fall silent: every
   * line in it is retired by the owner answering a question, and a test asserts
   * that it goes quiet when all twelve ends are ruled on. Nothing he could say
   * retires this one — he is not the person who can place the beak's root to a
   * fifth of a degree. Only a survey is.
   *
   * DEV-gated, like every other warning here, because it is addressed to whoever
   * is editing the model.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    for (const line of datumWarnings(openings)) console.warn(`[datum] ${line}`)
  }, [openings])

  /*
   * AND THE ONE THAT GOES THE OTHER WAY — OUT TO THE VISITOR AND NOT TO ME.
   *
   * The same finding, lifted out of the Canvas to the caveat in the interface.
   * NOT gated on DEV, and that is the whole point of it: a person walking that
   * passage is looking at a window that may not be there, and a console line does
   * not reach them. src/components/ui/DatumCaveat.tsx.
   */
  useEffect(
    () => onDatumCaveats(openingsInsideDatumError(openings)),
    [openings, onDatumCaveats],
  )

  /*
   * AND THE TWO FAULTS HE NAMED WITHOUT CORRECTING, which are questions and not
   * conflicts, and which would otherwise exist only as JSON nobody opens.
   *
   * [OWNER] 2026-08-13: the shape of the openings' heads is wrong, and the sill
   * height above the landing is wrong. He did not say what either should be, so
   * neither value has been touched — the heads are still [PHOTO]-from-one-frame
   * and the sill is still a 0.30 m constructional rule with no source at all.
   * Printed for the same reason as the roof: a question nobody is looking at is
   * not open, it is lost.
   *
   * `ask`, NOT `note`, and the difference is the whole point. The notes run to
   * forty lines apiece; printed in full beside ROOF_QUESTION they put a hundred
   * lines of prose in the console on every load, and a wall of text is read
   * exactly as often as no text at all. What prints is the fault, the current
   * value, the question verbatim in Russian, and where the argument lives.
   *
   * THE THIRD ONE JOINED THEM LATER THE SAME DAY and it is the largest of the
   * three. Shown the reference frame in the comparison panel with the slits
   * circled, he said the windows stand to the LEFT of the beak «в таком вот
   * распорядке и отдалении друг от друга» — endorsing the photographed
   * arrangement and spacing, which the model contradicts by nine openings
   * against eight, 97° of column separation against 35, and six openings that
   * cannot be seen from in front of the beak at any distance. Measured in
   * windows.json → photographicLadder.remeasured and modelAsBuilt; candidates in
   * → reconciliation; nothing geometric touched. It asks about the BUILDING —
   * how far round from the beak the windows stand — and not about a parameter.
   *
   * AND A FOURTH, WHICH IS THE SAME EVIDENCE MEASURED RUNG BY RUNG. Fitting the
   * drum's top rim arc rather than assuming a camera distance closes the vertical
   * half of that disagreement — down from the crown in drum radii the photographed
   * ladder and the model's landings agree to half a metre — and sharpens the
   * horizontal half: the bearing does not drift between the two columns, it steps
   * 43° in the single rung between storey 4 and storey 5. That is the storey he
   * himself calls exceptional, so the question is about the STAIR and not the
   * windows. windows.json → photographedPattern and → sectorStepQuestion.
   *
   * SO BY THE END OF 2026-08-13 THIS EFFECT PRINTED FOUR WALLS OF RUSSIAN ON EVERY
   * LOAD, and the comment above it argues, correctly, that a wall of text is read
   * exactly as often as no text at all. It had become the thing it was written to
   * prevent. What prints now is windows.json → askInThisOrder: ONE question first,
   * in one sentence, then the queue behind it, each item naming the block that
   * holds its argument. The four `ask` blocks are not deleted and not shortened —
   * they are where a reader goes after the index sends them there.
   *
   * THE ORDER IS NOT ARBITRARY AND IT CHANGED TODAY. First is which end of each
   * passage carries a window, which used to be fourth. Measuring the frames rung by
   * rung found that NO TWO SLITS SHARE A HEIGHT, and stacked flights pierced at both
   * ends cannot produce that — so six sentences from him settle the count, the
   * pairing and the shape of the disagreement at once, at no cost in invention.
   * windows.json → reconciliation → one-end-per-passage.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const q = windowData.askInThisOrder
    if (q.answered !== null) return
    console.warn(
      `[openings — спросить в этом порядке]\n${[
        ...q.theQuestion,
        '',
        ...q.thenTheseFive,
        '',
        ...q.andTwoFaultsYouNamedWithoutCorrecting,
      ].join('\n')}`,
    )
  }, [])

  /*
   * AND THE ROOF, which belongs in the same place for the same reason.
   *
   * This one is not a conflict between two statements — it is a hole in the
   * record with a visible consequence: the roof climb's last 1.55 m cannot be
   * roofed by the measured stack, so the cutter takes the parapet ring away over
   * about 50° of arc and the final steps come out under the sky.
   *
   * [2026-08-14] THE SHAPE IS NO LONGER UNKNOWN AND THE QUESTION SHRANK TO ONE
   * NUMBER. His roof footage shows the paving crossing the whole wall to a thin
   * parapet on the outer edge, the parapet unbroken, and the stair arriving at
   * deck level through a door under a modern head-house. So the breach is a known
   * defect now, and what is printed is the last thing missing: how thick the
   * parapet is.
   *
   * [2026-08-14, later the same day] AND THAT NUMBER WAS MEASURED, off the same
   * footage, without asking him: 0.75 m with a 0.55…0.95 bracket. So this is no
   * longer a question at all. It stays printed because the model still BUILDS the
   * old terrace — the deck stopping at the room face under a 3.733 m ring, and
   * fault A entire — and whoever next stands on the deck and sees the breach
   * should find the instruction for closing it already written rather than reach
   * for a plausible terrace.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    /*
     * THE HEAD-HOUSE'S TIGHTEST POINT, printed with the roof note and not left
     * where only a test can see it. The wedge's rake is a chord, so the clear
     * height under it is least over the last riser; that number is what decides
     * whether a visitor can walk out, and it moves the moment anybody touches
     * the riser, the headroom or the opening.
     */
    const tight =
      roofStairhead && flightPlan.flights.length > 0
        ? stairheadClearance(roofStairhead, flightPlan.flights[flightPlan.flights.length - 1])
        : null
    const head = tight
      ? [
          '',
          `HEAD-HOUSE clear height: least ${tight.minimum.toFixed(3)} m over the tread at`,
          `azimuth ${tight.azimuthDeg.toFixed(1)}, against a ${PLAYER.height.toFixed(2)} m walker.`,
        ]
      : []
    console.warn(`[roof]\n${[...ROOF_QUESTION, ...head].join('\n')}`)
  }, [roofStairhead, flightPlan])

  /*
   * AND THE ONE THAT MOVES EVERY AZIMUTH IN THE PROJECT, printed last so it is
   * the line still on screen.
   *
   * [2026-08-14] The footage falsified an opening outright. head-3-4 is placed
   * at azimuth 105.5 facing 10.64 m of pier and withheld as blind; up/098 and
   * down/138 show a pointed window there with a road, a car park and people
   * under it. Three of the four candidate causes are excluded — the buttress
   * bearing by arithmetic, the chamber-wall reading by the descent sequence, the
   * stacked layout by there being no source for a per-flight bearing — and the
   * quarter turn of 2026-08-13 is what gives.
   *
   * NOTHING WAS TURNED, which is why this prints. The size of the correction is
   * bounded by the model's own arithmetic and measured by one photograph, and
   * those are different kinds of statement; picking a value from them is his
   * call, not this repository's, because the number carries every other opening
   * with it. The conflict itself also prints, one line above, out of
   * testimonyConflicts() — the record now says this end is open and the geometry
   * still says it is blind, and that pair is the finding.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.warn(`[stair bearing]\n${STAIR_BEARING_QUESTION.join('\n')}`)
  }, [])

  /*
   * AND THE WELL, WHICH IS THE SAME KIND OF THING AS THE OPENINGS AND NOT THE
   * SAME KIND AS THE ROOF: a conflict between a witness and the geometry, with
   * both halves standing.
   *
   * [OWNER] 2026-08-17 separated the wellhead from the slot in the wall, and the
   * model now carries two bearings where it carried one. That paid the whole of
   * the stair bill this block used to print — the live measurement below has
   * been empty since — and left a 6.23 m junction across storey 3 by a route
   * nobody has measured. The report says both.
   *
   * THE LIST IS COMPUTED, NOT QUOTED, and the silent case is the point. Every
   * figure in WELL_BEARING_CONFLICT is the shipped configuration's; chaseBreaches()
   * re-derives them here from the LIVE flight plan, so turning the stair in the
   * leva panel changes the report on the spot. It went silent the day the split
   * landed, which is exactly what it was built to be able to do — a report that
   * can only ever grow is a report nobody believes when it shrinks.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const breaches = chaseBreaches(
      wallChases,
      flightPlan.tubes.map((sections, i) => ({
        label: `${WALL_LIFTS[i].fromFloorNumber}→${WALL_LIFTS[i].toFloorNumber}`,
        sections,
      })),
      innerRadiusAt,
    )
    console.warn(
      `[well]\n${[
        ...WELL_BEARING_CONFLICT,
        '',
        breaches.length === 0
          ? `ЖИВОЙ ЗАМЕР при устье ${WELL.azimuthDeg}° / штрабе ${WALL_SHAFT.azimuthDeg}° и текущей ` +
            'лестнице: штраба не задевает ни один проход.'
          : `ЖИВОЙ ЗАМЕР при штрабе ${WALL_SHAFT.azimuthDeg}° и текущей лестнице — ${breaches.length}:`,
        ...breaches.map(
          (b) =>
            `  ярус ${b.floorIndex + 1} × проход ${b.passage}: ${b.overlapDeg.toFixed(2)}° внутрь, ` +
            `${b.biteMetres.toFixed(3)} м в перемычку, y ${b.bottomY.toFixed(2)}–${b.topY.toFixed(2)}`,
        ),
      ].join('\n')}`,
    )
  }, [wallChases, flightPlan])

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
  /**
   * Whether anything of the interior stack is reachable by an eye where the
   * camera is. Starts true: until a frame has been measured, the safe answer to
   * "can this be seen" is yes.
   */
  const [interiorInSight, setInteriorInSight] = useState(true)

  /*
   * Phase-11 spec: the optimisation must be measurable and switchable, so the
   * before/after can be compared rather than asserted.
   *
   * ONE SWITCH, TWO CULLS, and they are not the same size. Inside the tower it
   * is the storey window of lib/visibility.ts, measured at nought to two draw
   * calls because three.js frustum-culls the neighbours already. Outside it is
   * the portal test of lib/portal.ts, measured at 27 draw calls and 9 664
   * triangles in the default view. The second is the one worth switching off to
   * see; the first is kept because it costs nothing and states something true
   * about the building.
   */
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
        Whether the eight floors and eight vaults inside the drum can be seen at
        all from where the camera is standing. Measured cost of getting this
        wrong in the cheap direction — drawing them when they are sealed behind
        4 m of stone — is 23 draw calls and 9 408 triangles every frame in the
        view the visitor lands on. See lib/portal.ts for why the test is the
        SUN's test run backwards, and for the two draw calls the addendum's own
        proposal turned out to be worth.
      */}
      <InteriorSightTracker
        enabled={!firstPerson && !cutaway && showShell && !water.xrayWalls && perf.cullStoreys}
        apertures={apertures}
        onChange={setInteriorInSight}
      />

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
          stairhead={roofStairhead}
        />
      )}

      <FloorStructures
        visible={interiorInSight}
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
        The terrace goes with the SHELL's material, not the interior's: it is the
        top of the drum seen from outside, in the same sunlight as the coping
        beside it. It is drawn in the cutaway too — the cutaway removes the wall
        so you can see the storeys, and a roof hanging over them is exactly what
        that view is for.
      */}
      <RoofTerrace
        stairwells={stairwells}
        material={shellMat}
        showBalustrade={showShell}
        stairhead={roofStairhead}
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
        <OrbitView resetRef={resetView} />
      )}
    </>
  )
}

export default function App() {
  const { t } = useTranslation('ui')

  /**
   * WHICH LAYOUT THIS SCREEN GETS, and it is one decision made in one place.
   *
   * `docked` is the layout that has always shipped: the sun panel in one bottom
   * corner, the versions in the other, the caveat between them, the controls in
   * the top corners. It is unchanged and it is what a desktop still gets.
   *
   * `compact` is the same interface with one bar along the bottom and one panel
   * raised at a time. It is not a second app and it does not have a component of
   * its own for anything: the scrubber, the version switcher and the caveat in
   * it are the very same bodies the docked panels render.
   *
   * The choice is lib/screenLayout.ts → layoutModeOf(), which decides on the
   * panels' own widths and on whether the pointer is a finger. See the comment
   * on DOCKED_MIN_WIDTH for why the threshold is 1278 and not a round number.
   */
  const screen = useScreenLayout()
  const compact = screen.mode === 'compact'

  const [stats, setStats] = useState<ShellStats | null>(null)
  /** The openings the shell was actually cut with; see SceneProps.onApertures. */
  const [apertures, setApertures] = useState<OpeningAperture[]>([])
  /** Ends the [OSM] trace cannot settle; see SceneProps.onDatumCaveats. */
  const [datumCaveats, setDatumCaveats] = useState<PassageOpening[]>([])

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
  /**
   * THE PIXEL RATIO LIVES HERE, NOT INSIDE THE CANVAS, and it has to.
   *
   * r3f re-applies the `dpr` prop on every render of `<Canvas>` — configure()
   * compares the live viewport ratio with the prop and resets it when they
   * differ — and this component re-renders about once a second, because
   * PerfProbe hands the HUD a sample that often. A controller that called
   * setDpr() from inside the canvas would therefore have its decision undone
   * within the second, silently, and only on the machines slow enough to have
   * made it. So the ratio is state up here, the prop reads it, and
   * <AdaptiveDpr> asks rather than sets.
   *
   * The opening value is the CAP, written down: config/perf.ts. It is the same
   * number r3f's own `dpr={[1,2]}` default was already producing — verified in
   * the browser with devicePixelRatio forced to 3, drawing buffer 750×1624 for
   * a 375×812 box — so naming it changes no pixel and makes a dependency bump
   * unable to change one either.
   */
  const [dpr, setDpr] = useState(() =>
    initialDpr(typeof window === 'undefined' ? 1 : window.devicePixelRatio, activeDprPolicy()),
  )
  /**
   * The touch stick's deflection, or null when no thumb is down. Held here
   * rather than in either component because BOTH ends need it and neither owns
   * it: TouchControls writes the thumb into it and FirstPersonPlayer reads it on
   * the frame, and a ref is what carries a value between them without a render
   * per touch sample.
   */
  const touchInput = useRef<Stick | null>(null)
  const touchLook = useRef({ dx: 0, dy: 0 })
  /** Filled in by OrbitView while the orbit camera is mounted; see SceneProps. */
  const resetView = useRef<(() => void) | null>(null)
  /** The canvas element, for the touch layer to listen on. See <Canvas ref>. */
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)

  /**
   * Diagnostic overlays, per docs/optimization-addendum.md:
   * F3 — the budget readout, F4 — a wireframe of every collider over the visuals,
   * so the gap between what is drawn and what is collided against is visible.
   *
   * THE KEYS STAY IN THE PRODUCTION BUILD; THE DEFAULT DOES NOT. F3 opened the
   * budget readout on load for everybody, which is the right default for the
   * person building the tower and the wrong one for the person being shown it:
   * the first thing a visitor met was a frame-time counter in the corner of a
   * museum. Anyone who wants it still presses F3 and gets it, which is what the
   * README has always promised; nobody is greeted by it.
   */
  const [showPerf, setShowPerf] = useState(import.meta.env.DEV)
  const [showColliders, setShowColliders] = useState(false)

  /*
   * WHAT THE CHROME COVERS, SAID OUT LOUD ON EVERY LOAD, in the same voice as
   * every other finding in this file.
   *
   * The number this reports is the one the rework exists to move: 66.5% of a
   * 375×812 phone before, in the state a visitor MEETS — the bar up, the caveat
   * showing, nothing raised. It is computed from the constants the components
   * lay out with, so it cannot drift away from the interface without the
   * interface changing; and it prints on a resize as well as on load, which is
   * how the threshold between the two layouts can be watched rather than
   * believed. Dev only: it is addressed to whoever is editing the interface.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.warn(
      `[layout] ${describeLayout(screen.viewport, {
        notice: datumCaveats.length > 0,
        hint: false,
        sheetOpen: false,
      })}`,
    )
  }, [screen.viewport, datumCaveats.length])

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
      {/*
        THE PANEL IS A TUNING RIG, AND IT WAS SHIPPING TO THE PUBLIC SITE.
        Not merely untidy: these sliders move STAIR.startAzimuthDeg, the winding,
        CUPOLA_RISE, the oculus multiplier — every number this project argues
        about. A visitor who opens the panel and drags one is looking at a tower
        that no longer matches a single sentence the app says about it, with no
        indication that anything has changed. The app's whole claim is that the
        geometry is traceable to a source; a public control that silently breaks
        the trace is worse than an ugly overlay.

        `hidden` removes the panel, NOT the controls: useControls still registers
        every key and still returns its default, so the built geometry is
        identical either way — measured, 19,402 shell triangles before and after.
      */}
      <Leva collapsed hidden={!import.meta.env.DEV} />
      {showPerf && (
        <PerfHud
          sample={perf}
          baseline={perfBaseline}
          dpr={dpr}
          onCapture={() => setPerfBaseline(perf)}
          onClear={() => setPerfBaseline(null)}
        />
      )}

      {/*
        The two full-screen things are the same in both layouts — they already
        take the whole screen, so there is no corner for them to be pinned to.
        `compact` changes how they are laid out INSIDE, not where they are: the
        photograph and the model's account of it stack instead of standing side
        by side, and the close button grows to a thumb's size.
      */}
      <HotspotPanel selected={hotspot} onClose={() => setHotspot(null)} compact={compact} />
      <AttributionScreen
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        compact={compact}
      />

      {compact ? (
        <CompactChrome
          viewport={screen.viewport}
          orientation={screen.orientation}
          firstPerson={firstPerson}
          onToggleFirstPerson={() => setFirstPerson((v) => !v)}
          onResetView={() => resetView.current?.()}
          date={date}
          live={liveClock}
          onDate={(d) => {
            setLiveClock(false)
            setDate(d)
          }}
          onResumeLive={() => {
            setLiveClock(true)
            setDate(new Date())
          }}
          apertures={apertures}
          hypothesis={hypothesis}
          onHypothesis={setHypothesis}
          datumCaveats={datumCaveats}
          onCredits={() => setCreditsOpen(true)}
          onEnterXR={xr.enter}
          xrLoading={xr.loading}
        />
      ) : (
        <>
          <LanguageSwitcher />
          <HypothesisPanel selected={hypothesis} onSelect={setHypothesis} />
          <DatumCaveat openings={datumCaveats} />

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
            {/*
              The way back. Only while orbiting: in walk mode these controls are
              not mounted and the walker has his own way out, which is the door.
            */}
            {!firstPerson && (
              <button onClick={() => resetView.current?.()} style={secondaryButton}>
                {t('resetView')}
              </button>
            )}
            <button onClick={() => setCreditsOpen(true)} style={secondaryButton}>
              {t('credits')}
            </button>
            <button onClick={xr.enter} disabled={xr.loading} style={secondaryButton}>
              {xr.loading ? '…' : t('vrMode')}
            </button>
          </div>

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
        </>
      )}

      {firstPerson && (
        <TouchControls
          canvas={canvas}
          stickRef={touchInput}
          lookRef={touchLook}
          /*
            The two full-screen overlays, and the reason the touch layer has to
            be told about them at all is that ONE of them is opened by touching
            the building: a hotspot marker is on the canvas, so the touch
            layer's own rule — a press whose target is not the canvas ends the
            walk — cannot see it. The credits are reached from a button and are
            already covered by that rule; they are named here anyway so the
            condition reads as "a panel is over the canvas" rather than as a
            list of exceptions.
          */
          coveredByPanel={hotspot !== null || creditsOpen}
        />
      )}

      {/*
        The CSG triangle count is a build diagnostic — it is how a run of this
        file tells you whether a cut went degenerate — and it stood in the same
        bottom-left corner as the F3 readout, at a lower z-index, so on the
        public build the two overlapped. It says nothing to a visitor that it
        does not say better in the console of a dev run.
      */}
      {import.meta.env.DEV && stats && (
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
        /*
         * The canvas element itself, held in state rather than a ref, because
         * TouchControls listens on it: a ref would be read once by an effect
         * that never re-runs, and a callback ref that sets state cannot be
         * mounted in the wrong order relative to its reader.
         */
        ref={setCanvas}
        shadows="percentage"
        dpr={dpr}
        gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1 }}
        camera={{ position: ORBIT.opening.position, fov: 50, near: 0.1, far: 600 }}
      >
        <AdaptiveDpr onRatio={setDpr} />
        {/* Physics is here from Phase 4 so the steps carry colliders; the
            first-person controller that walks on them arrives in Phase 6. */}
        {/* Physics runs only in walk mode: colliders and the solver cost
            nothing while you are inspecting the model from outside. */}
        <Suspense fallback={null}>
        <MaybeXR session={xr.session}>
        {/* debug draws rapier's own collider wireframes — the actual shapes, not a guess */}
        {/*
          `timeStep="vary"` — one physics step per rendered frame, at that
          frame's own delta, instead of rapier's default 1/60 accumulator.

          THE DEFAULT WAS COSTING THE WALKER HIS SPEED, and the arithmetic is
          exact. FirstPersonPlayer integrates against the RENDER delta and hands
          rapier a POSITION through setNextKinematicTranslation, not an
          increment. Under the accumulator, a frame that arrives before the
          accumulator has reached 1/60 computes a target and then has it
          overwritten by the next frame's, computed from the same unchanged
          body: that movement is not deferred, it is deleted. Measured on the
          flat floor of storey 1, 2 s of model time, nominal 1.4 m/s:

            render Hz   30     60     90     120    144    240
            covered     2.66   2.78   1.87   1.40   1.17   0.70  m
            actual      1.33   1.39   0.93   0.70   0.58   0.35  m/s
            frames that moved nothing at all — 0%, 0%, 33%, 50%, 58%, 75%

          That is 1.4 × min(1, 60/renderHz). ON A 144 Hz SCREEN THE TOWER IS
          CROSSED 2.4 TIMES SLOWER THAN IT WAS BUILT TO BE, and three frames in
          five show a camera that has not moved since the last one — which is
          the second half of what «трясёт» describes: not a wobble, a stutter.
          Even at a nominal 60 Hz the jitter in rAF makes the accumulator skip
          and double at random, so the stutter is there too, just sparser.

          NOTHING IS GIVEN UP. A fixed step exists to keep DYNAMICS stable, and
          this world has no dynamics: every rigid body in the model is `fixed`
          except the walker's own capsule, which is kinematicPosition and is
          therefore not simulated at all — it is placed. A character controller
          is a variable-timestep integrator already; the accumulator underneath
          it was only ever a beat frequency. A stalled frame still cannot
          teleport anyone: the controller clamps its own delta to 1/30 before
          asking for anything (FirstPersonPlayer), so the request is bounded
          whatever the step is.
        */}
        <Physics paused={!firstPerson} debug={showColliders} timeStep="vary">
          <Scene
            onStats={setStats}
            onApertures={setApertures}
            onDatumCaveats={setDatumCaveats}
            onPerf={setPerf}
            date={date}
            hypothesis={hypothesis}
            hotspot={hotspot}
            onHotspot={setHotspot}
            firstPerson={firstPerson}
            touchInput={touchInput}
            touchLook={touchLook}
            resetView={resetView}
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

/**
 * Reports whether the interior stack can be seen from where the camera is.
 *
 * Runs only outside walk mode: from inside the tower the answer is always yes,
 * and the storey window in lib/visibility.ts is what applies there. It costs six
 * plane extractions and one test per opening — under 10 µs against the 23 draw
 * calls it removes — and it reports only on a change, so the tree re-renders
 * when the answer flips and not once a frame.
 *
 * THE DOORWAY IS PASSED SEPARATELY from the slits and is tested only for which
 * way it faces. ENTRANCE has a measured outer width and height and no surveyed
 * inner dimension at all, and inventing one to run it through the reveal test
 * would make the test stricter than the doorway is — which is the direction that
 * puts a hole in the model. See ENTRANCE_ADMITS_SIGHT in lib/portal.ts.
 */
function InteriorSightTracker({
  enabled,
  apertures,
  onChange,
}: {
  enabled: boolean
  apertures: OpeningAperture[]
  onChange: (visible: boolean) => void
}) {
  const last = useRef<boolean | null>(null)
  const planes = useRef<Plane[]>([])
  const vp = useRef(new Matrix4())
  useFrame(({ camera }) => {
    if (!enabled) {
      if (last.current !== true) {
        last.current = true
        onChange(true)
      }
      return
    }
    vp.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    planes.current = frustumPlanes(vp.current.elements)
    const visible = interiorVisibleFromOutside(camera.position, planes.current, apertures, {
      // the beak counts as building: see hullRadius in lib/portal.ts
      hullRadius: TOWER.outerRadius + BUTTRESS.projection,
      bottomY: TOWER.groundY,
      topY: TOWER.topY,
      entrance: {
        azimuthDeg: ENTRANCE.azimuthDeg,
        centreY: ENTRANCE.thresholdY + ENTRANCE.height / 2,
        outerRadius: TOWER.outerRadius,
        width: ENTRANCE.width,
        height: ENTRANCE.height,
      },
    })
    if (visible !== last.current) {
      last.current = visible
      onChange(visible)
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
