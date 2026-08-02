/**
 * The competing interpretations of what the Maiden Tower was for (Phase 10).
 *
 * This file holds STRUCTURE only — ids, what each mode changes in the scene, and
 * the citation. All prose lives in src/locales/{az,en,ru}/hypotheses.json, per
 * CLAUDE.md's rule that no user-facing string is hardcoded.
 *
 * NONE of these is marked correct, and the order below is not a ranking: it is
 * roughly chronological by the date each version proposes. The tower is a
 * genuinely disputed object and the app's job is to show the dispute, not to
 * settle it. [ref] lists all seven with their academic proponents.
 */

export type HypothesisId =
  | 'citadel'
  | 'fire-temple'
  | 'dakhma'
  | 'astronomical'
  | 'solar-temple'
  | 'oil-column'
  | 'lighthouse'

export interface HypothesisVisuals {
  /** Fires burning on the roof (Akhundov's seven fire outlets). */
  roofFires?: number
  /** Highlight the 30 lower + 31 upper stone corbels [ref]. */
  highlightCorbels?: boolean
  /** Turn on the Phase-8 sunbeam visualisation. */
  solarBeam?: boolean
  /** A beacon light at the crown. */
  beacon?: boolean
  /** Dim, sombre lighting. */
  sombre?: boolean
  /** Tint applied to the stone, as a hint rather than a claim. */
  tint?: string
}

export interface Hypothesis {
  id: HypothesisId
  /** Who argued it, as a plain name — not translated. */
  proponent: string
  /** Period the version places the tower's function in. */
  period: string
  /** Where the claim can be checked. */
  source: { label: string; url?: string }
  visuals: HypothesisVisuals
}

export const HYPOTHESES: Hypothesis[] = [
  {
    id: 'fire-temple',
    proponent: 'D. Axundov',
    period: 'VII–VI ə.ə. / BCE',
    source: {
      label: 'Ахундов Д.А. Архитектура древнего и раннесредневекового Азербайджана, Баку 1986',
      url: 'https://ebooks.az/book_0NetTl4d.html?lang=ru',
    },
    visuals: { roofFires: 7, tint: '#ffb066', sombre: false },
  },
  {
    id: 'dakhma',
    proponent: '—',
    period: '?',
    source: { label: 'docs/maiden-tower-reference.md' },
    visuals: { sombre: true, tint: '#8fa0b0' },
  },
  {
    id: 'astronomical',
    proponent: 'Ə. Əhmədov',
    period: '?',
    source: { label: 'docs/maiden-tower-reference.md' },
    visuals: { highlightCorbels: true, tint: '#9fd0ff' },
  },
  {
    id: 'solar-temple',
    proponent: 'A. İslamov',
    period: '?',
    source: {
      label: 'Azerbaijan International 14:3 (2006), Secrets of the Maiden Tower',
      url: 'https://azer.com/aiweb/categories/magazine/ai143_folder/143_articles/143_mt_secrets.html',
    },
    visuals: { solarBeam: true, tint: '#ffd88f' },
  },
  {
    id: 'oil-column',
    proponent: 'V. İbrahimov',
    period: '?',
    source: { label: 'docs/maiden-tower-reference.md' },
    visuals: { tint: '#b0a58f' },
  },
  {
    id: 'citadel',
    proponent: 'UNESCO / ICOMOS',
    period: 'XII',
    source: {
      label: 'UNESCO ICOMOS Evaluation Report, ref. 958',
      url: 'https://whc.unesco.org/archive/advisory_body_evaluation/958.pdf',
    },
    visuals: {},
  },
  {
    id: 'lighthouse',
    proponent: '—',
    period: 'XVIII–XIX',
    source: { label: 'docs/maiden-tower-reference.md' },
    visuals: { beacon: true, tint: '#fff0c0' },
  },
]

/**
 * The stone corbels [ref] counts: 30 on the lower section, 31 on the upper,
 * linked by a stone belt. Əhmədov reads them as the days of the month — which
 * is the only numeric hook that version offers, so the model shows the counts
 * and lets the viewer judge.
 */
export const CORBELS = {
  lowerCount: 30, // [ref]
  upperCount: 31, // [ref]
  /** Height of the belt dividing the two sections. [PLACEHOLDER] — not sourced. */
  beltHeightFraction: 0.55,
}
