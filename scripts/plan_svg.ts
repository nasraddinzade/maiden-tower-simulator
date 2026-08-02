/**
 * Dev utility: dump a scaled plan view of the CSG shell to SVG, measured from
 * the real geometry by raycasting. Run with:
 *   npx vite-node scripts/plan_svg.ts -- <out.svg>
 */
import { writeFileSync } from 'node:fs'
import { BUTTRESS, ENTRANCE, TOWER } from '../src/config/tower'
import { buildShellGeometry, innerRadiusProfileAt, outerRadiusProfileAt } from '../src/lib/towerShell'

const out = process.argv[process.argv.length - 1]
const { geometry, stats } = buildShellGeometry({
  buttressAzimuthDeg: BUTTRESS.azimuthDeg,
  buttressProjection: BUTTRESS.projection,
  buttressTipWidth: BUTTRESS.tipWidth,
  buttressRootArcDeg: BUTTRESS.rootArcDeg,
  buttressSkewDeg: BUTTRESS.skewDeg,
  buttressHeight: TOWER.height,
  entranceAzimuthDeg: ENTRANCE.azimuthDeg,
  entranceWidth: ENTRANCE.width,
  entranceHeight: ENTRANCE.height,
  entranceSillY: ENTRANCE.sillY,
})

const N = 360
const yPlan = 6.0 // sample height for the plan section
const outer = outerRadiusProfileAt(geometry, yPlan, N)
const inner = innerRadiusProfileAt(geometry, yPlan, N)

const S = 13 // px per metre
const CX = 300
const CY = 285
// screen: north (-Z) is up, east (+X) is right
const px = (az: number, r: number) => {
  const a = (az * Math.PI) / 180
  return [CX + Math.sin(a) * r * S, CY - Math.cos(a) * r * S]
}

const path = (prof: number[]) => {
  const pts: string[] = []
  for (let i = 0; i < N; i++) {
    const r = prof[i]
    if (r <= 0) continue
    const [x, y] = px((i / N) * 360, r)
    pts.push(`${pts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return pts.join(' ') + ' Z'
}

const ring = (r: number, stroke: string, dash = '') =>
  `<circle cx="${CX}" cy="${CY}" r="${r * S}" fill="none" stroke="${stroke}" stroke-width="1" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`

const [ex, ey] = px(ENTRANCE.azimuthDeg, TOWER.outerRadius)
const [bx, by] = px(BUTTRESS.azimuthDeg, TOWER.outerRadius + BUTTRESS.projection + 1.2)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 560" font-family="system-ui,sans-serif">
<rect width="600" height="560" fill="#faf7ef"/>
<g>
  <text x="20" y="26" font-size="14" font-weight="700" fill="#222">Qız Qalası — план оболочки на отметке ${yPlan.toFixed(1)} м (Фаза 2)</text>
  <text x="20" y="44" font-size="10.5" fill="#666">Обмерено лучами по реальному CSG-мешу · ${stats.triangleCount} тр. · вырожденных: ${stats.degenerateCount}</text>
</g>

<!-- reference circle: the plain drum -->
${ring(TOWER.outerRadius, '#bbb', '4 4')}

<!-- solid wall between outer surface and cavity -->
<path d="${path(outer)}" fill="#d8d2c4" stroke="#6f6858" stroke-width="1.8"/>
<path d="${path(inner)}" fill="#faf7ef" stroke="#4a90b8" stroke-width="1.5"/>

<!-- north arrow -->
<line x1="${CX}" y1="${CY - 8.25 * S - 22}" x2="${CX}" y2="${CY - 8.25 * S - 52}" stroke="#333" stroke-width="1.5"/>
<polygon points="${CX},${CY - 8.25 * S - 58} ${CX - 4},${CY - 8.25 * S - 48} ${CX + 4},${CY - 8.25 * S - 48}" fill="#333"/>
<text x="${CX + 8}" y="${CY - 8.25 * S - 50}" font-size="11" fill="#333" font-weight="600">N</text>

<!-- markers -->
<circle cx="${ex}" cy="${ey}" r="4.5" fill="#2b7ac0"/>
<text x="${ex + 8}" y="${ey + 12}" font-size="10.5" fill="#2b6ab0">вход ${ENTRANCE.azimuthDeg}° (ЮВ, placeholder)</text>
<text x="${bx - 10}" y="${by}" font-size="10.5" fill="#a33" text-anchor="middle">контрфорс ${BUTTRESS.azimuthDeg}° (восток)</text>

<!-- dimensions -->
<text x="${CX}" y="${CY + 8.25 * S + 26}" font-size="10.5" fill="#555" text-anchor="middle">внеш. Ø ${TOWER.outerDiameter} м · вылет клюва ${BUTTRESS.projection} м · нос ${BUTTRESS.tipWidth} м · скос ${BUTTRESS.skewDeg}°</text>
<text x="${CX}" y="${CY}" font-size="10" fill="#3a7a9a" text-anchor="middle">полость</text>
</svg>`

writeFileSync(out, svg)
console.log('plan written:', out, '| tris', stats.triangleCount, '| degenerate', stats.degenerateCount)
console.log('max outer radius', Math.max(...outer).toFixed(2), 'm at az', outer.indexOf(Math.max(...outer)), '°')
