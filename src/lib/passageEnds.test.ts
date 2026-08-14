/**
 * THE SHELL MUST BE CLOSED AT EVERY STAIR DOORWAY END.
 *
 * Photographed at the end of a stair passage: triangles folded over each other
 * with a grey void between them, and the masonry behind them simply gone. Every
 * one of the twelve passage ends was open — 23.06 m² of end wall whose normal
 * pointed into the stone instead of into the passage, culled by the shell's
 * FrontSide material, so the eye ran straight out of the tower.
 *
 * The cause was in stairPassageGeometry(): its wall loft and its two end-cap
 * fans are wound by rules that agree only for one sweep direction, so the tool
 * was correct for NEITHER value of STAIR.winding. See the note there.
 *
 * Two properties, and neither is a tolerance.
 *
 * The first is pure mathematics on a mesh (CLAUDE.md rule 6): a closed,
 * consistently oriented surface has Σ area·normal = 0, no directed edge
 * traversed twice the same way, and a signed volume that does not depend on
 * where you measure it from. That last one is the cheap regression test this
 * project never had, and it is the one that matters: a cap lies in a plane
 * containing the tower axis, so p·n vanishes over the whole fan and the
 * ORIGIN-based volume reads 21.58 whichever way the caps are turned. Measured
 * about a shifted origin instead it read −150.11, and the mesh is caught.
 *
 * The second is the property the owner photographed, asserted where they stood:
 * on the finished shell, at each passage end, in that end's own plane.
 *
 * Both are checked for BOTH windings. `winding` is a live leva control and
 * staircase.ts still calls the question UNRESOLVED, so a fix that only happened
 * to suit 'counterclockwise' would break the day someone toggled it — and break
 * far worse, since the walls are 60–97 m² per tube against the caps' 2.
 */

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  BUTTRESS,
  ENTRANCE,
  ROOF,
  STAIR,
  TOWER,
  WALL_LIFTS,
  innerRadiusAt,
  stairSettings,
} from '../config/tower'
import { PLAYER } from '../config/player'
import {
  planAllFlights,
  stairDoorways,
  stairPassageSections,
  type PassageSection,
  type Winding,
} from './staircase'
import { SHIPPED_CUTS, SHIPPED_ENDS } from './openings.fixture'
import { buildShellGeometry, stairPassageGeometry, type ShellParams } from './towerShell'

const DEG = Math.PI / 180

function tubesFor(winding: Winding): PassageSection[][] {
  const flights = planAllFlights(stairSettings({ winding }), WALL_LIFTS, innerRadiusAt)
  return stairPassageSections(
    flights,
    STAIR.width,
    PLAYER.stairHeadroom,
    innerRadiusAt,
    // the underside of the terrace paving — the level the app clamps to, and
    // the one the shell this test raycasts is actually built with
    ROOF.masonryTopY,
    undefined,
    STAIR.doorwayWidth,
  )
}

/** Triangles of an indexed geometry, as flat vertex triples. */
function triangles(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position.array
  const idx = geometry.index!.array
  const out: number[][] = []
  for (let t = 0; t < idx.length; t += 3) {
    const tri: number[] = []
    for (const v of [idx[t], idx[t + 1], idx[t + 2]]) tri.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
    out.push(tri)
  }
  return out
}

/** Twice the area-weighted normal of one triangle, from its index winding. */
function crossOf([ax, ay, az, bx, by, bz, cx, cy, cz]: number[]) {
  const ux = bx - ax
  const uy = by - ay
  const uz = bz - az
  const vx = cx - ax
  const vy = cy - ay
  const vz = cz - az
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
}

describe('the stair passage is swept as a closed solid, whichever way the stair turns', () => {
  for (const winding of ['counterclockwise', 'clockwise'] as const) {
    describe(winding, () => {
      const tubes = tubesFor(winding)

      it('closes every tube: no boundary edge, and no edge traversed twice the same way', () => {
        /*
         * An edge used twice in the SAME direction means its two triangles
         * disagree about which side is out. There were 26 per tube — thirteen
         * per end, which is exactly the number of points in sectionProfile():
         * the whole ring where a cap meets the tube.
         */
        const bad: string[] = []
        tubes.forEach((sections, i) => {
          const idx = stairPassageGeometry(sections)!.index!.array
          const seen = new Map<string, number>()
          for (let t = 0; t < idx.length; t += 3) {
            const tri = [idx[t], idx[t + 1], idx[t + 2]]
            for (let e = 0; e < 3; e += 1) seen.set(`${tri[e]}>${tri[(e + 1) % 3]}`, (seen.get(`${tri[e]}>${tri[(e + 1) % 3]}`) ?? 0) + 1)
          }
          let sameDirection = 0
          let boundary = 0
          for (const [key, n] of seen) {
            if (n > 1) sameDirection += n - 1
            const [a, b] = key.split('>')
            if (!seen.has(`${b}>${a}`)) boundary += 1
          }
          if (sameDirection || boundary) {
            bad.push(`tube ${i}: ${sameDirection} edges wound both ways, ${boundary} unmatched`)
          }
        })
        expect(bad).toEqual([])
      })

      it('leaves no surface pointing the wrong way: the area-weighted normals cancel', () => {
        // Σ area·normal = 0 over any closed, consistently oriented surface. With
        // the caps inside-out it came out 6.7–8.4 m² per tube.
        const bad: string[] = []
        tubes.forEach((sections, i) => {
          let sx = 0
          let sy = 0
          let sz = 0
          for (const tri of triangles(stairPassageGeometry(sections)!)) {
            const [nx, ny, nz] = crossOf(tri)
            sx += nx / 2
            sy += ny / 2
            sz += nz / 2
          }
          const residual = Math.hypot(sx, sy, sz)
          if (residual > 1e-6) bad.push(`tube ${i}: ${residual.toFixed(4)} m² uncancelled`)
        })
        expect(bad).toEqual([])
      })

      it('encloses the same volume measured from anywhere, and encloses it outward', () => {
        /*
         * THE CHECK THAT WOULD HAVE CAUGHT THIS ON THE DAY THE STAIR TURNED
         * COUNTERCLOCKWISE, and the reason none of the existing ones did.
         *
         * Σ (1/6)·a·(b×c) is origin-independent for a closed, consistently
         * oriented mesh, and only for one. The caps lie in planes through the
         * tower axis, so they contribute exactly nothing when the origin is ON
         * that axis — which is where every volume in this project has ever been
         * measured from. Move the origin off it and the disagreement shows.
         *
         * Positive, too: three-bvh-csg subtracts nothing at all from a tool whose
         * faces point inward, so the sign is not cosmetic.
         */
        const bad: string[] = []
        const volumeAbout = (tris: number[][], ox: number, oy: number, oz: number) => {
          let v = 0
          for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of tris) {
            const px = ax - ox
            const py = ay - oy
            const pz = az - oz
            const qx = bx - ox
            const qy = by - oy
            const qz = bz - oz
            const rx = cx - ox
            const ry = cy - oy
            const rz = cz - oz
            v += (px * (qy * rz - qz * ry) + py * (qz * rx - qx * rz) + pz * (qx * ry - qy * rx)) / 6
          }
          return v
        }
        tubes.forEach((sections, i) => {
          const tris = triangles(stairPassageGeometry(sections)!)
          const onAxis = volumeAbout(tris, 0, 0, 0)
          const offAxis = volumeAbout(tris, 137, -61, 89)
          if (onAxis <= 0) bad.push(`tube ${i}: volume ${onAxis.toFixed(4)} — the tool is inside-out`)
          if (Math.abs(onAxis - offAxis) > 1e-6) {
            bad.push(
              `tube ${i}: ${onAxis.toFixed(4)} about the axis but ${offAxis.toFixed(4)} about a ` +
                'shifted origin — the tool is not consistently wound',
            )
          }
        })
        expect(bad).toEqual([])
      })
    })
  }
})

describe('the shell is closed at every stair doorway end', () => {
  const tubes = tubesFor(STAIR.winding)
  const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
  const built = buildShellGeometry({
    buttressAzimuthDeg: BUTTRESS.azimuthDeg,
    buttressProjection: BUTTRESS.projection,
    buttressTipWidth: BUTTRESS.tipWidth,
    buttressRootArcDeg: BUTTRESS.rootArcDeg,
    buttressSkewDeg: BUTTRESS.skewDeg,
    buttressHeight: TOWER.height,
    entranceAzimuthDeg: ENTRANCE.azimuthDeg,
    entranceWidth: ENTRANCE.width,
    entranceHeight: ENTRANCE.height,
    entranceSillY: ENTRANCE.thresholdY,
    windows: SHIPPED_CUTS,
    stairPassage: tubes,
    stairDoorways: stairDoorways(
      flights,
      STAIR.width,
      PLAYER.height + 0.35,
      innerRadiusAt,
      (i, end) => (end === 'foot' ? WALL_LIFTS[i].fromY : WALL_LIFTS[i].toY),
      ROOF.masonryTopY,
      WALL_LIFTS.map((l) => l.opensAtY),
      STAIR.doorwayWidth,
    ) as ShellParams['stairDoorways'],
  })

  /**
   * The surface standing in one passage end's own plane, split by which way it
   * faces.
   *
   * Measured IN THE PLANE, not within a radius of the end — bucketing by
   * distance sweeps in the neighbouring vault and jambs and inflates the
   * answer. A triangle counts only if all three of its corners lie in the plane
   * and inside that end's cross-section.
   */
  function endWall(section: PassageSection, towardVoid: number) {
    const az = section.azimuthDeg * DEG
    // the plane's normal is the tangential direction: radial × up
    const t = { x: Math.cos(az), z: Math.sin(az) }
    const radial = { x: Math.sin(az), z: -Math.cos(az) }
    const originOffset = section.innerRadius
    let facingVoid = 0
    let facingStone = 0
    for (const tri of triangles(built.geometry)) {
      let inSection = true
      for (let v = 0; v < 9 && inSection; v += 3) {
        const dx = tri[v] - radial.x * originOffset
        const dz = tri[v + 2] - radial.z * originOffset
        const alongNormal = dx * t.x + dz * t.z
        const r = tri[v] * radial.x + tri[v + 2] * radial.z
        inSection =
          Math.abs(alongNormal) <= 2e-3 &&
          r >= section.innerRadius - 0.02 &&
          r <= section.outerRadius + 0.02 &&
          tri[v + 1] >= section.bottomY - 0.02 &&
          tri[v + 1] <= section.topY + 0.02
      }
      if (!inSection) continue
      const [nx, ny, nz] = crossOf(tri)
      const area = Math.hypot(nx, ny, nz) / 2
      if (area < 1e-9) continue
      if ((nx * t.x + nz * t.z) * towardVoid > 0) facingVoid += area
      else facingStone += area
    }
    return { facingVoid, facingStone }
  }

  const ends = tubes.flatMap((sections, flight) => [
    { name: `flight ${flight} foot`, section: sections[0], next: sections[1] },
    {
      name: `flight ${flight} head`,
      section: sections[sections.length - 1],
      next: sections[sections.length - 2],
    },
  ])

  it('walls off eleven ends and leaves the twelfth open, because the twelfth is the way out', () => {
    /*
     * Stated separately from the direction, because "no surface facing the wrong
     * way" is satisfied trivially by no surface at all. A passage that stopped
     * against nothing would be a hole through the drum.
     *
     * IT SURVIVES [OWNER] 2026-08-10 WORD FOR WORD, and that is worth saying,
     * because "openings at the beginning and the end of the passages" looks like
     * a direct contradiction of it. It is not: the end of a passage is a PLACE,
     * not a surface. The slit is cut RADIALLY through the passage's outer cheek
     * over the landing; the cap stays solid stone. A hole through the cap would
     * run tangentially — 6.8 m of masonry from the cheek to the drum face on that
     * bearing — and would surface metres round the drum from the landing it was
     * meant to light. See planPassageOpenings().
     *
     * THE TWELFTH IS THE EXCEPTION AND IT IS NOT A LEAK. This used to read "walls
     * off all twelve", and it was true of a tower whose stair came out by tearing
     * a 50° trench through the parapet ring — the head cap stood in stone because
     * there was 3.733 m of wall top standing over the deck to hold it.
     *
     * The terrace crosses the wall now (roof/016, roof/001, up/230), so over the
     * roof climb the stone stops at the underside of the paving and the passage's
     * last cross-section is barely a hand deep. There is nothing left up there to
     * cap it with, and there should not be: the flight comes out through an
     * OPENING IN THE PAVING at deck level — roof/007's stainless threshold set
     * flush in the slabs, treads starting straight behind it. A walled twelfth end
     * would be a stair that arrives at a wall.
     *
     * So the assertion is now that exactly ONE end is open and it is the roof
     * climb's head. Eleven ends still stop in stone, and the day a second one
     * opens something has gone through the drum.
     */
    expect(ends.length).toBe(12)
    const open = ends
      .filter(
        ({ section, next }) =>
          endWall(section, Math.sign(next.azimuthDeg - section.azimuthDeg)).facingVoid < 0.2,
      )
      .map((e) => e.name)
    expect(open).toEqual([`flight ${tubes.length - 1} head`])
    // and it is open because the paving is over it, not because the wall is gone
    const roofHead = tubes[tubes.length - 1][tubes[tubes.length - 1].length - 1]
    expect(roofHead.topY).toBeLessThanOrEqual(ROOF.masonryTopY + 1e-9)
    expect(roofHead.openToSky).toBe(true)
  })

  it('turns every square metre of that wall toward the passage, not into the masonry', () => {
    /*
     * The whole fault, stated once. A triangle here whose normal points into the
     * stone is a triangle the renderer culls, and what stands behind it is the
     * outside of the tower.
     */
    const torn = ends
      .map(({ name, section, next }) => ({
        name,
        ...endWall(section, Math.sign(next.azimuthDeg - section.azimuthDeg)),
      }))
      .filter((e) => e.facingStone > 1e-4)
      .map((e) => `${e.name}: ${e.facingStone.toFixed(4)} m² facing into the stone`)
    expect(torn).toEqual([])
  })

  /*
   * AND THE OTHER HALF OF THE SAME SENTENCE: the cap is stone, the cheek is a
   * hole. Both have to be asserted on ONE shell or the pair can be satisfied by
   * building nothing at all.
   *
   * This is the guard the brief asks for by name — no opening that lights
   * nothing — and it was missing. It is not a restatement of the planner's
   * daylight rule in passageOpenings.test.ts: that rule decides which ends are
   * WORTH cutting, on the plan, and says nothing about whether the boolean
   * afterwards actually removed any stone. Nothing else in the suite closes that
   * gap — passageEnds' other two tests measure the CAP, and towerShell.test.ts
   * only counts degenerate triangles over the shipped set, which a shell with no
   * openings at all would pass.
   *
   * It is worth saying what this does NOT catch, because that was checked and
   * came out the other way. stairBearingClip() was the suspected route to a blind
   * slit; it is not, at these numbers — the haunch tops out 0.27 m below the sill
   * (see the note on that function), and forcing it back on for every opening
   * leaves this test green. The guard is here for the general case, not for that
   * one.
   */
  it('opens each built slit through to daylight, and leaves the withheld ones shut', () => {
    /*
     * ONE ray per opening, not outerRadiusProfileAt()'s 720-bucket sweep. The
     * sweep costs a full turn of the drum per call and eleven of them time the
     * suite out; the question here is about eleven named bearings, so it is asked
     * on those bearings. Same cast, same first-hit rule.
     */
    const mesh = new THREE.Mesh(built.geometry)
    mesh.updateMatrixWorld(true)
    const caster = new THREE.Raycaster()
    const firstStoneAt = (azimuthDeg: number, y: number): number => {
      const az = (azimuthDeg * Math.PI) / 180
      const dx = Math.sin(az)
      const dz = -Math.cos(az)
      const far = TOWER.outerRadius * 6
      caster.set(
        new THREE.Vector3(dx * far, y, dz * far),
        new THREE.Vector3(-dx, 0, -dz).normalize(),
      )
      const hits = caster.intersectObject(mesh, false)
      return hits.length ? Math.hypot(hits[0].point.x, hits[0].point.z) : 0
    }

    const shut: string[] = []
    for (const o of SHIPPED_ENDS.filter((x) => x.built)) {
      const r = firstStoneAt(o.azimuthDeg, o.centreY)
      /*
       * A ray cast inward on the slit's own bearing must get past the drum face.
       * Where the opening is cut it runs on to the far end of the reveal or into
       * the passage behind it; where it is not, it stops at the face.
       */
      if (r > o.revealEndRadius + 0.5) {
        shut.push(`${o.id} (az ${o.azimuthDeg.toFixed(1)}): first stone at r ${r.toFixed(4)}`)
      }
    }
    expect(shut).toEqual([])

    /*
     * The complement, so the test cannot pass by cutting everything. An end the
     * planner withheld for the pier must still be solid on its bearing — and it
     * is the buttress that answers there, further out than the drum face.
     */
    const leaked: string[] = []
    for (const o of SHIPPED_ENDS.filter((x) => x.blindBecause === 'buttress')) {
      const r = firstStoneAt(o.azimuthDeg, o.centreY)
      if (r < TOWER.outerRadius - 0.01) {
        leaked.push(`${o.id} (az ${o.azimuthDeg.toFixed(1)}): opened at r ${r.toFixed(4)}`)
      }
    }
    expect(leaked).toEqual([])
  })
})
