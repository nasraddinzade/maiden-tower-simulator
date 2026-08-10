import * as THREE from 'three'
import {
  COURSE_HEIGHT,
  LIMESTONE_INTERIOR,
  LIMESTONE_INTERIOR_MORTAR,
  LIMESTONE_LIGHT,
  LIMESTONE_MORTAR,
} from '../lib/masonry'
import { TOWER } from '../config/tower'

export interface MasonryOptions {
  /** Interior stone is darker and rougher than the weathered outside face. */
  interior?: boolean
  /** Height of one course, metres. */
  coursePeriod?: number
  /** How strongly the banding shows in the base colour. 1 = as measured. */
  bandContrast?: number
  /** Thickness of the bed joint, metres. */
  jointThickness?: number
  /** Strength of the diamond tooling at the top of the tower. */
  diamondStrength?: number
  /** Size of the lozenges, repeats per metre. */
  diamondScale?: number
  /** Amount of large-scale colour drift, so the stone is not uniform. */
  colourNoise?: number
}

export interface MasonryMaterial extends THREE.MeshStandardMaterial {
  masonryUniforms: {
    uCoursePeriod: { value: number }
    uBandContrast: { value: number }
    uJointThickness: { value: number }
    uDiamondStrength: { value: number }
    uDiamondScale: { value: number }
    uColourNoise: { value: number }
    uTowerHeight: { value: number }
    uLight: { value: THREE.Color }
    uMortar: { value: THREE.Color }
  }
}

/**
 * Procedural limestone (Phase 7).
 *
 * Built by injecting into MeshStandardMaterial rather than writing a bespoke
 * ShaderMaterial, so the stone keeps real PBR shading — which matters, because
 * Phase 8 puts an astronomically-placed sun on it and the whole point is that
 * the light behaves correctly.
 *
 * Three effects, all from world position so they line up across separate meshes
 * (shell, floors, cupolas, steps) with no UV seams to manage:
 *   - horizontal courses banded on world Y
 *   - diamond tooling that fades in with height, as [ref] describes
 *   - low-frequency colour drift so the surface is not plastic
 */
export function createMasonryMaterial(opts: MasonryOptions = {}): MasonryMaterial {
  const interior = opts.interior ?? false

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(interior ? LIMESTONE_INTERIOR : LIMESTONE_LIGHT),
    roughness: interior ? 0.98 : 0.92, // interior is more weathered [ref]
    metalness: 0,
  }) as MasonryMaterial

  const uniforms = {
    uCoursePeriod: { value: opts.coursePeriod ?? COURSE_HEIGHT },
    /*
     * m — thickness of the bed joint itself, NOT a fraction of the course.
     *
     * It used to be a fraction, and the fraction was 0.28: on a 0.35 m course
     * that is a 10 cm band of mortar between every pair of stones. The tower is
     * dressed ashlar laid on thin gypsum beds — the courses read as LINES in
     * every photograph of it, and at 10 cm they came out as broad dark stripes,
     * which is most of why the walls looked painted rather than built.
     * [ASSUMPTION], but a joint of a couple of centimetres is what ashlar means.
     */
    uJointThickness: { value: opts.jointThickness ?? 0.022 },
    uBandContrast: { value: opts.bandContrast ?? 1 },
    /*
     * NO DIAMOND TOOLING ON THE OUTSIDE, and this contradicts a source.
     *
     * [ref] describes a diamond dressing growing decorative toward the top, and
     * the shader has faded one in with height ever since. A reading of the
     * exterior set says flatly that no lozenge field exists on the building:
     * what the photographs show is per-block variation and weathering, and the
     * effect reached 17% darkening at the crown — the strongest thing on the
     * wall after the coursing, and invented.
     *
     * The photographs win, because the model's target is the tower AS IT STANDS
     * and they are of that. But the source is not deleted: [ref] may be
     * describing the INTERIOR, where the dressing is kept at its old strength,
     * or a state before restoration, or a detail too fine for a photograph taken
     * from the ground. The conflict is recorded rather than resolved, and the
     * verification pass that would have tested the reading against the images
     * died on a session limit — so this is one reading, unchecked.
     */
    uDiamondStrength: { value: opts.diamondStrength ?? (interior ? 0.25 : 0) },
    uDiamondScale: { value: opts.diamondScale ?? 2.2 },
    uColourNoise: { value: opts.colourNoise ?? 0.12 },
    uTowerHeight: { value: TOWER.height },
    uLight: { value: new THREE.Color(interior ? LIMESTONE_INTERIOR : LIMESTONE_LIGHT) },
    /*
     * The joint belongs to the face it is on. Both branches used to take the
     * exterior mortar, which is lighter than the interior stone — so `mix(uMortar,
     * uLight, band)` ran backwards indoors and every bed line came out as a pale
     * streak. See LIMESTONE_INTERIOR_MORTAR for the derivation and the question
     * left for the owner.
     */
    uMortar: { value: new THREE.Color(interior ? LIMESTONE_INTERIOR_MORTAR : LIMESTONE_MORTAR) },
  }
  material.masonryUniforms = uniforms

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vMasonryWorld;
         varying vec3 vMasonryNormalW;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vMasonryWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         // world normal, so the fragment stage can tell a wall face from a soffit
         vMasonryNormalW = normalize(mat3(modelMatrix) * objectNormal);`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vMasonryWorld;
         varying vec3 vMasonryNormalW;
         uniform float uCoursePeriod;
         uniform float uJointThickness;
         uniform float uBandContrast;
         uniform float uDiamondStrength;
         uniform float uDiamondScale;
         uniform float uColourNoise;
         uniform float uTowerHeight;
         uniform vec3  uLight;
         uniform vec3  uMortar;

         float masonryHash(vec2 p) {
           return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
         }

         float masonryNoise(vec2 p) {
           vec2 i = floor(p), f = fract(p);
           vec2 u = f * f * (3.0 - 2.0 * f);
           return mix(
             mix(masonryHash(i), masonryHash(i + vec2(1.0, 0.0)), u.x),
             mix(masonryHash(i + vec2(0.0, 1.0)), masonryHash(i + vec2(1.0, 1.0)), u.x),
             u.y);
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           float period = max(uCoursePeriod, 0.02);
           float t = fract(vMasonryWorld.y / period);
           // the joint is a real thickness, not a share of the course; smoothed
           // over about a millimetre so it does not alias at a grazing angle
           float joint = clamp(uJointThickness / period, 0.004, 0.5);
           float band = smoothstep(0.0, joint, t);

           /*
            * Courses belong on a WALL FACE, not on a soffit or a floor.
            *
            * The banding is a function of world Y alone, which is right on a
            * vertical face: each bed joint is a horizontal line. On a horizontal
            * or near-horizontal surface it is badly wrong — Y barely changes
            * across the whole face, so a single course smears over the lot, and
            * on the curved soffit of the entrance tunnel each band stretched
            * into a metres-long streak. Walking in from the street you met a
            * starburst instead of a passage.
            *
            * Real masonry shows its beds where the stone is FACED and not where
            * you are looking at the underside of it, so fading the banding out
            * as the surface turns horizontal is what the material does anyway.
            */
           float faceUp = abs(normalize(vMasonryNormalW).y);
           float faceness = 1.0 - smoothstep(0.55, 0.92, faceUp);
           band = mix(1.0, band, clamp(uBandContrast, 0.0, 2.0) * faceness);

           // position around the wall, so the lozenges wrap without a UV seam
           float around = atan(vMasonryWorld.z, vMasonryWorld.x) * 3.0;
           float up = vMasonryWorld.y;
           // the lozenge dressing is a face treatment too, and smears the same way
           float d1 = abs(fract((around + up) * uDiamondScale) - 0.5) * 2.0;
           float d2 = abs(fract((around - up) * uDiamondScale) - 0.5) * 2.0;
           float diamond = min(d1, d2);

           // [ref]: the diamond dressing is decorative high up, plain lower down
           float heightT = clamp(vMasonryWorld.y / max(uTowerHeight, 1.0), 0.0, 1.0);
           float diamondAmount = uDiamondStrength * heightT * heightT * faceness;

           float drift = masonryNoise(vec2(around * 2.0, up * 1.7)) - 0.5;

           vec3 stone = mix(uMortar, uLight, band);
           stone *= 1.0 + drift * uColourNoise;
           stone *= 1.0 - diamondAmount * 0.28 * (1.0 - diamond);

           diffuseColor.rgb *= stone / max(uLight, vec3(0.001));
         }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         {
           float period2 = max(uCoursePeriod, 0.02);
           float tt = fract(vMasonryWorld.y / period2);
           // recessed joints read as rougher than the dressed course face
           roughnessFactor = clamp(roughnessFactor + (1.0 - smoothstep(0.0, 0.28, tt)) * 0.06, 0.0, 1.0);
         }`,
      )
  }

  // force a recompile when the flag changes
  material.customProgramCacheKey = () => `masonry-${interior ? 'in' : 'out'}`
  return material
}
