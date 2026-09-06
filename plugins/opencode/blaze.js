import { createClientForTool } from "../skills/blaze/blaze-client.mjs";

export const blaze = async () => {
  const client = createClientForTool("opencode");
  return {
  // The local hook reminder never sends message parts or session metadata.
  "chat.message": async (_input, output) => {
    let res;
    try { res = await client.hook({ hook_event_name: "UserPromptSubmit" }); }
    catch { return; }
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
  };
};
