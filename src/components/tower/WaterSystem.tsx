import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { azimuthToVector } from '../../lib/geometry'
import {
  buriedRunRadii,
  channelRings,
  flowPosition,
  pipeOuterDiameter,
  wellProfile,
} from '../../lib/waterSystem'
import { ENTRANCE, FLOORS, TOWER, WATER, WELL, innerRadiusAt } from '../../config/tower'
import { isStoreyVisible } from '../../lib/visibility'

export interface WaterSystemProps {
  /** Draw the pipes and the shaft at all. */
  visible: boolean
  /** Highlight mode: pipes glow and droplets run, for the "Водосбор" layer. */
  highlighted: boolean
  /** Storey the viewer is on, for culling (Phase 11). */
  viewerStorey?: number
  /** Skip culling — the x-ray layer and the outside view want the whole run. */
  showAll?: boolean
}

const DROPLETS = 14
/**
 * Tube resolution. A 22 cm ceramic pipe seen from a few metres does not need a
 * high-poly torus: at 8x72 the six rings alone were 43% of the interior's
 * triangles, measured with lib/renderBudget.
 */
const TUBE_RADIAL = 6
const TUBE_AROUND = 40

/**
 * Phase 9 — the water-collection system.
 *
 * [ref] documents this in more detail than almost anything else about the tower
 * (bore, wall thickness, segment length), and it is missing from every
 * reconstruction I could find, so it gets its own layer rather than being
 * buried in the geometry.
 */
export function WaterSystem({ visible, highlighted, viewerStorey = 0, showAll = true }: WaterSystemProps) {
  const wellY = FLOORS[WELL.startsAtFloorIndex].floorY
  const wellDir = azimuthToVector(WELL.azimuthDeg)
  const wellX = wellDir.x * WELL.offsetFromAxis
  const wellZ = wellDir.z * WELL.offsetFromAxis

  const shaft = useMemo(() => {
    const pts = wellProfile(
      wellY,
      WELL.depth,
      WELL.diameter,
      WELL.mouthDiameter,
      WELL.collarDepth,
    ).map((p) => new THREE.Vector2(p.r, p.y))
    return new THREE.LatheGeometry(pts, 32)
  }, [wellY])

  const rings = useMemo(
    () => channelRings(FLOORS, WATER.channelFloorRange, WATER.channelSegmentLength),
    [],
  )

  /** The downpipe: from the highest channel down into the wellhead. */
  const downpipe = useMemo(() => {
    const top = rings.length ? rings[rings.length - 1].y : FLOORS[6].floorY
    const bottom = wellY
    const height = Math.max(0.5, top - bottom)
    return { top, bottom, height, midY: (top + bottom) / 2 }
  }, [rings, wellY])
  const downpipeTopY = downpipe.top

  const buried = useMemo(
    () => buriedRunRadii(innerRadiusAt(0), TOWER.outerRadius),
    [],
  )

  /**
   * The vertical run stands INSIDE a chase cut into the wall, so it sits a
   * little BEYOND the room face rather than in front of it — and it still
   * follows the wall's taper, because the chase does.
   *
   * The museum's own cutaway (20260801_171223.mp4) draws this run dead plumb;
   * the photographs show it in a recess. Both are satisfied by keeping it in
   * the chase and letting the chase move outward with the wall.
   */
  const pipeClearance = -WATER.downpipeDiameter * 0.55
  const bottomRadius = innerRadiusAt(wellY) - pipeClearance
  const topRadius = innerRadiusAt(downpipeTopY) - pipeClearance
  const downpipeX = wellDir.x * bottomRadius
  const downpipeZ = wellDir.z * bottomRadius

  const downpipeLean = useMemo(() => {
    const a = new THREE.Vector3(wellDir.x * bottomRadius, wellY, wellDir.z * bottomRadius)
    const b = new THREE.Vector3(wellDir.x * topRadius, downpipeTopY, wellDir.z * topRadius)
    const dir = b.clone().sub(a)
    return {
      length: Math.max(0.5, dir.length()),
      mid: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      ),
    }
  }, [wellDir.x, wellDir.z, bottomRadius, topRadius, wellY, downpipeTopY])

  /** Lays the elbow's local +Y along the horizontal run to the wellhead. */
  const elbowQuaternion = useMemo(() => {
    const dir = new THREE.Vector3(wellX - downpipeX, 0, wellZ - downpipeZ)
    if (dir.lengthSq() < 1e-9) return new THREE.Quaternion()
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    )
  }, [wellX, wellZ, downpipeX, downpipeZ])

  const dropletsRef = useRef<THREE.InstancedMesh>(null)

  useFrame((state) => {
    const mesh = dropletsRef.current
    if (!mesh || !highlighted) return
    const t = state.clock.elapsedTime
    const m = new THREE.Matrix4()
    for (let i = 0; i < DROPLETS; i++) {
      // stagger the droplets so the fall reads as continuous
      const phase = (t * 0.35 + i / DROPLETS) % 1
      const y = flowPosition(downpipe.top, downpipe.bottom - WELL.depth * 0.35, phase)
      m.makeTranslation(wellX, y, wellZ)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  if (!visible) return null

  const pipeColour = highlighted ? '#4fc3f7' : '#8a7a63'
  const pipeEmissive = highlighted ? '#1b6f9c' : '#000000'
  const channelOuter = pipeOuterDiameter(WATER.channelDiameter, WATER.channelWallThickness)

  return (
    <group>
      {/* the shaft — the lathe carries world Y already, so only X/Z offset it */}
      <mesh geometry={shaft} position={[wellX, 0, wellZ]}>
        <meshStandardMaterial
          color={highlighted ? '#2f6f8f' : '#4b4740'}
          side={THREE.DoubleSide}
          roughness={0.95}
          emissive={highlighted ? '#123448' : '#000000'}
        />
      </mesh>

      {/*
        Masonry casing where the shaft crosses the rooms below its mouth.

        The wellhead is on the 2nd storey's floor [ref], and the bore runs 21 m
        down — so it necessarily passes through storey 1. Left bare it reads as
        a funnel and a tube hanging in the middle of that room. A well sunk from
        an upper floor is carried in a built shaft; this is that shaft, stopping
        at ground level where the bore enters rock.
      */}
      <mesh position={[wellX, (wellY + 0) / 2, wellZ]}>
        <cylinderGeometry
          args={[
            WELL.mouthDiameter / 2 + 0.18,
            WELL.mouthDiameter / 2 + 0.18,
            Math.max(0.2, wellY),
            24,
            1,
            true,
          ]}
        />
        <meshStandardMaterial color="#6a6152" side={THREE.DoubleSide} roughness={0.95} />
      </mesh>

      {/* wellhead ring, so the mouth reads as a rim rather than a hole */}
      <mesh position={[wellX, wellY + 0.06, wellZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[WELL.mouthDiameter / 2, WELL.mouthDiameter / 2 + 0.25, 32]} />
        <meshStandardMaterial color="#6a6152" side={THREE.DoubleSide} roughness={0.95} />
      </mesh>

      {/*
        The glazed cover.

        Walkthrough footage of the tower shows the wellhead closed with a glass
        disc flush in the floor — you look down the shaft, you do not step into
        it. Part of the post-2013 visitor fit-out, which is the state this model
        reconstructs, and it is also what stops the mouth being a hole a walker
        falls down.
      */}
      <mesh position={[wellX, wellY + 0.02, wellZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[WELL.mouthDiameter / 2, 32]} />
        <meshPhysicalMaterial
          color="#cfe3ea"
          transparent
          opacity={0.22}
          roughness={0.06}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* collecting channels on storeys 2..7 */}
      {rings
        .filter((r) => isStoreyVisible(r.floorIndex, viewerStorey, { showAll }))
        .map((r) => (
        <mesh key={r.floorIndex} position={[0, r.y + channelOuter / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r.radius, channelOuter / 2, TUBE_RADIAL, TUBE_AROUND]} />
          <meshStandardMaterial
            color={pipeColour}
            emissive={pipeEmissive}
            emissiveIntensity={highlighted ? 0.5 : 0}
            roughness={0.85}
          />
        </mesh>
      ))}

      {/*
        The Ø30 cm downpipe.

        It runs down the WALL, not through the middle of the rooms. [ref] has it
        coming "из ниш" — out of the niches — and the niches are in the masonry;
        a free-standing column of pipe crossing every chamber is both wrong and
        the single most intrusive thing in the interior. It meets the wellhead
        with a short horizontal leg at the bottom.
      */}
      <mesh position={downpipeLean.mid.toArray()} quaternion={downpipeLean.quaternion}>
        <cylinderGeometry
          args={[
            WATER.downpipeDiameter / 2,
            WATER.downpipeDiameter / 2,
            downpipeLean.length,
            16,
            1,
            true,
          ]}
        />
        <meshStandardMaterial
          color={pipeColour}
          emissive={pipeEmissive}
          emissiveIntensity={highlighted ? 0.5 : 0}
          side={THREE.DoubleSide}
          roughness={0.85}
        />
      </mesh>

      {/* the elbow: wall run across to the wellhead, just above the mouth */}
      <mesh
        position={[(downpipeX + wellX) / 2, wellY + 0.25, (downpipeZ + wellZ) / 2]}
        quaternion={elbowQuaternion}
      >
        <cylinderGeometry
          args={[
            WATER.downpipeDiameter / 2,
            WATER.downpipeDiameter / 2,
            Math.max(0.2, Math.hypot(downpipeX - wellX, downpipeZ - wellZ)),
            12,
            1,
            true,
          ]}
        />
        <meshStandardMaterial
          color={pipeColour}
          emissive={pipeEmissive}
          emissiveIntensity={highlighted ? 0.5 : 0}
          side={THREE.DoubleSide}
          roughness={0.85}
        />
      </mesh>

      {/* below ground: square-section pipes leaving through the wall [ref] */}
      {[0, 120, 240].map((az) => {
        const d = azimuthToVector(az)
        const mid = (buried.from + buried.to) / 2
        const len = buried.to - buried.from
        return (
          <mesh
            key={az}
            position={[d.x * mid, ENTRANCE.groundY - WATER.buriedPipeDepth, d.z * mid]}
            rotation={[0, -(az * Math.PI) / 180 + Math.PI / 2, 0]}
          >
            <boxGeometry args={[len, WATER.buriedPipeHeight, WATER.buriedPipeWidth]} />
            <meshStandardMaterial
              color={pipeColour}
              emissive={pipeEmissive}
              emissiveIntensity={highlighted ? 0.5 : 0}
              roughness={0.85}
            />
          </mesh>
        )
      })}

      {/* animated fall down the shaft */}
      {highlighted && (
        <instancedMesh ref={dropletsRef} args={[undefined, undefined, DROPLETS]}>
          <sphereGeometry args={[0.075, 8, 8]} />
          <meshBasicMaterial color="#8fd8ff" transparent opacity={0.85} />
        </instancedMesh>
      )}
    </group>
  )
}
