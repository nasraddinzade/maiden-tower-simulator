import { describe, expect, it } from 'vitest'
import { interiorRenderBudget } from './renderBudget'
import { FLOORS } from '../config/tower'

const all = interiorRenderBudget({ showAll: true })
const culled = interiorRenderBudget({ showAll: false, viewerStorey: 4 })

describe('render budget', () => {
  it('draws every storey when nothing is culled', () => {
    expect(all.byPart.cupolas.meshes).toBe(FLOORS.length)
    expect(all.byPart.floors.meshes).toBe(FLOORS.length)
  })

  it('draws only the viewer’s storey and its neighbours when culled', () => {
    expect(culled.byPart.cupolas.meshes).toBe(3)
    expect(culled.byPart.floors.meshes).toBe(3)
  })

  it('culls the water channels with their storey too', () => {
    // this was the measurement that mattered: uncelled rings were the single
    // biggest item in the interior budget
    expect(culled.byPart.water.meshes).toBeLessThan(all.byPart.water.meshes)
  })

  it('cuts meshes by roughly half when walking inside', () => {
    expect(culled.meshes).toBeLessThan(all.meshes * 0.6)
  })

  it('cuts triangles measurably', () => {
    const saved = 1 - culled.triangles / all.triangles
    expect(saved).toBeGreaterThan(0.15)
  })

  it('keeps the whole stair in a single draw call', () => {
    // an InstancedMesh: 120 treads still cost one call
    expect(all.byPart.stair.meshes).toBe(1)
    expect(all.byPart.stair.triangles).toBeGreaterThan(1000)
  })

  /**
   * The guard that actually protects the 30 fps Android target. These are
   * ceilings, not measurements — if a change pushes past them the phone budget
   * has been spent and the test should say so before the device does.
   */
  it('stays inside the mobile budget while walking', () => {
    expect(culled.triangles).toBeLessThan(12_000)
    expect(culled.meshes).toBeLessThan(20)
  })

  it('stays inside a looser ceiling even with every storey drawn', () => {
    expect(all.triangles).toBeLessThan(15_000)
    expect(all.meshes).toBeLessThan(35)
  })

  it('is deterministic', () => {
    expect(interiorRenderBudget({ showAll: true }).triangles).toBe(all.triangles)
  })
})
