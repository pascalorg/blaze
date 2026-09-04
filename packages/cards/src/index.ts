/**
 * `@blaze/cards` — the public contract for a Blaze Solution Card.
 *
 * `schema.json` is the single source of truth. Everything here is derived from it:
 * `cardSchema` is that file, `Card` is the TypeScript mirror of its `properties`, and
 * `schemaTypeDrift()` is the two-way guard that keeps the mirror honest (the
 * `satisfies` clause on `CARD_PROPERTIES` catches the TS side at compile time, the
 * function catches the JSON side at runtime).
 *
 * Deliberately source-only: no build step, no dependencies. Consumers are Bun and
 * Next (via `transpilePackages`), and the schema also has to be readable as a plain
 * file by anything that speaks JSON Schema 2020-12.
 *
 * The card *corpus* is not here and never will be — this package is the shape only.
 */

import cardSchemaJson from '../schema.json' with { type: 'json' }

export {
  DISTILLED_SNIPPET_MAX,
  PITFALL_WORD_TARGET,
  REPLAY_TOKEN_BUDGET_MAX,
  SCHEMA_PATH,
  TOKEN_BUDGET_MAX,
  TOKEN_BUDGET_MIN,
  checkCard,
  estimateTokens,
  loadSchema,
  renderCardBody,
  validateAgainstSchema,
} from '../validate.ts'
export type { CardReport } from '../validate.ts'

/** `schema.json`, as data. JSON Schema draft 2020-12, no `$ref`/`anyOf`/conditionals. */
export const cardSchema = cardSchemaJson

// ---------------------------------------------------------------------------
// The card type
// ---------------------------------------------------------------------------

/** `kind` — what the card mostly is. Retrieval does not branch on it yet. */
export type CardKind = 'solution' | 'pitfall' | 'procedure'

/** `status` — only `active` (and an unset status, read as active) is offered. */
export type CardStatus = 'candidate' | 'active' | 'deprecated' | 'retired'

/** Degrees of freedom on a procedure step. */
export type StepFreedom = 'exact' | 'templated' | 'heuristic'

export type PitfallSeverity = 'low' | 'medium' | 'high'

export type VerificationMethod = 'tests' | 'typecheck' | 'manual' | 'build' | 'grep'

/** One entry of the stack filter. `name` is the npm package name in `package.json`. */
export interface CardFramework {
  name: string
  /** semver range the lesson is known to apply to, e.g. `">=16.0.0 <17.0.0"`. */
  range: string
  /** Exact version observed in the originating run. */
  version?: string
}

export interface CardContextFingerprint {
  languages: string[]
  frameworks: CardFramework[]
  /** `additionalProperties: true` — runtime, package_manager, repo_shape, os, … */
  [extra: string]: unknown
}

export interface CardProcedureStep {
  step: string
  freedom: StepFreedom
  note?: string
}

export interface CardPitfall {
  text: string
  severity: PitfallSeverity
}

export interface CardCodeSnippet {
  path: string
  lang: string
  content: string
}

export interface CardSolution {
  summary: string
  /** A distilled card carries at most 3 fragments; a replay card carries whole files. */
  code_snippets: CardCodeSnippet[]
  commands?: string[]
  diff_ref?: string
}

export interface CardVerification {
  method?: VerificationMethod
  commands: string[]
  expected?: string
  /** What was actually observed: verified_at, verify_script, verify_output. */
  evidence?: Record<string, unknown>
}

export interface CardProvenance {
  solver_model: string
  harness: string
  /** RFC 3339 date-time. */
  created_at: string
  origin_repo_note: string
  [extra: string]: unknown
}

/**
 * A Blaze Solution Card. Mirrors `schema.json`; optional here means absent from that
 * file's `required` list. `additionalProperties: false` at the top level, so this is
 * the whole surface.
 */
export interface Card {
  /** Stable slug, and the filename stem: `GET /v1/cards/{id}` resolves on it. */
  id: string
  schema_version?: '1.0'
  kind?: CardKind
  status?: CardStatus
  /** Replay-grade: whole final files, `REPLAY_TOKEN_BUDGET_MAX` instead of 1200. */
  replay?: boolean
  title: string
  /** What the card does AND when to use it. Third person, 40–1024 chars. */
  trigger: string
  /** 2–5 superficially similar problems this card is the wrong answer for. */
  anti_trigger: string[]
  /** Verbatim symptoms a future agent will search with, not abstractions. */
  problem_signature: string[]
  problem_statement: string
  problem_statement_normalized?: string
  context_fingerprint: CardContextFingerprint
  preconditions?: string[]
  procedure: CardProcedureStep[]
  alternatives_rejected?: string[]
  /** Capped at 3. Pitfall 1 is the exact non-obvious gotcha, stated plainly. */
  pitfalls: CardPitfall[]
  solution: CardSolution
  verification: CardVerification
  provenance: CardProvenance
  /** Lexical retrieval surface: package names, API identifiers, version numbers. */
  keywords: string[]
}

// ---------------------------------------------------------------------------
// Schema ↔ type drift guard
// ---------------------------------------------------------------------------

/**
 * Every property `schema.json` declares. `satisfies` fails to compile if one of
 * these is not a key of `Card`; `schemaTypeDrift()` fails at runtime if the two
 * lists differ in either direction.
 */
export const CARD_PROPERTIES = [
  'id',
  'schema_version',
  'kind',
  'status',
  'replay',
  'title',
  'trigger',
  'anti_trigger',
  'problem_signature',
  'problem_statement',
  'problem_statement_normalized',
  'context_fingerprint',
  'preconditions',
  'procedure',
  'alternatives_rejected',
  'pitfalls',
  'solution',
  'verification',
  'provenance',
  'keywords',
] as const satisfies readonly (keyof Card)[]

/** Empty when `Card` and `schema.json` agree. Non-empty is a bug in this package. */
export function schemaTypeDrift(): string[] {
  const inSchema = Object.keys(cardSchema.properties)
  const declared = new Set<string>(CARD_PROPERTIES)
  return [
    ...inSchema
      .filter((key) => !declared.has(key))
      .map((key) => `schema.json declares "${key}", the Card type does not`),
    ...CARD_PROPERTIES.filter((key) => !inSchema.includes(key)).map(
      (key) => `the Card type declares "${key}", schema.json does not`,
    ),
  ]
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

import { validateAgainstSchema as validate } from '../validate.ts'

/** Schema errors for one candidate card. Empty array means valid. */
export function validateCard(value: unknown): string[] {
  return validate(value, cardSchema)
}

/** Narrowing form of {@link validateCard}. Schema only — no filename-stem check. */
export function isCard(value: unknown): value is Card {
  return validateCard(value).length === 0
}
