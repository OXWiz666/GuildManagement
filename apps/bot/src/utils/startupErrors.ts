/**
 * Startup failures with a known, actionable cause.
 *
 * These are configuration mistakes, not bugs. The stack trace for each points
 * deep into discord.js internals and tells the operator nothing about what to
 * change, so translate the ones we can recognize into instructions.
 *
 * Lives here rather than in index.ts because index.ts runs `main()` at import
 * time — a test importing it would try to connect to Discord.
 */
export function explainStartupError(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);

  // Gateway close 4014: the app requested a privileged intent it isn't approved
  // for. Always MessageContent here — it's the only privileged intent the bot
  // asks for, and every prefix command depends on it.
  if (/disallowed intents/i.test(message)) {
    return [
      "",
      "  The bot needs the MESSAGE CONTENT INTENT, which isn't enabled for this application.",
      "  Every command is a prefix message (!spawn), so without the message text there is",
      "  nothing to read — Discord refuses the connection rather than sending empty messages.",
      "",
      "  Fix it in the Discord Developer Portal (no code change needed):",
      "    1. https://discord.com/developers/applications",
      "    2. Select your application → Bot",
      "    3. Scroll to 'Privileged Gateway Intents'",
      "    4. Enable MESSAGE CONTENT INTENT → Save Changes",
      "    5. Restart the bot",
      "",
      "  See apps/bot/SETUP.md, Step 1a.",
      "",
    ].join("\n");
  }

  // Gateway close 4004: token wrong, rotated, or blank.
  if (/invalid token|an invalid token was provided/i.test(message)) {
    return [
      "",
      "  DISCORD_TOKEN is invalid. Reset it at:",
      "    https://discord.com/developers/applications → your app → Bot → Reset Token",
      "  then update apps/bot/.env. Note the token is shown only once.",
      "",
    ].join("\n");
  }

  return null;
}
