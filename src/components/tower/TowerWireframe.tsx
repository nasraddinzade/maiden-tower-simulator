import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { azimuthToVector } from '../../lib/geometry'
import { BUTTRESS, ENTRANCE, FLOORS, TOWER, innerRadiusAt } from '../../config/tower'

interface TowerWireframeProps {
  /** Show the inner tapered surface (inner radius grows with height). */
  showInner: boolean
  /** Show a horizontal ring at each storey's floor level. */
  showFloors: boolean
  /** Show a 1.75 m human-height marker for scale. */
  showScaleRef: boolean
  /** Show orientation markers for the buttress (east) and entrance (SE). */
  showFeatures: boolean
}

const RADIAL_SEGMENTS = 48

type Pt = [number, number, number]

/** Points of a horizontal circle at height y, radius r, in the XZ plane. */
function ringPoints(radius: number, y: number, segments = RADIAL_SEGMENTS): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push([Math.cos(a) * radius, y, Math.sin(a) * radius])
  }
  return pts
}

/**
 * Placement markers (NOT the real geometry — that is Phase 2) showing WHERE the
 * two features that make the plan non-circular will sit:
 *   - buttress: beak-like plan, points east (BUTTRESS.azimuthDeg), reaches
 *     BUTTRESS.projection beyond the wall, full height
 *   - entrance: doorway opening on the wall at ENTRANCE.azimuthDeg (SE placeholder)
 */
function FeatureMarkers() {
  const R = TOWER.outerRadius
  const H = TOWER.height

  const buttress = useMemo(() => {
    const d = azimuthToVector(BUTTRESS.azimuthDeg) // radial direction
    const t = { x: -d.z, z: d.x } // tangent along the wall
    // rough root spread, only for the Phase-1 marker outline
    const half = TOWER.outerRadius * Math.sin((BUTTRESS.rootArcDeg * Math.PI) / 360)
    const wallL: Pt = [d.x * R - t.x * half, 0, d.z * R - t.z * half]
    const wallR: Pt = [d.x * R + t.x * half, 0, d.z * R + t.z * half]
    const reach = R + BUTTRESS.projection
    const tip = { x: d.x * reach, z: d.z * reach }
    const beakAt = (y: number): Pt[] => [
      [wallL[0], y, wallL[2]],
      [tip.x, y, tip.z],
      [wallR[0], y, wallR[2]],
    ]
    return { wallL, wallR, tip, beakGround: beakAt(0), beakTop: beakAt(H) }
  }, [R, H])

  const entrance = useMemo(() => {
    const d = azimuthToVector(ENTRANCE.azimuthDeg)
    const t = { x: -d.z, z: d.x }
    const w = ENTRANCE.width / 2
    const wp = { x: d.x * R, z: d.z * R }
    const y0 = ENTRANCE.sillY
    const y1 = ENTRANCE.sillY + ENTRANCE.height
    const rect: Pt[] = [
      [wp.x + t.x * w, y0, wp.z + t.z * w],
      [wp.x - t.x * w, y0, wp.z - t.z * w],
      [wp.x - t.x * w, y1, wp.z - t.z * w],
      [wp.x + t.x * w, y1, wp.z + t.z * w],
      [wp.x + t.x * w, y0, wp.z + t.z * w],
    ]
    return { rect }
  }, [R])

  const beak = '#d94f4f'
  const door = '#2b7ac0'

  return (
    <group>
      {/* buttress: solid beak plan at ground, faint outline at top, verticals */}
      <Line points={buttress.beakGround} color={beak} lineWidth={2.5} />
      <Line points={buttress.beakTop} color={beak} lineWidth={1} transparent opacity={0.4} />
      <Line points={[buttress.wallL, [buttress.wallL[0], H, buttress.wallL[2]]]} color={beak} lineWidth={1} transparent opacity={0.4} />
      <Line points={[buttress.wallR, [buttress.wallR[0], H, buttress.wallR[2]]]} color={beak} lineWidth={1} transparent opacity={0.4} />
      <Line points={[[buttress.tip.x, 0, buttress.tip.z], [buttress.tip.x, H, buttress.tip.z]]} color={beak} lineWidth={1} transparent opacity={0.4} />

      {/* entrance opening on the wall */}
      <Line points={entrance.rect} color={door} lineWidth={2.5} />
    </group>
  )
}

/**
 * Phase-1 proportion check: wireframe of the shell straight from the config.
 * Outer drum is vertical; the inner surface tapers (wider at the top) because
 * the wall thins from the inside going up.
 */
export function TowerWireframe({ showInner, showFloors, showScaleRef, showFeatures }: TowerWireframeProps) {
  const floorRings = useMemo(
    () => FLOORS.map((f) => ({ key: f.index, pts: ringPoints(f.innerRadiusAtLevel, f.floorY) })),
    [],
  )

  return (
    <group>
      {/* Outer wall — near-vertical drum, constant radius */}
      <mesh position={[0, TOWER.height / 2, 0]}>
        <cylinderGeometry
          args={[TOWER.outerRadius, TOWER.outerRadius, TOWER.height, RADIAL_SEGMENTS, 1, true]}
        />
        <meshBasicMaterial color="#8a8f98" wireframe />
      </mesh>

      {/* Inner surface — truncated cone: wider at the top (wall thins from inside) */}
      {showInner && (
        <mesh position={[0, TOWER.height / 2, 0]}>
          <cylinderGeometry
            args={[
              innerRadiusAt(TOWER.height),
              innerRadiusAt(0),
              TOWER.height,
              RADIAL_SEGMENTS,
              1,
              true,
            ]}
          />
          <meshBasicMaterial color="#4aa3c7" wireframe transparent opacity={0.55} />
        </mesh>
      )}

      {/* Floor rings at each storey level */}
      {showFloors &&
        floorRings.map(({ key, pts }) => (
          <Line key={key} points={pts} color="#d9a441" lineWidth={1.5} />
        ))}

      {/* Orientation markers for buttress + entrance (real geometry is Phase 2) */}
      {showFeatures && <FeatureMarkers />}

      {/* 1.75 m human-height marker (scale reference) */}
      {showScaleRef && (
        <mesh position={[innerRadiusAt(0) - 0.5, 1.75 / 2, 0]}>
          <boxGeometry args={[0.4, 1.75, 0.4]} />
          <meshBasicMaterial color="#3fbf6f" />
        </mesh>
      )}
    </group>
  )
}
