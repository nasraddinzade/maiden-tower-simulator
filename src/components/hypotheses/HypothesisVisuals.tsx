import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CORBELS, type HypothesisVisuals } from '../../data/hypotheses'
import { TOWER, innerRadiusAt } from '../../config/tower'

export interface HypothesisVisualsProps {
  visuals: HypothesisVisuals
}

/**
 * Phase 10 — what each reading of the tower adds to the scene.
 *
 * Everything here is a HINT, drawn in a way that reads as interpretation rather
 * than as fabric: fires float, corbels glow, the beacon is a light. Nothing in
 * this component alters the measured geometry, so switching versions never
 * changes what the model claims the building actually is.
 */
export function HypothesisVisualsLayer({ visuals }: HypothesisVisualsProps) {
  const firesRef = useRef<THREE.Group>(null)

  /** Akhundov's seven fire outlets, spaced evenly around the crown. */
  const fires = useMemo(() => {
    const n = visuals.roofFires ?? 0
    if (n <= 0) return []
    const r = (TOWER.outerRadius + innerRadiusAt(TOWER.height)) / 2
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2
      return { key: i, position: [Math.cos(a) * r, TOWER.height + 0.7, Math.sin(a) * r] as [number, number, number] }
    })
  }, [visuals.roofFires])

  /**
   * The 30 lower and 31 upper corbels [ref] counts. Ahmadov reads them as the
   * days of the month; the model shows the counts so the reading can be judged.
   */
  const corbels = useMemo(() => {
    if (!visuals.highlightCorbels) return []
    const beltY = TOWER.height * CORBELS.beltHeightFraction
    const make = (count: number, y: number, band: 'lower' | 'upper') =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2
        const r = TOWER.outerRadius + 0.16
        return {
          key: `${band}-${i}`,
          position: [Math.cos(a) * r, y, Math.sin(a) * r] as [number, number, number],
          rotation: [0, -a, 0] as [number, number, number],
          band,
        }
      })
    return [
      ...make(CORBELS.lowerCount, beltY * 0.62, 'lower'),
      ...make(CORBELS.upperCount, beltY + (TOWER.height - beltY) * 0.55, 'upper'),
    ]
  }, [visuals.highlightCorbels])

  useFrame((state) => {
    if (!firesRef.current) return
    const t = state.clock.elapsedTime
    firesRef.current.children.forEach((child, i) => {
      // a little flicker so the flames do not read as static spheres
      const s = 0.85 + Math.sin(t * 6 + i * 1.7) * 0.12 + Math.sin(t * 11 + i) * 0.05
      child.scale.setScalar(s)
    })
  })

  return (
    <group>
      {fires.length > 0 && (
        <group ref={firesRef}>
          {fires.map((f) => (
            <group key={f.key} position={f.position}>
              <mesh>
                <sphereGeometry args={[0.42, 12, 12]} />
                <meshBasicMaterial color="#ffb347" transparent opacity={0.85} />
              </mesh>
              <pointLight color="#ff9a3c" intensity={12} distance={16} decay={2} />
            </group>
          ))}
        </group>
      )}

      {corbels.map((c) => (
        <mesh key={c.key} position={c.position} rotation={c.rotation}>
          <boxGeometry args={[0.42, 0.3, 0.34]} />
          <meshStandardMaterial
            color={c.band === 'lower' ? '#7fd18a' : '#9fd0ff'}
            emissive={c.band === 'lower' ? '#2f7a3c' : '#2a5f96'}
            emissiveIntensity={0.9}
            roughness={0.7}
          />
        </mesh>
      ))}

      {visuals.beacon && (
        <group position={[0, TOWER.height + 1.6, 0]}>
          <mesh>
            <sphereGeometry args={[0.75, 16, 16]} />
            <meshBasicMaterial color="#fff3cc" />
          </mesh>
          <pointLight color="#fff0bb" intensity={90} distance={140} decay={1.6} />
        </group>
      )}

      {visuals.sombre && <ambientLight color="#7f8ea3" intensity={0.12} />}
    </group>
  )
}
