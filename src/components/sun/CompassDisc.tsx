import { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import { azimuthToVector } from '../../lib/geometry'
import { keyDates, sunriseAzimuth } from '../../lib/sun'
import { BUTTRESS, ENTRANCE, SITE, TOWER } from '../../config/tower'

export interface CompassDiscProps {
  visible: boolean
  year: number
}

const RADIUS = TOWER.outerRadius + 14
const Y = 0.05

function ring(radius: number, segments = 128): [number, number, number][] {
  const pts: [number, number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push([Math.cos(a) * radius, Y, Math.sin(a) * radius])
  }
  return pts
}

function spoke(azimuthDeg: number, from: number, to: number): [number, number, number][] {
  const d = azimuthToVector(azimuthDeg)
  return [
    [d.x * from, Y, d.z * from],
    [d.x * to, Y, d.z * to],
  ]
}

/**
 * Phase-8 debug disc: the sunrise bearings for the key days of the year, laid
 * out on the ground so the tower's own features can be compared against them
 * by eye. This is the picture that makes an alignment claim checkable.
 */
export function CompassDisc({ visible, year }: CompassDiscProps) {
  const marks = useMemo(() => {
    if (!visible) return []
    const palette: Record<string, string> = {
      'winter-solstice': '#5aa9e6',
      'spring-equinox': '#7fd18a',
      novruz: '#c9e265',
      'summer-solstice': '#e6b45a',
      'autumn-equinox': '#a58ad6',
    }
    return keyDates(year)
      .map((k) => {
        const az = sunriseAzimuth(k.date, SITE.latitude, SITE.longitude)
        return az === null ? null : { id: k.id, az, colour: palette[k.id] ?? '#ccc' }
      })
      .filter((m): m is { id: string; az: number; colour: string } => m !== null)
  }, [visible, year])

  if (!visible) return null

  return (
    <group>
      <Line points={ring(RADIUS)} color="#3c4450" lineWidth={1} />
      <Line points={ring(RADIUS * 0.62)} color="#2c333c" lineWidth={1} />

      {/* cardinal points */}
      {[
        { az: 0, label: 'N' },
        { az: 90, label: 'E' },
        { az: 180, label: 'S' },
        { az: 270, label: 'W' },
      ].map((c) => {
        const d = azimuthToVector(c.az)
        return (
          <group key={c.label}>
            <Line points={spoke(c.az, 0, RADIUS)} color="#39424e" lineWidth={1} />
            <Text
              position={[d.x * (RADIUS + 2.2), 0.4, d.z * (RADIUS + 2.2)]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={2}
              color="#8b97a6"
              anchorX="center"
            >
              {c.label}
            </Text>
          </group>
        )
      })}

      {/* sunrise bearings for the key days */}
      {marks.map((m) => {
        const d = azimuthToVector(m.az)
        return (
          <group key={m.id}>
            <Line points={spoke(m.az, RADIUS * 0.62, RADIUS)} color={m.colour} lineWidth={2.5} />
            <Text
              position={[d.x * (RADIUS + 3.4), 0.4, d.z * (RADIUS + 3.4)]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={1.3}
              color={m.colour}
              anchorX="center"
            >
              {`${m.id} ${m.az.toFixed(1)}°`}
            </Text>
          </group>
        )
      })}

      {/* the tower's own bearings, so a claim can be read off directly */}
      <Line points={spoke(BUTTRESS.azimuthDeg, 0, RADIUS * 0.62)} color="#d94f4f" lineWidth={3} />
      <Line points={spoke(ENTRANCE.azimuthDeg, 0, RADIUS * 0.62)} color="#2b7ac0" lineWidth={3} />
    </group>
  )
}
