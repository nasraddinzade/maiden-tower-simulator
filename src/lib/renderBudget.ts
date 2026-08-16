/**
 * Render budget (Phase 11).
 *
 * Builds the real geometry in Node and counts it, so the cost of the model is a
 * number that can be asserted in CI rather than a figure read off a HUD once.
 * That matters for the 30 fps Android target: a future change that quietly
 * doubles the triangle count should fail the test, not the phone.
 *
 * A KNOWN BLIND SPOT, recorded so nobody cites a green budget as proof of
 * something it never looked at: this counts cupolas, floors, the stair and the
 * water system. It does NOT count the window grilles, the dressed surrounds, the
 * course bands, or anything else built per OPENING. Going from nine openings to
 * six on 2026-08-10 therefore passed the ceilings in silence, and so did the
 * seventh cut leaving the shell when the arched window was withdrawn later the
 * same day — and so would going from six to thirteen. The count is now
 * downstream of a
 * [PLACEHOLDER] that the owner is expected to answer end by end (windows.json →
 * openEndsQuestion), so it is going to move again. Add those parts here before
 * the opening count is used to argue about performance either way.
 */

import * as THREE from 'three'
import { cupolaProfile, effectiveOpeningRadius } from './cupola'
import { landingPaving, planAllFlights, stairPassageSections } from './staircase'
import { channelRings } from './waterSystem'
import { isStoreyVisible, lodSegments } from './visibility'
import { FLOORS, ROOF, STAIR, TOWER, WALL_LIFTS, WATER, innerRadiusAt } from '../config/tower'
import { PLAYER } from '../config/player'

export interface BudgetOptions {
  /** Storey the viewer is on. */
  viewerStorey?: number
  /** Skip the storey window (the outside view draws everything). */
  showAll?: boolean
  /** Full radial resolution before LOD reduction. */
  radialSegments?: number
  profileSegments?: number
}

export interface RenderBudget {
  /** Distinct meshes — a lower bound on draw calls. */
  meshes: number
  triangles: number
  /** Broken down, so a regression can be traced to a part. */
  byPart: Record<string, { meshes: number; triangles: number }>
}

const triCount = (g: THREE.BufferGeometry): number =>
  g.index ? g.index.count / 3 : g.attributes.position.count / 3

/**
 * Cost of the tower's interior structures for a given viewpoint.
 *
 * The shell is excluded: it is one CSG mesh whose cost does not change with the
 * viewer, and it is already measured separately by buildShellGeometry's stats.
 */
export function interiorRenderBudget(options: BudgetOptions = {}): RenderBudget {
  const viewerStorey = options.viewerStorey ?? 0
  const showAll = options.showAll ?? true
  const full = options.radialSegments ?? 64
  const profileSegments = options.profileSegments ?? 20

  const byPart: RenderBudget['byPart'] = {
    cupolas: { meshes: 0, triangles: 0 },
    floors: { meshes: 0, triangles: 0 },
    stair: { meshes: 0, triangles: 0 },
    water: { meshes: 0, triangles: 0 },
  }

  for (const f of FLOORS) {
    if (!isStoreyVisible(f.index, viewerStorey, { showAll })) continue
    const segments = lodSegments(f.index, viewerStorey, full)
    const profile = lodSegments(f.index, viewerStorey, profileSegments, 5)

    // cupola
    const springY = f.ceilingY - TOWER.cupolaRise
    const span = innerRadiusAt(springY)
    const oculus = effectiveOpeningRadius(f.oculusRadius, span)
    const cupolaPts = cupolaProfile(span, oculus, TOWER.cupolaRise, profile).map(
      (p) => new THREE.Vector2(p.r, p.y),
    )
    const cupola = new THREE.LatheGeometry(cupolaPts, segments)
    byPart.cupolas.meshes += 1
    byPart.cupolas.triangles += triCount(cupola)
    cupola.dispose()

    // floor slab
    let slab: THREE.BufferGeometry
    if (f.hasFloorOpening) {
      const hole = effectiveOpeningRadius(f.oculusRadius, f.innerRadiusAtLevel)
      slab = new THREE.LatheGeometry(
        [
          new THREE.Vector2(hole, 0),
          new THREE.Vector2(f.innerRadiusAtLevel, 0),
          new THREE.Vector2(f.innerRadiusAtLevel, -TOWER.floorSlab),
          new THREE.Vector2(hole, -TOWER.floorSlab),
          new THREE.Vector2(hole, 0),
        ],
        segments,
      )
    } else {
      slab = new THREE.CylinderGeometry(
        f.innerRadiusAtLevel,
        f.innerRadiusAtLevel,
        TOWER.floorSlab,
        segments,
      )
    }
    byPart.floors.meshes += 1
    byPart.floors.triangles += triCount(slab)
    slab.dispose()
  }

  // The stair is one InstancedMesh: one draw call however many treads.
  const flights = planAllFlights(
    STAIR,
    WALL_LIFTS,
    innerRadiusAt,
  )
  /*
   * The paving counts too. Staircase.tsx draws the landings' floor slabs into
   * the same buffer as the treads and out of the same wedge maker, so a slab
   * costs exactly what a tread costs; leaving them out would understate the
   * stair by a third and let the one part of it that grew this week grow
   * unwatched. See landingPaving().
   */
  const tubes = stairPassageSections(
    flights,
    STAIR.width,
    PLAYER.stairHeadroom,
    innerRadiusAt,
    ROOF.masonryTopY,
    undefined,
    STAIR.doorwayWidth,
  )
  const stepCount = flights
    .filter((f) => f.length > 0)
    .reduce((n, f, i) => n + f.length + landingPaving(f, tubes[i] ?? []).length, 0)
  byPart.stair.meshes = 1
  byPart.stair.triangles = stepCount * 12 // a box is 12 triangles

  // Water: one torus per collecting ring, plus shaft, downpipe and buried runs.
  const rings = channelRings(FLOORS, WATER.channelFloorRange, WATER.channelSegmentLength)
  for (const r of rings) {
    // the rings are culled with their storey and use a coarse tube — the
    // measurement that prompted both is in this file's test
    if (!isStoreyVisible(r.floorIndex, viewerStorey, { showAll })) continue
    const torus = new THREE.TorusGeometry(r.radius, 0.13, 6, 40)
    byPart.water.meshes += 1
    byPart.water.triangles += triCount(torus)
    torus.dispose()
  }
  byPart.water.meshes += 5 // shaft, wellhead ring, downpipe, three buried runs merged in count
  byPart.water.triangles += 600

  const meshes = Object.values(byPart).reduce((n, p) => n + p.meshes, 0)
  const triangles = Object.values(byPart).reduce((n, p) => n + p.triangles, 0)
  return { meshes, triangles, byPart }
}
