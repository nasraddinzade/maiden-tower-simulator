import { useEffect, useMemo } from 'react'
import { createMasonryMaterial, type MasonryMaterial, type MasonryOptions } from '../shaders/masonryMaterial'

export interface MasonryControls {
  coursePeriod: number
  bandContrast: number
  diamondStrength: number
  diamondScale: number
  colourNoise: number
}

/**
 * One shared limestone material per surface class.
 *
 * The material is created once and its uniforms are updated in place, so
 * dragging a slider does not recompile the shader or rebuild any geometry.
 */
export function useMasonry(controls: MasonryControls, opts: MasonryOptions = {}): MasonryMaterial {
  const material = useMemo(
    () => createMasonryMaterial(opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.interior],
  )

  useEffect(() => {
    const u = material.masonryUniforms
    u.uCoursePeriod.value = controls.coursePeriod
    u.uBandContrast.value = controls.bandContrast
    u.uDiamondScale.value = controls.diamondScale
    u.uColourNoise.value = controls.colourNoise
    u.uDiamondStrength.value = opts.interior
      ? controls.diamondStrength * 0.4
      : controls.diamondStrength
  }, [material, controls, opts.interior])

  useEffect(() => () => material.dispose(), [material])

  return material
}
