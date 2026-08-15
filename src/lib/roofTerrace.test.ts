/**
 * THE TERRACE, ASSERTED ON THE BUILT SHELL.
 *
 * config/tower.test.ts already checks the terrace's ARITHMETIC — that the wall
 * top is spent on paving plus parapet with nothing left over. It could do that
 * while the model went on building the old roof, and for a day it did: the
 * numbers described a terrace crossing the wall and FloorStructures drew a deck
 * stopping at the room face under a ring 3.733 m thick, with the stair tearing
 * a 50° trench through that ring to get out.
 *
 * So these are cast at the geometry instead. Most of them are FALSE of the roof
 * this model built until 2026-08-14, which is the point of writing them: there
 * was no bed at r 7.4 to stand on but the top of the wall, the passage cutter
 * was clamped 1.05 m too high, a 0.190 m fin of stone stood on the terrace, and
 * the deck's colliders stopped 3 m short of the parapet. Rule 6 is satisfied —
 * nothing here renders; a raycast against a BufferGeometry is arithmetic on a
 * triangle list.
 *
 * ONE OF THEM IS NOT A REGRESSION TEST AND IS KEPT ANYWAY. The parapet ring
 * reading at r 7.6…8.2 passed on the old code too, and saying so is the honest
 * way to hold it: the old breach went through the ring's INNER part, from the
 * deck's edge at r 4.52 out to the passage's cheek at 5.73, so a ray dropped
 * outside 7.5 never met it. What that ray met instead was 3.7 m of "parapet",
 * which is the thing the bed test now catches. The ring reading guards the
 * property the footage is most explicit about — no break anywhere on the
 * circuit — against whatever comes next.
 *
 * The evidence they encode is the owner's roof walk: roof/016 (paving out to a
 * thin parapet, nothing past the coping but the city), roof/001, roof/021,
 * roof/028, roof/032 (the same wall from every side of the circuit), roof/007
 * and up/250 (the parapet running on unbroken past the stair, which comes up
 * through the paving at deck level).
 */

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  BALUSTRADE,
  BUTTRESS,
  ENTRANCE,
  FLOORS,
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
  stairwellSpanDeg,
} from './staircase'
import { floorColliders, guardRingBoxes } from './collision'
import { SHIPPED_CUTS } from './openings.fixture'
import { buildShellGeometry, type ShellParams } from './towerShell'

const DEG = Math.PI / 180

const flights = planAllFlights(stairSettings(), WALL_LIFTS, innerRadiusAt)
const tubes = stairPassageSections(
  flights,
  STAIR.width,
  PLAYER.stairHeadroom,
  innerRadiusAt,
  ROOF.masonryTopY,
  undefined,
  STAIR.doorwayWidth,
)

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
const mesh = new THREE.Mesh(built.geometry, new THREE.MeshBasicMaterial())
mesh.updateMatrixWorld(true)

/** World Y of the first surface a ray dropped from above the tower meets, or NaN. */
function topAt(azimuthDeg: number, radius: number): number {
  const a = azimuthDeg * DEG
  const rc = new THREE.Raycaster()
  rc.far = 60
  rc.set(
    new THREE.Vector3(Math.sin(a) * radius, TOWER.topY + 4, -Math.cos(a) * radius),
    new THREE.Vector3(0, -1, 0),
  )
  const hits = rc.intersectObject(mesh, false)
  return hits.length ? hits[0].point.y : Number.NaN
}

describe('the parapet is a ring and the stair does not go through it', () => {
  it('stands at the top of the tower at every azimuth, all the way round', () => {
    /*
     * THE ASSERTION THE FOOTAGE IS FOR. Two readings walked all 32 roof frames
     * looking for a break in the parapet and found none, at the stair head or
     * anywhere else (roof/007, up/250).
     *
     * Sampled at three radii across the parapet's own thickness and at every
     * degree, which is 1080 rays: a breach 50° wide could not survive one of
     * them, and neither could a notch a degree wide. See the note at the top of
     * this file for why it is the one reading here that the old roof also passed.
     */
    const misses: string[] = []
    for (const r of [
      ROOF.deckOuterRadius + 0.1,
      (ROOF.deckOuterRadius + TOWER.outerRadius) / 2,
      TOWER.outerRadius - 0.05,
    ]) {
      for (let a = 0; a < 360; a += 1) {
        const y = topAt(a, r)
        if (!(Math.abs(y - TOWER.topY) < 1e-3)) misses.push(`r ${r.toFixed(2)} az ${a}: ${y}`)
      }
    }
    expect(misses).toEqual([])
  })

  it('is never reached by the stair, which stops two metres inside it', () => {
    /*
     * The arithmetic behind the raycast, stated where it can be read. The
     * passage's outer cheek is the furthest out any stair cutter goes, and the
     * clearance to the parapet's inner face is the margin the breach used to eat
     * through. It is not a tolerance: it is 1.77 m of solid wall.
     */
    const furthest = Math.max(...tubes.flat().map((s) => s.outerRadius))
    expect(furthest).toBeLessThan(ROOF.deckOuterRadius)
    expect(ROOF.deckOuterRadius - furthest).toBeGreaterThan(1.5)
  })

  it('never has a cutter above it, because the cutters stop under the paving', () => {
    // the clamp, stated on the shipped tubes rather than on a synthetic tower
    for (const [i, tube] of tubes.entries()) {
      for (const s of tube) {
        expect(s.topY, `flight ${i} at az ${s.azimuthDeg.toFixed(2)}`).toBeLessThanOrEqual(
          ROOF.masonryTopY + 1e-9,
        )
        // and no section survives that had no stone to sit in at all
        expect(s.bottomY).toBeLessThan(ROOF.masonryTopY)
      }
    }
  })
})

describe('the paving crosses the wall', () => {
  /** Radii across the paved band, from just outside the room face to the parapet. */
  const pavedRadii = [
    ROOF.deckInnerRadius + 0.15,
    (ROOF.deckInnerRadius + ROOF.deckOuterRadius) / 2,
    ROOF.deckOuterRadius - 0.1,
  ]

  it('leaves a flat bed at the masonry top right out to the parapet', () => {
    /*
     * The old roof had NOTHING here: outboard of the room face the wall ran on
     * up to 27.500 as one solid ring, so a ray dropped at r 7.4 hit the top of
     * the tower rather than a terrace. That is the reading this inverts.
     *
     * The outermost radius is checked at every degree and must be unbroken —
     * the stair is nowhere near it. The inner two are allowed the stair mouth,
     * which the next test measures.
     */
    for (let a = 0; a < 360; a += 1) {
      const y = topAt(a, ROOF.deckOuterRadius - 0.1)
      expect(Math.abs(y - ROOF.masonryTopY), `az ${a}`).toBeLessThan(1e-3)
    }
  })

  it('stands nothing on the deck — no fin, no shelf, no second wall top', () => {
    /*
     * Fault A's leftovers, asserted away. The old arrangement left a blade of
     * stone 0.190 m thick and 0.751 m high standing on the terrace for 4.4 m,
     * where the deck's edge and the passage's cheek failed to meet, and outboard
     * of it a shelf of wall top 3 m across. Anything of the kind would be the
     * FIRST surface a ray meets, above the bed.
     */
    const proud: string[] = []
    for (const r of pavedRadii) {
      for (let a = 0; a < 360; a += 2) {
        const y = topAt(a, r)
        if (Number.isFinite(y) && y > ROOF.masonryTopY + 1e-3) {
          proud.push(`r ${r.toFixed(2)} az ${a}: ${y.toFixed(3)}`)
        }
      }
    }
    expect(proud).toEqual([])
  })

  it('opens once, in one place, and that place is the stair mouth', () => {
    /*
     * The stair comes up THROUGH the deck (roof/007), so the bed must be open
     * over it — and nowhere else. Measured at the passage's own mid radius: the
     * open arc has to be a single run, wide enough to be a way out and narrow
     * enough not to be a trench.
     *
     * The last flight's own arc is 51°, and the sector open here is that part of
     * it where the treads have climbed past the paving's underside. It is bigger
     * than the hole cut in the paving itself, and that difference is not slack:
     * it is the stretch the paving course roofs on its own, which is what a
     * lintel over a stair mouth is.
     */
    const roofTube = tubes[tubes.length - 1]
    const midR = (roofTube[0].innerRadius + roofTube[0].outerRadius) / 2
    const open: number[] = []
    for (let a = 0; a < 360; a += 1) {
      const y = topAt(a, midR)
      if (!Number.isFinite(y) || y < ROOF.masonryTopY - 0.05) open.push(a)
    }
    expect(open.length).toBeGreaterThan(20)
    expect(open.length).toBeLessThan(70)
    // one contiguous run, modulo the odd ray that grazes an edge
    const runs = open.reduce<number[][]>((acc, a) => {
      const last = acc[acc.length - 1]
      if (last && a - last[last.length - 1] <= 2) last.push(a)
      else acc.push([a])
      return acc
    }, [])
    const biggest = runs.reduce((b, r) => (r.length > b.length ? r : b))
    expect(biggest.length / open.length).toBeGreaterThan(0.85)
  })
})

describe('the deck is carried, and carried all the way to the parapet', () => {
  /*
   * The collider side of the same rebuild. `floorColliders` is pure, so this is
   * the real ring the walker stands on rather than a model of it.
   */
  const roofFlight = flights[flights.length - 1]
  const span = stairwellSpanDeg(
    roofFlight,
    // the underside of the paving, which is what roofs the last of the climb
    ROOF.deckY - ROOF.pavingDepth,
    PLAYER.stairHeadroom,
  )!
  const inner = innerRadiusAt(ROOF.deckY) + STAIR.wallClearance
  const well = {
    centreAzimuthDeg: span.centreAzimuthDeg,
    widthDeg: span.widthDeg,
    innerRadius: inner,
    outerRadius: inner + STAIR.width + 0.1,
  }
  const boxes = floorColliders({
    sectors: 24,
    floorY: ROOF.deckY,
    thickness: ROOF.pavingDepth,
    oculusRadius: FLOORS[FLOORS.length - 1].oculusRadius,
    outerRadius: ROOF.deckOuterRadius,
    stairwell: well,
  })

  const outerReach = (b: (typeof boxes)[number]) =>
    Math.hypot(b.position[0], b.position[2]) + b.halfExtents[0]

  /** Does a box cover this point in plan, in the box's OWN frame? */
  const containsPlan = (b: (typeof boxes)[number], azimuthDeg: number, radius: number) => {
    const a = azimuthDeg * DEG
    const px = Math.sin(a) * radius
    const pz = -Math.cos(a) * radius
    const boxAz = Math.atan2(b.position[0], -b.position[2])
    const dx = px - b.position[0]
    const dz = pz - b.position[2]
    const lx = dx * Math.sin(boxAz) - dz * Math.cos(boxAz)
    const lz = dx * Math.cos(boxAz) + dz * Math.sin(boxAz)
    return Math.abs(lx) <= b.halfExtents[0] + 1e-9 && Math.abs(lz) <= b.halfExtents[2] + 1e-9
  }

  it('reaches the parapet somewhere on every bearing', () => {
    /*
     * The old deck collider stopped at innerRadiusAt(deckY) — the room face —
     * because that is where the drawn deck stopped and the wall above was solid.
     * With the terrace crossing the wall, a walker who stepped past r 4.52 would
     * have walked off the collider onto drawn paving and fallen 27 m.
     */
    for (const b of boxes) expect(outerReach(b)).toBeLessThan(ROOF.deckOuterRadius + 1e-6)
    const reach = Math.max(...boxes.map(outerReach))
    expect(reach).toBeCloseTo(ROOF.deckOuterRadius, 6)
  })

  it('keeps the band OUTBOARD of the stair mouth, which no storey slab needs', () => {
    /*
     * The hole is a hole, not a bite. On a storey the flight runs in the wall and
     * the well takes the slab's outer lip, so shortening the ring is right; on
     * the roof there is 1.7 m of paving beyond the mouth that a visitor walks
     * round to reach the far side of the terrace. Shortened instead, the deck
     * would be missing from the mouth out to the parapet over the whole arc of
     * the opening, and the walk round the parapet would end in a fall.
     *
     * Asserted by standing on it rather than by counting boxes. The count was
     * what this used to check — two per sector inside the well — and a count is
     * exactly the kind of assertion that survives the geometry changing under
     * it: the mouth is now 70° rather than 16°, the sectors it straddles are cut
     * differently, and none of that is the point. The point is the paving
     * between the mouth and the parapet.
     */
    for (let a = 0; a < 360; a += 0.5) {
      for (const r of [well.outerRadius + 0.2, (well.outerRadius + ROOF.deckOuterRadius) / 2, ROOF.deckOuterRadius - 0.2]) {
        expect(boxes.some((b) => containsPlan(b, a, r)), `az ${a} r ${r.toFixed(2)}`).toBe(true)
      }
    }
  })

  /**
   * THE READING THE OWNER'S FAILURE WAS, taken on the shipped roof.
   *
   * On 2026-08-15 he could not get out onto the terrace, and the deck's own
   * arithmetic is where it stopped him. The opening in the paving was sized by
   * counting treads back from the head of the flight, the count came from a
   * riser read as zero, and what was cut was four treads' worth — 16.47° — over
   * a climb that spends 53° of arc under the paving with less than a walker's
   * height of stone above it. The head of the capsule met the underside of the
   * deck at azimuth 183, 2.05 m below the terrace and thirteen treads short of
   * it, and the clearance fell to zero from there on.
   *
   * These two say it in metres: every tread that has the paving over it has the
   * paving OPEN over it, and the way out is wide enough for the walker who has
   * to use it.
   */
  describe('the stair gets out', () => {
    const soffit = ROOF.deckY - ROOF.pavingDepth
    const holds = (azDeg: number, r: number) => boxes.some((b) => containsPlan(b, azDeg, r))

    it('has open sky over every tread the paving would come down on', () => {
      for (const s of roofFlight) {
        if (s.treadY + PLAYER.stairHeadroom <= soffit) continue
        expect(
          holds(s.azimuthDeg, s.midRadius),
          `tread at ${s.treadY.toFixed(3)} (az ${s.azimuthDeg.toFixed(2)}), ` +
            `${(soffit - s.treadY).toFixed(3)} m under the paving`,
        ).toBe(false)
      }
    })

    it('leaves the walker a capsule’s width of it at every tread', () => {
      /*
       * Open at a point is not enough — the capsule is 0.6 m across and climbs
       * the middle of a flight 0.9 m wide. Measured across the mouth radially,
       * which is the direction the ring's boxes close it in.
       */
      for (const s of roofFlight) {
        if (s.treadY + PLAYER.stairHeadroom <= soffit) continue
        let free = 0
        for (let r = well.innerRadius; r <= well.outerRadius; r += 0.005) {
          if (!holds(s.azimuthDeg, r)) free += 0.005
        }
        expect(free, `tread at az ${s.azimuthDeg.toFixed(2)}`).toBeGreaterThan(2 * PLAYER.radius)
      }
    })
  })

  it('raises the parapet as a ring on the terrace, standing where the deck ends', () => {
    /*
     * The other half of the collider rebuild, and the reason it is a separate
     * ring rather than the drum's top band: see the note in TowerColliders. What
     * matters here is that the two meet exactly — the deck's outer face and the
     * parapet's inner face are one radius, so there is no strip of deck outside
     * the collider and no band of stone standing on the paving.
     */
    const parapet = guardRingBoxes({
      sectors: 32,
      openingRadius: ROOF.deckOuterRadius,
      floorY: ROOF.masonryTopY,
      height: TOWER.topY - ROOF.masonryTopY,
      thickness: ROOF.parapetThickness,
      kind: 'wall',
    })
    expect(parapet.length).toBe(32)
    for (const b of parapet) {
      const mid = Math.hypot(b.position[0], b.position[2])
      expect(mid - b.halfExtents[0]).toBeCloseTo(ROOF.deckOuterRadius, 6)
      expect(mid + b.halfExtents[0]).toBeCloseTo(TOWER.outerRadius, 6)
      // and it shows the MEASURED parapet above the paving, with the course the
      // paving is laid in buried behind the rest of it
      expect(b.position[1] + b.halfExtents[1] - ROOF.deckY).toBeCloseTo(ROOF.parapetHeight, 6)
    }
  })
})

describe('the balustrade stands where the frames put it', () => {
  it('stands ON the paving, INSIDE the parapet, with its glass against the coping', () => {
    /*
     * The three facts every roof frame agrees on, in the order you meet them
     * walking out from the middle of the terrace: post, clamp, glass, parapet.
     * roof/010, roof/021, roof/028, roof/032 and the [PHOTO] bay all show the
     * posts inboard of the glass and the glass hard against the parapet's inner
     * face — never the other way about, which is what you would get by hanging
     * the panes off the posts on the room side.
     */
    expect(BALUSTRADE.postRadius).toBeLessThan(BALUSTRADE.glassRadius)
    expect(BALUSTRADE.glassRadius + BALUSTRADE.glassThickness / 2).toBeCloseTo(
      ROOF.deckOuterRadius,
      9,
    )
    // and the whole assembly is on the deck, not on the parapet's coping
    expect(BALUSTRADE.postRadius).toBeGreaterThan(ROOF.deckInnerRadius)
    expect(BALUSTRADE.postRadius).toBeLessThan(ROOF.deckOuterRadius)
  })

  it('caps its posts about level with the coping and carries the glass above it', () => {
    /*
     * Read against the parapet as a ruler, which is the only ruler the terrace
     * has: the post's cap is 0.06 m over the coping in the [PHOTO] bay and level
     * with it in roof/010, and the panes stand about a quarter of a metre higher
     * still. Both readings carry the parapet's own ±0.06, so these are brackets
     * rather than equalities — but the ORDER is not in doubt in any frame, and
     * that is what is asserted.
     */
    expect(Math.abs(BALUSTRADE.postHeight - ROOF.parapetHeight)).toBeLessThan(0.2)
    expect(BALUSTRADE.glassTop).toBeGreaterThan(ROOF.parapetHeight)
    expect(BALUSTRADE.glassTop).toBeGreaterThan(BALUSTRADE.postHeight)
    expect(BALUSTRADE.glassTop - ROOF.parapetHeight).toBeCloseTo(0.28, 1)
    // the pane hangs clear of the paving — the lower clamp is the lowest fitting
    expect(BALUSTRADE.glassBottom).toBeGreaterThan(0)
    expect(BALUSTRADE.glassBottom).toBeLessThan(BALUSTRADE.postHeight)
  })

  it('spaces its posts the way the circuit divides, to within a hand', () => {
    /*
     * The count is DERIVED and the spacing MEASURED, so this is the check that
     * the derivation has not quietly changed the measurement: dividing the
     * circumference into whole bays may not move the spacing by more than the
     * reading's own error.
     */
    const circumference = 2 * Math.PI * BALUSTRADE.postRadius
    const actual = circumference / BALUSTRADE.postCount
    expect(Math.abs(actual - BALUSTRADE.postSpacing)).toBeLessThan(0.1)
    expect(BALUSTRADE.postCount).toBeGreaterThan(30)
  })
})
