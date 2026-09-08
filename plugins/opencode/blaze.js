import { createClient, toolPaths } from "../skills/blaze/blaze-client.mjs";

export const blaze = async () => {
  // Guidance creation does not read or migrate any credential or receipt.
  const client = createClient({origin:"https://blaze.pascal.app",tool:"opencode",stateDir:toolPaths("opencode").state});
  return {
  // Model-only system context avoids adding a synthetic user-visible chat part.
  // The local hook never sends prompt, message, model, or session fields.
  "experimental.chat.system.transform": async (_input, output) => {
    let res;
    try { res = await client.hook({ hook_event_name: "UserPromptSubmit" }); }
    catch { return; }
    const ctx = res?.hookSpecificOutput?.additionalContext;
    if (!ctx) return;
    output.system.push(ctx);
  },
  };
};
