import { useState } from 'react'
import { Billboard } from '@react-three/drei'
import { HOTSPOTS, type HotspotId } from '../../data/hotspots'

export interface HotspotMarkersProps {
  visible: boolean
  selected: HotspotId | null
  onSelect: (id: HotspotId | null) => void
  /** Hide interior markers when the tower is being viewed from outside. */
  showInterior: boolean
}

const COLOUR = {
  measured: '#8fd9a8',
  inferred: '#ffd88f',
  assumed: '#e8a0a0',
} as const

/**
 * Phase 12 — clickable points of interest.
 *
 * Colour carries the honest part: green where the model rests on a measurement,
 * amber where it is inferred, red where it is an assumption. A viewer can see
 * at a glance how much of what they are looking at is actually evidenced.
 */
export function HotspotMarkers({ visible, selected, onSelect, showInterior }: HotspotMarkersProps) {
  const [hovered, setHovered] = useState<HotspotId | null>(null)
  if (!visible) return null

  return (
    <group>
      {HOTSPOTS.filter((h) => showInterior || !h.interior).map((h) => {
        const active = selected === h.id || hovered === h.id
        return (
          <Billboard key={h.id} position={h.position}>
            <mesh
              onClick={(e) => {
                e.stopPropagation()
                onSelect(selected === h.id ? null : h.id)
              }}
              onPointerOver={(e) => {
                e.stopPropagation()
                setHovered(h.id)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setHovered(null)
                document.body.style.cursor = 'auto'
              }}
            >
              {/*
                Occluded by the masonry (depthTest on) and small.
                They used to draw through every wall at 0.3–0.42 m across, so a
                walker on storey 1 saw every marker in the tower hanging in front
                of the stonework, and standing near one filled the screen with a
                translucent disc. A marker is a hint, not the exhibit.
              */}
              <circleGeometry args={[active ? 0.17 : 0.12, 20]} />
              <meshBasicMaterial
                color={COLOUR[h.confidence]}
                transparent
                opacity={active ? 0.9 : 0.5}
              />
            </mesh>
            <mesh position={[0, 0, -0.01]}>
              <ringGeometry args={[active ? 0.19 : 0.14, active ? 0.23 : 0.17, 20]} />
              <meshBasicMaterial color={COLOUR[h.confidence]} transparent opacity={0.3} />
            </mesh>
          </Billboard>
        )
      })}
    </group>
  )
}
