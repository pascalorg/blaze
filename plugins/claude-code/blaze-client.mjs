#!/usr/bin/env node
/** Blaze's dependency-free client. Receipts contain IDs and timings, never prompts/code. */
import { mkdirSync, readFileSync, writeFileSync, renameSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULTS = new Set(["solved_as_is", "solved_with_changes", "solved_without_memory", "failed", "not_tried", "unknown"]);
const VERIFICATIONS = new Set(["passed", "failed", "not_run", "unknown"]);
const BOUNDARIES = new Set(["task_start_to_agent_end", "task_start_to_verification_end"]);
const ENDS = new Set(["stop", "subagentstop", "sessionend", "session.idle", "sessioncompleted"]);
const positiveDuration = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const wallNow = () => performance.timeOrigin + performance.now();
const shellQuote = (v) => `'${v.replaceAll("'", "'\\''")}'`;
const seconds = (ms) => ms === null ? "unknown" : ms === 0 ? "0s" : ms < 10 ? "<0.01s" : `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)}s`;

export function fallbackSummary(offered, retrievalMs = null) {
  return `Blaze · original solve unknown · retrieval ${seconds(retrievalMs)} · time saved ${offered === false ? "0s credited (no memory reused)" : "unknown"}`;
}

export function toolPaths(tool, home = homedir()) {
  if (tool === "claude") {
    const root = join(home, ".claude/skills/blaze");
    return { root, token: join(root, "token") };
  }
  if (tool === "codex") return { root: join(home, ".agents/skills/blaze"), token: join(home, ".codex/blaze-token") };
  if (tool === "opencode") return { root: join(home, ".config/opencode/skills/blaze"), token: join(home, ".config/opencode/blaze-token") };
  throw new Error("tool must be claude, codex, or opencode");
}

function load(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function save(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value) + "\n", { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}

/** Read only the explicitly named minimized contribution envelope; never a transcript. */
export function readContributionFile(path) {
  if (!path) throw new Error("Provide --file with a minimized contribution JSON file");
  const bytes = readFileSync(path);
  if (bytes.byteLength > 32_768) throw new Error("Contribution JSON must fit within 32768 bytes");
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("Contribution file must contain valid JSON"); }
}

export function createClient({ origin, token = "", stateDir, tool, helperPath = fileURLToPath(import.meta.url), fetchImpl = fetch }) {
  const url = new URL(origin);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Blaze requires HTTPS, except for local development");
  }
  const base = url.origin;
  toolPaths(tool); // Validate before constructing endpoint paths or commands.
  const receiptPath = (id) => {
    if (!UUID.test(id)) throw new Error("A server-issued decision UUID is required");
    return join(stateDir, `${id}.json`);
  };
  const receipt = (id) => {
    const value = load(receiptPath(id));
    if (!value || value.origin !== base || value.tool !== tool || value.decision_id !== id) throw new Error("No matching local Blaze receipt");
    return value;
  };
  async function request(path, body, method = body === undefined ? "GET" : "POST") {
    const start = performance.now();
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(4500), redirect: "error",
    });
    const data = await response.json();
    const elapsed = performance.now() - start; // Includes headers, body transfer and JSON parsing.
    if (!response.ok) throw new Error(`Blaze request failed (HTTP ${response.status})`);
    return { data, elapsed };
  }
  function context(response, saved, event) {
    const source = response.additionalContext ?? response.hookSpecificOutput?.additionalContext ?? response.offer ?? "";
    const command = `node ${shellQuote(helperPath)} outcome --tool ${tool} --decision ${saved.decision_id} --result unknown --verification unknown`;
    const note = [
      `Blaze measured full request/reply retrieval: ${seconds(saved.retrieval_ms)}. Decision: ${saved.decision_id}.`,
      "Before the final answer, explicitly report the result with the command below, replacing unknown with what you observed. Do not infer success from a Stop event.",
      command,
      "Quote the returned summary_line as the final line. If reporting is unavailable, use this honest fallback:",
      fallbackSummary(saved.offered, saved.retrieval_ms),
    ].join("\n");
    const additionalContext = [source, note].filter(Boolean).join("\n\n");
    return { ...response, additionalContext,
      hookSpecificOutput: { ...response.hookSpecificOutput, hookEventName: event, additionalContext },
      blaze: { ...response.blaze, retrieval_ms: saved.retrieval_ms, receipt: saved.decision_id },
    };
  }
  async function retrieve(body, endpoint, event) {
    const started = wallNow();
    const clientEventId = body.client_event_id || randomUUID();
    const input = { ...body, client_event_id: clientEventId };
    if (!/^[a-f0-9]{64}$/i.test(input.context_fingerprint ?? "")) delete input.context_fingerprint;
    else input.context_fingerprint = input.context_fingerprint.toLowerCase();
    const { data, elapsed } = await request(endpoint, input);
    const decision = data.blaze ?? data;
    if (!UUID.test(decision.decision_id ?? "")) {
      // Old servers still deliver offers; they cannot accept durable outcomes.
      const offered = decision.offered;
      const extra = `${data.additionalContext ?? data.hookSpecificOutput?.additionalContext ?? data.offer ?? ""}\n\nEnd your final answer with: ${fallbackSummary(offered, elapsed)}`.trim();
      return { ...data, additionalContext: extra, hookSpecificOutput: { hookEventName: event, additionalContext: extra } };
    }
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const path = receiptPath(decision.decision_id);
    const prior = load(path);
    const saved = prior?.origin === base && prior?.tool === tool ? prior : {
      version: 1, origin: base, tool, decision_id: decision.decision_id,
      client_event_id: clientEventId, started_wall_ms: started, retrieval_ms: 0,
      offered: decision.offered === true,
      offers: (decision.offers ?? []).map((o) => ({ offer_id: o.offer_id, card_id: o.card_id, revision_id: o.revision_id })),
      context_fingerprint: input.context_fingerprint ?? null,
    };
    if (!saved.outcome) saved.retrieval_ms += elapsed;
    save(path, saved);
    return context(data, saved, event);
  }
  return {
    async claim() {
      if (!token) throw new Error("A private installation token is required to claim this installation");
      const { data } = await request("/api/auth/agent/claim/start", {});
      if (typeof data.claimCode !== "string" || typeof data.claimUrl !== "string" || typeof data.expiresAt !== "string") {
        throw new Error("Blaze returned an invalid claim response");
      }
      // Display only the explicitly requested short-lived challenge, never credentials.
      return { claimUrl: data.claimUrl, claimCode: data.claimCode, expiresAt: data.expiresAt };
    },
    async contribute(input) {
      if (!token) throw new Error("A private installation token is required to contribute");
      if (!input || !UUID.test(input.client_event_id ?? "") || input.minimized !== true) {
        throw new Error("Contribution JSON requires a stable client_event_id UUID and minimized: true");
      }
      if (input.visibility === "public" && input.public_sharing_authorized !== true) {
        throw new Error("Public sharing requires the user's explicit authorization and public_sharing_authorized: true");
      }
      if (Buffer.byteLength(JSON.stringify(input)) > 32_768) throw new Error("Contribution JSON must fit within 32768 bytes");
      // The file supplies the complete server schema. Do not add an event ID, change
      // visibility, wrap the card, or save another local copy of the candidate.
      return (await request("/api/contributions", input)).data;
    },
    async contribution(id) {
      if (!UUID.test(id ?? "")) throw new Error("A server-issued contribution UUID is required");
      const { data } = await request(`/api/contributions/${id}`);
      const { id: contribution_id, state, visibility, evaluation, created_at, updated_at } = data;
      return { contribution_id, state, visibility, evaluation, created_at, updated_at };
    },
    async deleteContribution(id) {
      if (!UUID.test(id ?? "")) throw new Error("A server-issued contribution UUID is required");
      return (await request(`/api/contributions/${id}`, undefined, "DELETE")).data;
    },
    async hook(body) {
      const event = String(body.hook_event_name ?? body.event ?? "UserPromptSubmit");
      if (ENDS.has(event.toLowerCase())) return (await request(`/api/hooks/${tool}`, body)).data;
      return retrieve(body, `/api/hooks/${tool}`, event);
    },
    async lookup(body) { return retrieve(body, "/api/lookup", "UserPromptSubmit"); },
    async card(decisionId, cardId) {
      const saved = receipt(decisionId);
      const offer = saved.offers.find((o) => o.card_id === cardId);
      if (!offer || !UUID.test(offer.offer_id ?? "")) throw new Error("Card was not offered for this decision");
      if (saved.outcome) throw new Error("Outcome already prepared; start a new lookup for new work");
      const { data, elapsed } = await request(`/api/cards/${encodeURIComponent(cardId)}?offer_id=${encodeURIComponent(offer.offer_id)}`);
      saved.retrieval_ms += elapsed;
      save(receiptPath(decisionId), saved);
      return data;
    },
    async outcome(decisionId, report) {
      const saved = receipt(decisionId);
      if (!RESULTS.has(report.result) || !VERIFICATIONS.has(report.verification_status)) throw new Error("Choose an explicit result and verification status");
      const boundary = report.boundary ?? "task_start_to_agent_end";
      if (!BOUNDARIES.has(boundary)) throw new Error("Unknown timing boundary");
      if (report.offer_id && !saved.offers.some((o) => o.offer_id === report.offer_id)) throw new Error("Offer does not belong to this decision");
      const used = report.result === "solved_as_is" || report.result === "solved_with_changes";
      if (used && !report.offer_id && saved.offers.length !== 1) {
        throw new Error("Select the adopted offer ID; use solved_without_memory when no card was adopted");
      }
      const intent = { result: report.result, verification_status: report.verification_status,
        boundary, ...(report.offer_id ? { offer_id: report.offer_id } : {}),
        ...(report.task_total_ms === undefined ? {} : { task_total_ms: report.task_total_ms }) };
      if (saved.outcome && JSON.stringify(saved.outcome.intent) !== JSON.stringify(intent)) throw new Error("An outcome is already prepared; retry its original result unchanged");
      if (saved.outcome && report.client_event_id && report.client_event_id !== saved.outcome.payload.client_event_id) throw new Error("Retry the original event ID unchanged");
      if (!saved.outcome) {
        const elapsed = wallNow() - saved.started_wall_ms;
        const total = report.task_total_ms ?? elapsed;
        if (report.task_total_ms !== undefined && !positiveDuration(report.task_total_ms)) throw new Error("Invalid task duration");
        const payload = { decision_id: decisionId, client_event_id: report.client_event_id ?? randomUUID(),
          ...intent, retrieval_ms: saved.retrieval_ms,
          ...(positiveDuration(total) && total >= saved.retrieval_ms ? { task_total_ms: total } : {}) };
        saved.outcome = { intent, payload };
        save(receiptPath(decisionId), saved); // Retries reuse the same event, timing and payload.
      }
      const { data } = await request("/api/outcomes", saved.outcome.payload);
      const summary = typeof data.summary_line === "string" && data.summary_line.startsWith("Blaze ·")
        ? data.summary_line : fallbackSummary(saved.offered, saved.retrieval_ms);
      saved.outcome.summary_line = summary;
      save(receiptPath(decisionId), saved);
      return { ...data, summary_line: summary };
    },
    summary(decisionId) { const saved = receipt(decisionId); return saved.outcome?.summary_line ?? fallbackSummary(saved.offered, saved.retrieval_ms); },
  };
}

export function createClientForTool(tool) {
  const paths = toolPaths(tool);
  const config = load(join(paths.root, "client-config.json"));
  let token = "";
  try { token = readFileSync(paths.token, "utf8").trim(); } catch { /* Optional for lookup, required for outcome. */ }
  return createClient({ origin: config?.origin ?? "https://blaze.pascal.app", token, tool, stateDir: join(paths.root, "receipts") });
}

async function main(argv) {
  const command = argv[0];
  const args = {};
  for (let i = 1; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || argv[i + 1] === undefined) throw new Error("Options need values");
    args[argv[i].slice(2)] = argv[i + 1];
  }
  const client = createClientForTool(args.tool);
  if (command === "hook" || command === "lookup") {
    let stdin = "";
    for await (const chunk of process.stdin) { stdin += chunk; if (stdin.length > 1_048_576) throw new Error("Hook input too large"); }
    const body = JSON.parse(stdin);
    if (args["event-id"]) body.client_event_id = args["event-id"];
    if (args["context-fingerprint"]) body.context_fingerprint = args["context-fingerprint"];
    console.log(JSON.stringify(await client[command](body)));
  } else if (command === "outcome") {
    const result = await client.outcome(args.decision, {
      result: args.result, verification_status: args.verification, offer_id: args.offer,
      boundary: args.boundary, client_event_id: args["event-id"],
      ...(args["task-total-ms"] === undefined ? {} : { task_total_ms: Number(args["task-total-ms"]) }),
    });
    console.log(result.summary_line);
  } else if (command === "card") console.log(JSON.stringify(await client.card(args.decision, args.card)));
  else if (command === "summary") console.log(client.summary(args.decision));
  else if (command === "claim") console.log(JSON.stringify(await client.claim()));
  else if (command === "contribute") console.log(JSON.stringify(await client.contribute(readContributionFile(args.file))));
  else if (command === "contribution") console.log(JSON.stringify(await client.contribution(args.id)));
  else if (command === "delete-contribution") console.log(JSON.stringify(await client.deleteContribution(args.id)));
  else throw new Error("Expected hook, lookup, card, outcome, summary, claim, contribute, contribution, or delete-contribution");
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    if (process.argv[2] === "hook") console.log("{}"); // Keep tool operation nonblocking.
    else { console.error(error.message); process.exitCode = 1; }
  });
}
