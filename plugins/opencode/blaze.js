import { createClientForTool } from "../skills/blaze/blaze-client.mjs";

export const blaze = async ({ directory }) => {
  const client = createClientForTool("opencode");
  const ask = async (body) => { try { return await client.hook(body); } catch { return {}; } };
  return {
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
      client_event_id: `opencode:${output.message.id}`,
    });
    const ctx = res?.additionalContext ?? res?.hookSpecificOutput?.additionalContext;
    if (!ctx) return;
    output.parts.push({
      id: `blz_${Date.now().toString(36)}`,
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
  };
};
