import { describe, expect, it } from 'vitest'
import { isStoreyVisible, lodSegments, storeyAt, visibleStoreys } from './visibility'
import { FLOORS, TOWER } from '../config/tower'

describe('storeyAt', () => {
  it('places the viewer on the ground storey at floor level', () => {
    expect(storeyAt(0, FLOORS)).toBe(0)
    expect(storeyAt(1.5, FLOORS)).toBe(0)
  })

  it('moves up as the viewer climbs', () => {
    for (let i = 0; i < FLOORS.length; i++) {
      expect(storeyAt(FLOORS[i].floorY + 0.5, FLOORS)).toBe(i)
    }
  })

  it('clamps below the tower and above the top', () => {
    expect(storeyAt(-40, FLOORS)).toBe(0)
    expect(storeyAt(TOWER.height + 50, FLOORS)).toBe(FLOORS.length - 1)
  })

  it('survives an empty floor list', () => {
    expect(storeyAt(10, [])).toBe(0)
  })
})

describe('isStoreyVisible', () => {
  it('keeps the viewer’s own storey and its neighbours', () => {
    expect(isStoreyVisible(3, 3)).toBe(true)
    expect(isStoreyVisible(2, 3)).toBe(true)
    expect(isStoreyVisible(4, 3)).toBe(true)
  })

  it('drops storeys further away', () => {
    expect(isStoreyVisible(1, 3)).toBe(false)
    expect(isStoreyVisible(6, 3)).toBe(false)
  })

  it('honours a wider radius', () => {
    expect(isStoreyVisible(1, 3, { radius: 2 })).toBe(true)
  })

  it('shows everything when asked, for the outside view', () => {
    expect(isStoreyVisible(0, 7, { showAll: true })).toBe(true)
  })
})

describe('visibleStoreys', () => {
  it('returns three storeys in the middle of the tower', () => {
    expect(visibleStoreys(4, FLOORS.length)).toEqual([3, 4, 5])
  })

  it('returns two at the very bottom and very top', () => {
    expect(visibleStoreys(0, FLOORS.length)).toEqual([0, 1])
    expect(visibleStoreys(7, FLOORS.length)).toEqual([6, 7])
  })

  it('returns all eight when showAll is set', () => {
    expect(visibleStoreys(0, FLOORS.length, { showAll: true })).toHaveLength(FLOORS.length)
  })

  it('cuts the drawn set to well under half the tower', () => {
    // the point of the optimisation: three storeys of eight
    expect(visibleStoreys(4, FLOORS.length).length / FLOORS.length).toBeLessThan(0.5)
  })
})

describe('lodSegments', () => {
  it('keeps full resolution on the viewer’s own storey', () => {
    expect(lodSegments(4, 4, 64)).toBe(64)
  })

  it('halves at one storey away and keeps falling', () => {
    expect(lodSegments(5, 4, 64)).toBe(32)
    expect(lodSegments(6, 4, 64)).toBeLessThan(32)
  })

  it('never drops below a floor that would make a ring visibly polygonal', () => {
    for (let d = 0; d < 8; d++) {
      expect(lodSegments(d, 0, 64)).toBeGreaterThanOrEqual(12)
    }
  })

  it('is symmetric above and below the viewer', () => {
    expect(lodSegments(2, 4, 64)).toBe(lodSegments(6, 4, 64))
  })
})
