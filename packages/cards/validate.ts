#!/usr/bin/env bun
/**
 * Blaze card validator.
 *
 * Usage:
 *   bun packages/cards/validate.ts                     # validate packages/cards/*.json
 *   bun packages/cards/validate.ts --candidates        # also validate candidates/*.json
 *   bun packages/cards/validate.ts path/to/card.json   # validate specific files
 *   bun packages/cards/validate.ts --json              # machine-readable report
 *
 * Zero dependencies on purpose: a hand-rolled checker for the subset of JSON Schema
 * used by schema.json (no $ref, no anyOf, no conditionals). Also reports the token-ish
 * size (chars / 4) of the rendered card body and warns past the 1200-token budget.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const HERE = dirname(new URL(import.meta.url).pathname);
export const SCHEMA_PATH = join(HERE, "schema.json");
export const TOKEN_BUDGET_MAX = 1200;
/**
 * Replay cards (`"replay": true`) carry whole files rather than one variabilized
 * fragment, so the distilled budget does not apply to them. They are still
 * bounded: an offer has to fit in a hook payload alongside the user's prompt.
 */
export const REPLAY_TOKEN_BUDGET_MAX = 6000;
// A distilled card is an exemplar, not a patch set: at most three snippets. Replay cards
// are exempt (they reproduce a whole verified change), so this is checked in code.
export const DISTILLED_SNIPPET_MAX = 3;
export const TOKEN_BUDGET_MIN = 400;
export const PITFALL_WORD_TARGET = 32;

/** Files in the cards dir that are not cards. */
const NOT_CARDS = new Set(["schema.json", "package.json", "tsconfig.json", "bunfig.json"]);

export type Schema = Record<string, any>;
export type Card = Record<string, any>;

export function loadSchema(path: string = SCHEMA_PATH): Schema {
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function typeMatches(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === "integer") return actual === "number" && Number.isInteger(value);
  if (expected === "number") return actual === "number" && Number.isFinite(value);
  return actual === expected;
}

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Validates `value` against `schema`. Returns a list of human-readable errors. */
export function validateAgainstSchema(value: unknown, schema: Schema, path = "$"): string[] {
  const errors: string[] = [];

  if (schema.type !== undefined) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      errors.push(`${path}: expected type ${types.join("|")}, got ${typeOf(value)}`);
      return errors; // further checks would be noise
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value as any)) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.map((e: any) => JSON.stringify(e)).join(", ")}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: string too short (${value.length} < ${schema.minLength})`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: string too long (${value.length} > ${schema.maxLength})`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} does not match /${schema.pattern}/`);
    }
    if (schema.format === "date-time" && !DATE_TIME_RE.test(value)) {
      errors.push(`${path}: ${JSON.stringify(value)} is not an RFC 3339 date-time`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: too few items (${value.length} < ${schema.minItems})`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: too many items (${value.length} > ${schema.maxItems})`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) errors.push(`${path}: items must be unique`);
    }
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validateAgainstSchema(item, schema.items, `${path}[${i}]`)));
    }
  }

  if (typeOf(value) === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) errors.push(`${path}: missing required property "${key}"`);
    }
    const props: Record<string, Schema> = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) errors.push(...validateAgainstSchema(obj[key], sub, `${path}.${key}`));
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Rendering (the body the gateway injects into additionalContext)
// ---------------------------------------------------------------------------

/** Rendered once per card instead of once per step, to save body budget. */
const FREEDOM_LEGEND =
  "(exact = reproduce verbatim · templated = keep the shape, swap the names · heuristic = judgement call)";

/**
 * Canonical Skill-shaped rendering of a card body: pitfalls first, then procedure,
 * then the exemplar, then verification. The gateway should use this so that the
 * token budget measured here is the token budget actually injected.
 */
export function renderCardBody(card: Card): string {
  const out: string[] = [];
  const fw = (card.context_fingerprint?.frameworks ?? [])
    .map((f: any) => `${f.name}@${f.range}`)
    .join(", ");

  out.push(`## ${card.title}  (card: ${card.id}${card.replay ? ", replay" : ""})`);
  out.push("");
  out.push(`**Trigger** ${card.trigger}`);
  out.push("");
  out.push(`**Do NOT use this card when**`);
  for (const a of card.anti_trigger ?? []) out.push(`- ${a}`);
  out.push("");
  out.push(`**Problem** ${card.problem_statement}`);
  out.push(`**Looks like** ${(card.problem_signature ?? []).map((s: string) => `"${s}"`).join(" | ")}`);
  out.push(
    `**Applies to** ${(card.context_fingerprint?.languages ?? []).join(", ")}${fw ? ` / ${fw}` : ""}`,
  );
  out.push("");
  out.push(`**Pitfalls (read before editing)**`);
  (card.pitfalls ?? []).forEach((p: any, i: number) => {
    out.push(`${i + 1}. [${p.severity}] ${p.text}`);
  });
  out.push("");
  out.push(`**Procedure** ${FREEDOM_LEGEND}`);
  (card.procedure ?? []).forEach((s: any, i: number) => {
    const note = s.note ? ` — ${s.note}` : "";
    out.push(`${i + 1}. [${s.freedom}] ${s.step}${note}`);
  });
  out.push("");
  out.push(`**Approach** ${card.solution?.summary ?? ""}`);
  for (const snip of card.solution?.code_snippets ?? []) {
    out.push("");
    out.push(`\`\`\`${snip.lang} ${snip.path}`);
    out.push(snip.content);
    out.push("```");
  }
  if (card.solution?.commands?.length) {
    out.push("");
    out.push(`**Commands**`);
    for (const c of card.solution.commands) out.push(`- \`${c}\``);
  }

  out.push("");
  out.push(`**Verify**`);
  for (const c of card.verification?.commands ?? []) out.push(`- \`${c}\``);
  if (card.verification?.expected) out.push(`Expected: ${card.verification.expected}`);

  return out.join("\n");
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Per-card check
// ---------------------------------------------------------------------------

export interface CardReport {
  file: string;
  id: string | null;
  ok: boolean;
  errors: string[];
  warnings: string[];
  tokens: number;
  decoy: boolean;
  replay: boolean;
}

export function checkCard(file: string, raw: string, schema: Schema): CardReport {
  const report: CardReport = {
    file,
    id: null,
    ok: false,
    errors: [],
    warnings: [],
    tokens: 0,
    decoy: false,
    replay: false,
  };

  let card: Card;
  try {
    card = JSON.parse(raw);
  } catch (err) {
    report.errors.push(`invalid JSON: ${(err as Error).message}`);
    return report;
  }

  report.id = typeof card.id === "string" ? card.id : null;
  report.decoy = card?.provenance?.origin_repo_note === "decoy-for-threshold-testing";
  report.replay = card?.replay === true;
  report.errors.push(...validateAgainstSchema(card, schema));

  // Contract beyond JSON Schema: id must equal the filename stem, so GET /cards/:id works.
  const stem = basename(file).replace(/\.json$/, "");
  if (report.id && report.id !== stem) {
    report.errors.push(`$.id ("${report.id}") must equal the filename stem ("${stem}")`);
  }

  // Snippet count: a distilled card must stay exemplar-sized. Replay cards are the
  // exception - they carry the full final contents of every file the run wrote, so the
  // schema's maxItems is loose and the tight cap is enforced here instead.
  const snippetCount = card.solution?.code_snippets?.length ?? 0;
  if (!report.replay && snippetCount > DISTILLED_SNIPPET_MAX) {
    report.errors.push(
      `$.solution.code_snippets: too many items (${snippetCount} > ${DISTILLED_SNIPPET_MAX}) for a non-replay card`,
    );
  }

  const body = renderCardBody(card);
  report.tokens = estimateTokens(body);
  const budgetMax = report.replay ? REPLAY_TOKEN_BUDGET_MAX : TOKEN_BUDGET_MAX;
  if (report.tokens > budgetMax) {
    report.warnings.push(`body is ~${report.tokens} tokens, over the ${budgetMax}-token budget`);
  } else if (!report.replay && report.tokens < TOKEN_BUDGET_MIN) {
    report.warnings.push(`body is only ~${report.tokens} tokens (target floor ${TOKEN_BUDGET_MIN}) - probably under-specified`);
  }

  (card.pitfalls ?? []).forEach((p: any, i: number) => {
    const words = String(p?.text ?? "").trim().split(/\s+/).filter(Boolean).length;
    if (words > PITFALL_WORD_TARGET) {
      report.warnings.push(`pitfall ${i + 1} is ${words} words (target <=${PITFALL_WORD_TARGET})`);
    }
  });

  if (!(card.pitfalls?.length > 0)) {
    report.warnings.push("no pitfalls: a card with no pitfall is rarely worth retrieving");
  }
  if (!card.verification?.expected) {
    report.warnings.push("verification.expected is unset (state what a pass looks like)");
  }
  if (card.status === undefined) {
    report.warnings.push('status is unset; the gateway will treat it as "active"');
  }

  report.ok = report.errors.length === 0;
  return report;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function collectCardFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !NOT_CARDS.has(f) && !f.startsWith("."))
    .sort()
    .map((f) => join(dir, f));
}

function main(argv: string[]): number {
  const asJson = argv.includes("--json");
  const includeCandidates = argv.includes("--candidates") || argv.includes("--include-candidates");
  const dirFlag = argv.indexOf("--dir");
  const cardsDir = dirFlag !== -1 ? resolve(argv[dirFlag + 1]!) : HERE;
  const explicit = argv.filter((a) => !a.startsWith("--") && a.endsWith(".json"));
  const skipNext = dirFlag !== -1 ? argv[dirFlag + 1] : null;

  let files: string[];
  if (explicit.filter((f) => f !== skipNext).length > 0) {
    files = explicit.filter((f) => f !== skipNext).map((f) => resolve(f));
  } else {
    files = collectCardFiles(cardsDir);
    const candDir = join(cardsDir, "candidates");
    if (includeCandidates && existsSync(candDir) && statSync(candDir).isDirectory()) {
      files.push(...collectCardFiles(candDir));
    }
  }

  const schema = loadSchema();
  const reports = files.map((f) => checkCard(f, readFileSync(f, "utf8"), schema));

  if (asJson) {
    console.log(JSON.stringify({ cards: reports.length, reports }, null, 2));
    return reports.every((r) => r.ok) ? 0 : 1;
  }

  console.log(`Validating ${reports.length} card(s) against ${basename(SCHEMA_PATH)}\n`);
  for (const r of reports) {
    const mark = r.ok ? "PASS" : "FAIL";
    const tag = r.decoy ? " [decoy]" : r.replay ? " [replay]" : "";
    const budget = r.tokens > (r.replay ? REPLAY_TOKEN_BUDGET_MAX : TOKEN_BUDGET_MAX) ? "OVER" : "ok";
    console.log(`${mark}  ${basename(r.file)}${tag}  ~${r.tokens} tok (${budget})`);
    for (const e of r.errors) console.log(`      error:   ${e}`);
    for (const w of r.warnings) console.log(`      warn:    ${w}`);
  }

  const failed = reports.filter((r) => !r.ok);
  const over = reports.filter((r) => r.tokens > (r.replay ? REPLAY_TOKEN_BUDGET_MAX : TOKEN_BUDGET_MAX));
  const decoys = reports.filter((r) => r.decoy);
  const tokens = reports.map((r) => r.tokens);
  const avg = tokens.length ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : 0;

  console.log("");
  const lo = tokens.length ? Math.min(...tokens) : 0;
  const hi = tokens.length ? Math.max(...tokens) : 0;
  console.log(
    `${reports.length - failed.length}/${reports.length} valid · ${decoys.length} decoy · ` +
      `tokens min ${lo} / avg ${avg} / max ${hi} · ${over.length} over budget ` +
      `(${TOKEN_BUDGET_MAX}, replay ${REPLAY_TOKEN_BUDGET_MAX})`,
  );
  return failed.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
