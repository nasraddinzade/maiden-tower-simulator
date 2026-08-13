import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { drumProfile } from '../../lib/towerShell'
import { COURSING, ENTRANCE, TOWER } from '../../config/tower'
import type { WindowCut } from '../../lib/towerShell'

const DEG = Math.PI / 180

/**
 * The projecting courses of the outer face.
 *
 * This is the most recognisable thing about the building and the model did not
 * have it: two independent readings of the exterior set say the wall is in two
 * zones with a sharp boundary about 11 m up, and that the stripes above it are
 * RELIEF — every bed a small ledge with a hard shadow under it, the silhouette
 * visibly serrated. A shader can tint a smooth cylinder; it cannot serrate one.
 *
 * ADDED, NOT CUT, and that is the whole design. Making the drum a lathe of the
 * banded profile was tried first and backed out: it turns the outer radius into
 * a function of height, and eight tests are written against a constant 8.25 —
 * the bounding box, the window widths, the outer-radius profile, the
 * through-hole rays, the floor under the treads. Every one of them is right to
 * ask. Stone laid ON the drum changes nothing they measure, and it is also what
 * the building is: courses oversailing the ones below, not a wall carved back.
 *
 * NO COLLIDER. A 5 cm ledge 11 m up the outside is not somewhere anyone stands.
 *
 * The bands break for the openings. A ring running through a window would close
 * it, so each band is drawn as arcs with a gap wherever an opening crosses it —
 * which is also how the real courses read, stopped against the dressed jambs.
 *
 * A CONSEQUENCE TO SHOW THE OWNER RATHER THAN SMOOTH AWAY. Since [OWNER]
 * 2026-08-10 the openings are the ends of the stair flights, and the flights are
 * stacked in one sector of the wall, so the slits fall into vertical columns and
 * every course they cross is broken in the same place. The drum reads with a
 * near-continuous seam up each column.
 *
 * [2026-08-13] The turn onto his buttress bearing made the effect STRONGER, not
 * weaker, and it is the plainest thing to look at when judging whether the
 * stacked-flight layout is right at all: five of the nine cut openings now stand
 * within 1.5° of azimuth 206, from y 5.03 to 21.44 — a seam three storeys taller
 * than before — with a second, shorter column at 113.6–116.0 and one outlier at
 * 46.8. That is what a stacked stair with a slit at each landing produces; it is
 * not a bug in this file, and it must not be hidden by nudging
 * STAIR.startAzimuthDeg, which would now be tuning testimony for appearance.
 */
export function CourseBands({
  windows,
  material,
  visible = true,
}: {
  windows: WindowCut[]
  material?: THREE.Material
  visible?: boolean
}) {
  const geometry = useMemo(() => {
    const R = TOWER.outerRadius
    const profile = drumProfile(
      ENTRANCE.groundY - 0.5,
      TOWER.topY,
      R,
      TOWER.groundY,
      COURSING,
    )

    /*
     * The profile is a staircase in section; a band is the run of it that stands
     * proud. Reading them off the shared profile rather than re-deriving the
     * pitch here is what keeps the drawn stone and the recorded measurements the
     * same thing.
     */
    const bands: Array<{ bottom: number; top: number; out: number }> = []
    for (let i = 0; i < profile.length - 1; i += 1) {
      const [r0, y0] = profile[i]
      const [r1, y1] = profile[i + 1]
      /*
       * A course, not the coping. Both stand proud in the section, so the run
       * has to be told apart by HOW FAR it stands proud — the coping oversails
       * further by design, and picking it up as a band put a 1.3 m "course" at
       * the crown with three times the projection of any real one.
       */
      const isCourse = Math.abs(r0 - R - COURSING.bandProjection) < 1e-9
      if (isCourse && Math.abs(r1 - r0) < 1e-9 && y1 > y0 + 1e-6) {
        bands.push({ bottom: y0, top: y1, out: r0 - R })
      }
    }
    if (bands.length === 0) return null

    /*
     * Where a band may not run. An opening's outer mouth plus a margin for its
     * dressed surround: the course stops against the jamb rather than crossing
     * the hole.
     */
    const blocked = windows.map((w) => {
      const half = ((w.outerWidth / 2 + 0.3) / R) * (180 / Math.PI)
      return {
        from: w.azimuthDeg - half,
        to: w.azimuthDeg + half,
        bottom: w.centreY - w.outerHeight / 2 - 0.35,
        top: w.centreY + w.outerHeight / 2 + 0.35,
      }
    })

    const SEG = 96
    const parts: THREE.BufferGeometry[] = []
    for (const band of bands) {
      const midY = (band.bottom + band.top) / 2
      // walk the circle and emit an arc wherever nothing blocks it
      let runStart: number | null = null
      for (let s = 0; s <= SEG; s += 1) {
        const az = (s / SEG) * 360
        const clear =
          s < SEG &&
          !blocked.some(
            (b) =>
              midY > b.bottom &&
              midY < b.top &&
              Math.abs(((az - (b.from + b.to) / 2 + 540) % 360) - 180) < (b.to - b.from) / 2,
          )
        if (clear && runStart === null) runStart = az
        if (!clear && runStart !== null) {
          const sweep = az - runStart
          if (sweep > 0.5) {
            const g = new THREE.CylinderGeometry(
              R + band.out,
              R + band.out,
              band.top - band.bottom,
              Math.max(2, Math.round((sweep / 360) * SEG)),
              1,
              true,
              runStart * DEG,
              sweep * DEG,
            )
            g.translate(0, midY, 0)
            parts.push(g)
          }
          runStart = null
        }
      }
    }
    if (parts.length === 0) return null
    const merged = mergeGeometries(parts, false)
    for (const p of parts) p.dispose()
    merged.computeVertexNormals()
    return merged
  }, [windows])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!visible || !geometry) return null

  return (
    <mesh geometry={geometry} material={material} castShadow receiveShadow>
      {!material && <meshStandardMaterial color="#a89f8c" roughness={0.95} />}
    </mesh>
  )
}
