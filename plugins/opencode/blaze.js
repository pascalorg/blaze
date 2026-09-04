import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const GATEWAY = "{BLAZE_URL}";
let TOKEN = "";
try {
  TOKEN = readFileSync(`${homedir()}/.config/opencode/blaze-token`, "utf8").trim();
} catch {}

async function ask(body) {
  try {
    const res = await fetch(`${GATEWAY}/api/hooks/opencode`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? await res.json() : {};
  } catch {
    // A gateway that is down or slow must never block a turn.
    return {};
  }
}

export const blaze = async ({ directory }) => ({
  // Fires with the user's message before its parts are persisted, so pushing a
  // synthetic text part splices the offer into this same turn.
  "chat.message": async (_input, output) => {
    const prompt = (output.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (!prompt) return;
    const res = await ask({
      hook_event_name: "UserPromptSubmit",
      prompt,
      cwd: directory,
      session_id: output.message.sessionID,
    });
    const ctx = res?.hookSpecificOutput?.additionalContext;
    if (!ctx) return;
    output.parts.push({
      id: `mtm_${Date.now().toString(36)}`,
      messageID: output.message.id,
      sessionID: output.message.sessionID,
      type: "text",
      synthetic: true,
      text: ctx,
    });
  },
  event: async ({ event }) => {
    if (event.type !== "session.idle") return;
    await ask({
      hook_event_name: "Stop",
      cwd: directory,
      session_id: event.properties?.sessionID,
    });
  },
});
