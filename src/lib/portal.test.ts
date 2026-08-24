import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  eyeSeesThrough,
  frustumPlanes,
  interiorVisibleFromOutside,
  outerFaceCentre,
  outerFaceRadius,
  sphereInFrustum,
  type Point3,
} from './portal'
import { beamThroughOpening, type OpeningAperture } from './sun'
import { azimuthToVector } from './geometry'
import { SHIPPED_CUTS } from './openings.fixture'
import { buildApertures } from '../components/sun/SunBeams'
import { BUTTRESS, ENTRANCE, FLOORS, TOWER } from '../config/tower'

const APERTURES = buildApertures(SHIPPED_CUTS)

const ENTRANCE_PORTAL = {
  azimuthDeg: ENTRANCE.azimuthDeg,
  centreY: ENTRANCE.thresholdY + ENTRANCE.height / 2,
  outerRadius: TOWER.outerRadius,
  width: ENTRANCE.width,
  height: ENTRANCE.height,
}

const SITE = {
  hullRadius: TOWER.outerRadius + BUTTRESS.projection,
  bottomY: TOWER.groundY,
  topY: TOWER.topY,
}

/**
 * A camera at a point, aimed at a point. The app's own near/far, and a fixed 50°
 * vertical field — which since config/camera.ts is what the app gives every
 * viewport at 3:2 or wider, and NOT what it gives the 375×812 default aspect
 * below (that gets 90°, a wider frustum). Left fixed on purpose: these are
 * assertions about what an opening lets through at a stated frustum, and a
 * frustum that changes with the aspect would make them assertions about the
 * aspect. lib/fieldOfView.test.ts is where the shipped field is checked.
 */
function lookFrom(from: Point3, at: Point3 = { x: 0, y: TOWER.topY / 2, z: 0 }, aspect = 375 / 812) {
  const cam = new THREE.PerspectiveCamera(50, aspect, 0.1, 600)
  cam.position.set(from.x, from.y, from.z)
  cam.lookAt(at.x, at.y, at.z)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
  return { eye: from, planes: frustumPlanes(vp.elements) }
}

/** A camera at a bearing and height, aimed at the middle of the tower. */
function look(azimuthDeg: number, distance: number, height: number) {
  const n = azimuthToVector(azimuthDeg)
  return lookFrom({ x: n.x * distance, y: height, z: n.z * distance })
}

/** A point on the axis of an opening, `out` metres outside its face. */
function onAxis(o: OpeningAperture, out: number): Point3 {
  const n = azimuthToVector(o.azimuthDeg)
  return { x: n.x * (o.outerRadius + out), y: o.centreY, z: n.z * (o.outerRadius + out) }
}

describe('the fixture this is all measured against', () => {
  it('has openings to test — if it ever empties, every assertion below goes quiet', () => {
    expect(APERTURES.length).toBeGreaterThan(0)
  })

  it('is the same list the shell is cut with, not a second reading of the data', () => {
    expect(APERTURES.map((a) => a.id)).toEqual(SHIPPED_CUTS.map((c) => c.id))
  })
})

describe('frustumPlanes', () => {
  const { planes } = look(45, 51, 24)

  it('gives six planes with unit normals', () => {
    expect(planes).toHaveLength(6)
    for (const p of planes) expect(Math.hypot(p.a, p.b, p.c)).toBeCloseTo(1, 10)
  })

  it('agrees with three.js on what is in view', () => {
    const n = azimuthToVector(45)
    const cam = new THREE.PerspectiveCamera(50, 375 / 812, 0.1, 600)
    cam.position.set(n.x * 51, 24, n.z * 51)
    cam.lookAt(0, TOWER.topY / 2, 0)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()
    const theirs = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
    )
    const probes: Array<[number, number, number]> = [
      [0, 12, 0],
      [0, 0, 0],
      [0, TOWER.topY, 0],
      [200, 12, 200],
      [-60, 12, -60],
      [0, 200, 0],
      [8, 3, 8],
    ]
    for (const [x, y, z] of probes) {
      expect(sphereInFrustum(planes, { x, y, z }, 1)).toBe(
        theirs.intersectsSphere(new THREE.Sphere(new THREE.Vector3(x, y, z), 1)),
      )
    }
  })
})

describe('eyeSeesThrough — the sun’s test with the eye’s extra term', () => {
  const slit = APERTURES[0]

  it('sees straight down the axis of an opening', () => {
    expect(eyeSeesThrough(onAxis(slit, 30), slit)).toBe(true)
  })

  it('refuses an eye behind the outer face — that eye is not outside', () => {
    expect(eyeSeesThrough({ x: 0, y: slit.centreY, z: 0 }, slit)).toBe(false)
  })

  it('is never stricter than the parallel-beam test the sun uses', () => {
    // every aperture, at every bearing the sun could admit light from: if the
    // sun gets in from that bearing, so does an eye standing on it
    for (const o of APERTURES) {
      const face = outerFaceCentre(o)
      for (let offset = -89; offset <= 89; offset += 1) {
        const sun = { azimuthDeg: o.azimuthDeg + offset, altitudeDeg: 0, isUp: true }
        const hit = beamThroughOpening(sun, o)
        if (!hit?.entersRoom) continue
        // out along that bearing FROM THE FACE, not from the axis: the face
        // stands 8.25 m off the centre and the parallax is a degree at 400 m
        const n = azimuthToVector(sun.azimuthDeg)
        const far = { x: face.x + n.x * 400, y: face.y, z: face.z + n.z * 400 }
        expect(eyeSeesThrough(far, o)).toBe(true)
      }
    }
  })

  it('converges on the sun’s answer as the eye retreats', () => {
    // the extra term is a·D/d: at 400 m from a 4 m reveal it is under 1% of the
    // budget, so the two tests must agree on a bearing right at the edge
    const o = APERTURES[0]
    const face = outerFaceCentre(o)
    let edge = 0
    for (let deg = 0; deg <= 89; deg += 0.25) {
      const hit = beamThroughOpening({ azimuthDeg: o.azimuthDeg + deg, altitudeDeg: 0, isUp: true }, o)
      if (hit?.entersRoom) edge = deg
    }
    const n = azimuthToVector(o.azimuthDeg + edge + 1)
    expect(
      eyeSeesThrough({ x: face.x + n.x * 4000, y: face.y, z: face.z + n.z * 4000 }, o),
    ).toBe(false)
  })

  it('lets an eye close to the wall see in from further off the axis', () => {
    // the whole point of the extra term: near the face the aperture subtends a
    // wide angle, and a parallel-beam test would cull something in plain view
    const o = APERTURES[0]
    const n = azimuthToVector(o.azimuthDeg)
    const t = { x: -n.z, z: n.x }
    const near = {
      x: n.x * (o.outerRadius + 0.4) + t.x * (o.outerWidth / 2) * 0.9,
      y: o.centreY,
      z: n.z * (o.outerRadius + 0.4) + t.z * (o.outerWidth / 2) * 0.9,
    }
    expect(eyeSeesThrough(near, o)).toBe(true)
  })

  it('shuts a deep slit down within a few degrees of its own axis', () => {
    // "narrow outside, flaring inward" is the whole form of a loophole; if this
    // ever passes at 60° the reveal has stopped being a reveal
    const o = APERTURES[0]
    const n = azimuthToVector(o.azimuthDeg + 60)
    expect(eyeSeesThrough({ x: n.x * 60, y: o.centreY, z: n.z * 60 }, o)).toBe(false)
  })
})

describe('the outer face', () => {
  it('sits on the drum at the opening’s own bearing', () => {
    for (const o of APERTURES) {
      const c = outerFaceCentre(o)
      expect(Math.hypot(c.x, c.z)).toBeCloseTo(o.outerRadius, 9)
      expect(c.y).toBe(o.centreY)
    }
  })

  it('is bounded by a sphere no smaller than the rectangle it covers', () => {
    for (const o of APERTURES) {
      expect(outerFaceRadius(o) * 2).toBeGreaterThanOrEqual(Math.max(o.outerWidth, o.outerHeight))
    }
  })
})

describe('interiorVisibleFromOutside', () => {
  it('is culled from the view the visitor lands on', () => {
    // the default camera, (36, 24, 36) — App.tsx: high above every opening's
    // axis, and the doorway faces the other way. This is the 23 draw calls.
    const { eye, planes } = lookFrom({ x: 36, y: 24, z: 36 })
    expect(
      interiorVisibleFromOutside(eye, planes, APERTURES, { ...SITE, entrance: ENTRANCE_PORTAL }),
    ).toBe(false)
  })

  it('comes back the moment the doorway is in front of the camera', () => {
    const { eye, planes } = look(ENTRANCE.azimuthDeg, 40, ENTRANCE_PORTAL.centreY)
    expect(
      interiorVisibleFromOutside(eye, planes, APERTURES, { ...SITE, entrance: ENTRANCE_PORTAL }),
    ).toBe(true)
  })

  it('comes back for an eye level with an opening and on its axis', () => {
    const o = APERTURES[0]
    const { eye, planes } = lookFrom(onAxis(o, 25), outerFaceCentre(o))
    expect(
      interiorVisibleFromOutside(eye, planes, APERTURES, { ...SITE, entrance: ENTRANCE_PORTAL }),
    ).toBe(true)
  })

  it('draws everything for a camera inside the drum, whatever it is pointed at', () => {
    const { planes } = look(45, 51, 24)
    for (const f of FLOORS) {
      expect(
        interiorVisibleFromOutside({ x: 0, y: f.floorY + 1, z: 0 }, planes, APERTURES, {
          ...SITE,
          entrance: ENTRANCE_PORTAL,
        }),
      ).toBe(true)
    }
  })

  it('draws everything when it is handed no openings to reason with', () => {
    const { eye, planes } = look(45, 51, 24)
    expect(interiorVisibleFromOutside(eye, planes, [], { ...SITE, entrance: ENTRANCE_PORTAL })).toBe(
      true,
    )
  })

  it('is decided by the openings and not by the bearing alone', () => {
    // a full turn at the height of the openings: the interior must come back
    // somewhere, or the test is culling the building rather than proving it hidden
    let visible = 0
    for (let az = 0; az < 360; az += 5) {
      const { eye, planes } = look(az, 40, FLOORS[1].floorY + 1.5)
      if (interiorVisibleFromOutside(eye, planes, APERTURES, { ...SITE, entrance: ENTRANCE_PORTAL }))
        visible += 1
    }
    expect(visible).toBeGreaterThan(0)
    expect(visible).toBeLessThan(72)
  })
})
