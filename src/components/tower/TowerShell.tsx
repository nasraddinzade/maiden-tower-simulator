import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { buildShellGeometry, type ShellParams, type ShellStats } from '../../lib/towerShell'

export type { ShellParams, ShellStats }

interface TowerShellProps extends ShellParams {
  onStats?: (stats: ShellStats) => void
  /** Attach a fixed trimesh collider so the player can walk against the walls. */
  withCollider?: boolean
  /** Procedural limestone from Phase 7; falls back to a plain colour. */
  material?: THREE.Material
  /** Phase-9 "Водосбор" layer: make the wall see-through so the pipes read. */
  xray?: boolean
}

/** Thin React wrapper: all geometry lives in lib/towerShell.ts (testable). */
export function TowerShell({ onStats, withCollider, material, xray, ...params }: TowerShellProps) {
  const {
    buttressAzimuthDeg,
    buttressProjection,
    buttressTipWidth,
    buttressRootArcDeg,
    buttressSkewDeg,
    buttressHeight,
    entranceAzimuthDeg,
    entranceWidth,
    entranceHeight,
    entranceSillY,
    windows,
    stairPassage,
    stairDoorways,
    wallChases,
  } = params

  const { geometry, stats } = useMemo(
    () =>
      buildShellGeometry({
        buttressAzimuthDeg,
        buttressProjection,
        buttressTipWidth,
        buttressRootArcDeg,
        buttressSkewDeg,
        buttressHeight,
        entranceAzimuthDeg,
        entranceWidth,
        entranceHeight,
        entranceSillY,
        windows,
        stairPassage,
        stairDoorways,
        wallChases,
      }),
    [
      buttressAzimuthDeg,
      buttressProjection,
      buttressTipWidth,
      buttressRootArcDeg,
      buttressSkewDeg,
      buttressHeight,
      entranceAzimuthDeg,
      entranceWidth,
      entranceHeight,
      entranceSillY,
      windows,
      stairPassage,
      stairDoorways,
      wallChases,
    ],
  )

  useEffect(() => {
    // Dev only. Every other diagnostic in this project is gated and this one was
    // not, so the public build's console opened on a CSG triangle count — the
    // one line in it that came from us.
    if (import.meta.env.DEV) {
      console.info(
        `[TowerShell] triangles=${stats.triangleCount} vertices=${stats.vertexCount} degenerate=${stats.degenerateCount}`,
      )
    }
    onStats?.(stats)
  }, [stats, onStats])

  useEffect(() => () => geometry.dispose(), [geometry])

  // In x-ray the shared procedural material would make every other surface
  // transparent too, so this branch uses its own instance.
  const mesh = xray ? (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#aab4c0"
        roughness={0.92}
        transparent
        opacity={0.09}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  ) : material ? (
    <mesh geometry={geometry} material={material} castShadow receiveShadow />
  ) : (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#9a938a" roughness={0.92} metalness={0} />
    </mesh>
  )

  /**
   * No collider here any more.
   *
   * This used to attach a trimesh collider straight to the CSG result. Two
   * things were wrong with that. docs/optimization-addendum.md forbids it —
   * collision geometry must be primitives, separate from the drawn mesh. And
   * measurement showed the CSG output is not watertight (14 183 boundary edges
   * of 26 876), which makes trimesh contacts unreliable: that is why a walker
   * could stand at radius 5.06 and see the horizon through the wall.
   *
   * The tower's collision now comes from TowerColliders.
   */
  void withCollider
  return mesh
}
