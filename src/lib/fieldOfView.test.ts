import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  horizontalFovFor,
  horizontalFromVertical,
  verticalFovFor,
  verticalFromHorizontal,
} from './fieldOfView'
import { CAMERA, type FovRule } from '../config/camera'
import { ORBIT } from '../config/orbit'
import { BUTTRESS, TOWER } from '../config/tower'
import { PLAYER } from '../config/player'
import { OUTDOOR_START } from '../components/modern/SiteAndEntranceStair'

const RULE = CAMERA.fov

/** The vertical the app shipped with, and the horizontal it produced. */
const SHIPPED_VERTICAL = 50

/** Every viewport the audit was taken on, plus the shapes a window is dragged to. */
const SCREENS: Array<[number, number, string]> = [
  [375, 812, 'phone portrait'],
  [812, 375, 'phone landscape'],
  [768, 1024, 'tablet portrait'],
  [1024, 768, 'tablet landscape'],
  [1440, 900, 'desktop 16:10'],
  [1920, 1080, 'desktop 16:9'],
  [2560, 1080, 'ultrawide 21:9'],
]

describe('the two conversions', () => {
  it('are inverses of each other at every aspect', () => {
    for (const a of [0.35, 0.4618, 0.75, 1, 1.6, 1.7778, 2.37]) {
      for (const h of [24.3, 50, 70, 95.7]) {
        expect(horizontalFromVertical(verticalFromHorizontal(h, a), a)).toBeCloseTo(h, 9)
      }
    }
  })

  it('reproduce the collapse the audit measured, from the value App.tsx shipped', () => {
    // these four are the whole reason the rule exists; if they ever move, the
    // premise moved and the numbers in config/camera.ts are talking about
    // another build
    expect(horizontalFromVertical(SHIPPED_VERTICAL, 375 / 812)).toBeCloseTo(24.31, 2)
    expect(horizontalFromVertical(SHIPPED_VERTICAL, 812 / 375)).toBeCloseTo(90.55, 2)
    expect(horizontalFromVertical(SHIPPED_VERTICAL, 768 / 1024)).toBeCloseTo(38.55, 2)
    expect(horizontalFromVertical(SHIPPED_VERTICAL, 16 / 9)).toBeCloseTo(79.32, 2)
  })

  it('are monotonic in the aspect, which is what makes the clamps well ordered', () => {
    let previous = Infinity
    for (let a = 0.2; a <= 3; a += 0.05) {
      const v = verticalFromHorizontal(70, a)
      expect(v).toBeLessThan(previous)
      previous = v
    }
  })
})

describe('the rule', () => {
  it('holds the horizontal wherever neither clamp binds', () => {
    for (const a of [0.75, 0.9, 1, 1.2, 1.4]) {
      expect(horizontalFovFor(a, RULE)).toBeCloseTo(RULE.horizontalDeg, 9)
    }
  })

  it('gives the ceiling to a portrait phone, and the floor to every desktop shape', () => {
    expect(verticalFovFor(375 / 812, RULE)).toBe(RULE.verticalMaxDeg)
    expect(verticalFovFor(16 / 10, RULE)).toBe(RULE.verticalMinDeg)
    expect(verticalFovFor(16 / 9, RULE)).toBe(RULE.verticalMinDeg)
    expect(verticalFovFor(21 / 9, RULE)).toBe(RULE.verticalMinDeg)
  })

  it('never returns a vertical outside its own two clamps, at any aspect', () => {
    for (let a = 0.05; a <= 6; a += 0.01) {
      const v = verticalFovFor(a, RULE)
      expect(v).toBeGreaterThanOrEqual(RULE.verticalMinDeg)
      expect(v).toBeLessThanOrEqual(RULE.verticalMaxDeg)
    }
  })

  /**
   * THE DESKTOP GUARANTEE, asserted rather than argued. Not one aspect ratio
   * loses field on either axis against the camera that shipped.
   */
  it('takes nothing away from any viewport, on either axis', () => {
    for (let a = 0.05; a <= 6; a += 0.01) {
      expect(verticalFovFor(a, RULE)).toBeGreaterThanOrEqual(SHIPPED_VERTICAL - 1e-9)
      expect(horizontalFovFor(a, RULE)).toBeGreaterThanOrEqual(
        horizontalFromVertical(SHIPPED_VERTICAL, a) - 1e-9,
      )
    }
  })

  it('leaves every viewport at 3:2 or wider EXACTLY as it shipped', () => {
    for (const a of [1.5016, 1.6, 16 / 9, 2, 21 / 9, 3.2]) {
      expect(verticalFovFor(a, RULE)).toBe(SHIPPED_VERTICAL)
      expect(horizontalFovFor(a, RULE)).toBeCloseTo(horizontalFromVertical(SHIPPED_VERTICAL, a), 9)
    }
  })

  it('puts the crossover just wide of 3:2, which is what keeps desktops still', () => {
    const crossover =
      Math.tan((RULE.horizontalDeg * Math.PI) / 360) / Math.tan((SHIPPED_VERTICAL * Math.PI) / 360)
    expect(crossover).toBeCloseTo(1.5016, 4)
  })

  it('reports the field each measured screen actually gets', () => {
    const got = SCREENS.map(([w, h, name]) => {
      const a = w / h
      return `${name} ${verticalFovFor(a, RULE).toFixed(1)}v ${horizontalFovFor(a, RULE).toFixed(1)}h`
    })
    expect(got).toEqual([
      'phone portrait 90.0v 49.6h',
      'phone landscape 50.0v 90.6h',
      'tablet portrait 86.1v 70.0h',
      'tablet landscape 55.4v 70.0h',
      'desktop 16:10 50.0v 73.5h',
      'desktop 16:9 50.0v 79.3h',
      'ultrawide 21:9 50.0v 95.7h',
    ])
  })

  it('answers a viewport with no area instead of handing three.js a NaN', () => {
    for (const a of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(verticalFovFor(a, RULE)).toBe(RULE.verticalMinDeg)
      expect(horizontalFovFor(a, RULE)).toBe(RULE.horizontalDeg)
    }
  })

  it('is a function of the rule and not of these particular numbers', () => {
    const other: FovRule = { horizontalDeg: 90, verticalMinDeg: 30, verticalMaxDeg: 120 }
    expect(verticalFovFor(1, other)).toBeCloseTo(90, 9)
    expect(verticalFovFor(4, other)).toBe(30)
    expect(verticalFovFor(0.2, other)).toBe(120)
  })
})

// ————————————————————————— what it does to the framing —————————————————————
//
// Two framings were measured on a phone against the shipped camera and both
// failed. They are geometry — points through a projection matrix — so they are
// asserted here rather than looked at.

/**
 * The bounding cylinder of everything built: drum plus the buttress's reach.
 * The same hull portal.ts culls against, so containing it contains the building
 * whatever the beak's plan turns out to be.
 */
function builtHull(): THREE.Vector3[] {
  const r = TOWER.outerRadius + BUTTRESS.projection
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 180; i += 1) {
    const a = (i / 180) * Math.PI * 2
    for (const y of [TOWER.groundY, TOWER.topY]) {
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
    }
  }
  return pts
}

/** The drum's outer face, sampled up the wall as well as round it. */
function outerFace(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < 120; i += 1) {
    const a = (i / 120) * Math.PI * 2
    for (let k = 0; k <= 60; k += 1) {
      const y = TOWER.groundY + ((TOWER.topY - TOWER.groundY) * k) / 60
      pts.push(
        new THREE.Vector3(Math.cos(a) * TOWER.outerRadius, y, Math.sin(a) * TOWER.outerRadius),
      )
    }
  }
  return pts
}

function cameraAt(fovDeg: number, width: number, height: number) {
  return new THREE.PerspectiveCamera(fovDeg, width / height, CAMERA.near, CAMERA.far)
}

/**
 * The orbit camera as App.tsx mounts it, at a given vertical fov. The place it
 * stands is config/orbit.ts's business and is read from there, so this asserts
 * the framing of the shipped opening view rather than of a copy of it.
 */
function orbitCamera(fovDeg: number, width: number, height: number) {
  const cam = cameraAt(fovDeg, width, height)
  cam.position.set(...ORBIT.opening.position)
  cam.lookAt(...ORBIT.opening.target)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

/**
 * The first frame of walk mode: the spawn outside the external stair, facing up
 * the flight. The eye offset repeats FirstPersonPlayer's own line — body centre
 * less half the capsule plus the eye height — because that is the camera whose
 * framing is in question, and it is three config values and no third number.
 */
function walkCamera(fovDeg: number, width: number, height: number) {
  const cam = cameraAt(fovDeg, width, height)
  cam.position.set(
    OUTDOOR_START.x,
    OUTDOOR_START.y - PLAYER.height / 2 + PLAYER.eyeHeight,
    OUTDOOR_START.z,
  )
  cam.rotation.set(0, OUTDOOR_START.yaw, 0, 'YXZ')
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  return cam
}

/** How far past the frame the worst point of a set lands, 1 being the edge. */
function overrun(cam: THREE.PerspectiveCamera, pts: THREE.Vector3[]) {
  let across = 0
  let down = 0
  for (const p of pts) {
    const local = cam.worldToLocal(p.clone())
    if (-local.z <= CAMERA.near) continue
    const ndc = p.clone().project(cam)
    across = Math.max(across, Math.abs(ndc.x))
    down = Math.max(down, Math.abs(ndc.y))
  }
  return { across, down }
}

/** The highest point of the wall that lands inside the frame, in metres. */
function highestWallInFrame(cam: THREE.PerspectiveCamera) {
  let top = TOWER.groundY
  for (const p of outerFace()) {
    const local = cam.worldToLocal(p.clone())
    if (-local.z <= CAMERA.near) continue
    const ndc = p.clone().project(cam)
    if (Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) top = Math.max(top, p.y)
  }
  return top
}

describe('the orbit view has to contain the building', () => {
  const PHONES: Array<[number, number]> = [
    [360, 800],
    [375, 812],
    [390, 844],
    [393, 852],
    [414, 896],
    [430, 932],
  ]

  it('did not, on a portrait phone, at the vertical fov that shipped', () => {
    // pinned so the bug cannot come back quietly. The hull overran the 375×812
    // frame by 93% of its half-width and 13% of its half-height; measured on the
    // beak's true plan rather than this bounding cylinder the overrun across is
    // 34%, which is the 13.1% of the building's own width the screenshots show
    // cut off the right edge.
    const { across, down } = overrun(orbitCamera(SHIPPED_VERTICAL, 375, 812), builtHull())
    expect(across).toBeCloseTo(1.93, 2)
    expect(down).toBeCloseTo(1.128, 3)
  })

  it('does, on every portrait phone, under the rule', () => {
    for (const [w, h] of PHONES) {
      const { across, down } = overrun(orbitCamera(verticalFovFor(w / h, RULE), w, h), builtHull())
      expect(across, `${w}×${h} across`).toBeLessThanOrEqual(1)
      expect(down, `${w}×${h} down`).toBeLessThanOrEqual(1)
    }
  })

  it('never frames the building worse than the shipped camera did, at any aspect', () => {
    for (const [w, h, name] of SCREENS) {
      const shipped = overrun(orbitCamera(SHIPPED_VERTICAL, w, h), builtHull())
      const ruled = overrun(orbitCamera(verticalFovFor(w / h, RULE), w, h), builtHull())
      expect(ruled.across, `${name} across`).toBeLessThanOrEqual(shipped.across + 1e-9)
      expect(ruled.down, `${name} down`).toBeLessThanOrEqual(shipped.down + 1e-9)
    }
  })
})

describe('the first frame of walk mode has to contain the tower', () => {
  it('showed a third of the wall and no top edge at the vertical fov that shipped', () => {
    expect(highestWallInFrame(walkCamera(SHIPPED_VERTICAL, 375, 812))).toBeCloseTo(10.29, 2)
  })

  it('shows the wall to within 2.5 m of its head under the rule', () => {
    const top = highestWallInFrame(walkCamera(verticalFovFor(375 / 812, RULE), 375, 812))
    expect(top).toBeGreaterThan(24)
    expect(top).toBeCloseTo(25.04, 2)
  })

  it('leaves the desktop frame exactly where it was', () => {
    for (const [w, h] of [
      [1440, 900],
      [1920, 1080],
      [2560, 1080],
    ] as const) {
      expect(highestWallInFrame(walkCamera(verticalFovFor(w / h, RULE), w, h))).toBe(
        highestWallInFrame(walkCamera(SHIPPED_VERTICAL, w, h)),
      )
    }
  })
})
