import { describe, expect, it } from 'vitest'
import { countDegenerateTriangles, filterDegenerateTriangles, triangleDoubleArea } from './mesh'

describe('triangleDoubleArea', () => {
  it('is twice the area of a right triangle', () => {
    // legs 3 and 4 → area 6 → double area 12
    expect(triangleDoubleArea(0, 0, 0, 3, 0, 0, 0, 4, 0)).toBeCloseTo(12, 10)
  })
  it('is zero for collinear points', () => {
    expect(triangleDoubleArea(0, 0, 0, 1, 1, 1, 2, 2, 2)).toBeCloseTo(0, 12)
  })
  it('is zero for coincident points', () => {
    expect(triangleDoubleArea(1, 1, 1, 1, 1, 1, 5, 2, 3)).toBeCloseTo(0, 12)
  })
})

describe('countDegenerateTriangles', () => {
  it('counts none in a valid indexed quad (two good triangles)', () => {
    // unit square, two triangles
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]
    const index = [0, 1, 2, 0, 2, 3]
    expect(countDegenerateTriangles(positions, index)).toBe(0)
  })

  it('detects a collapsed (collinear) triangle', () => {
    const positions = [
      0, 0, 0, 1, 0, 0, 1, 1, 0, // good
      0, 0, 0, 2, 0, 0, 4, 0, 0, // collinear → degenerate
    ]
    const index = [0, 1, 2, 3, 4, 5]
    expect(countDegenerateTriangles(positions, index)).toBe(1)
  })

  it('works on non-indexed geometry', () => {
    const positions = [
      0, 0, 0, 1, 0, 0, 0, 1, 0, // good
      5, 5, 5, 5, 5, 5, 5, 5, 5, // coincident → degenerate
    ]
    expect(countDegenerateTriangles(positions, null)).toBe(1)
  })
})

describe('filterDegenerateTriangles', () => {
  const positions = [
    0, 0, 0, // 0
    1, 0, 0, // 1
    1, 1, 0, // 2
    2, 0, 0, // 3
    4, 0, 0, // 4
  ]

  it('drops degenerate triangles and keeps the good ones', () => {
    const index = [0, 1, 2, /* collinear: */ 0, 3, 4, /* good: */ 0, 2, 3]
    const out = filterDegenerateTriangles(positions, index)
    expect(out).toEqual([0, 1, 2, 0, 2, 3])
    expect(out.length / 3).toBe(2)
  })

  it('leaves a clean index untouched', () => {
    const index = [0, 1, 2]
    expect(filterDegenerateTriangles(positions, index)).toEqual([0, 1, 2])
  })

  it('produces an index with zero degenerates by construction', () => {
    const index = [0, 1, 2, 0, 3, 4, 0, 0, 0]
    const out = filterDegenerateTriangles(positions, index)
    expect(countDegenerateTriangles(positions, out)).toBe(0)
  })
})
