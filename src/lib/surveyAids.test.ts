import { describe, expect, it } from 'vitest'
import { showSurveyAids } from './surveyAids'

/**
 * THE HELPERS SHIPPED. Measured on the phone against the public build,
 * 2026-08-24: prod_P_03_daylight.png, prod_L_02_sheet.png, prod_T_01_orbit.png
 * all show the ground grid, the axes cross and the corner axis gizmo.
 *
 * The gate was `!firstPerson`, which asks where the camera is standing. The
 * question it was meant to ask is who is looking.
 */
describe('who gets the survey aids', () => {
  it('the person building the tower, in the orbit view', () => {
    expect(showSurveyAids({ dev: true, walking: false })).toBe(true)
  })

  it('not even him once he is inside', () => {
    // the grid shows through the floor and the axes hang down the middle of
    // every room — this half of the rule was already right
    expect(showSurveyAids({ dev: true, walking: true })).toBe(false)
  })

  it('not the visitor, and this is the fault', () => {
    expect(showSurveyAids({ dev: false, walking: false })).toBe(false)
  })

  it('not the visitor inside either', () => {
    expect(showSurveyAids({ dev: false, walking: true })).toBe(false)
  })
})
