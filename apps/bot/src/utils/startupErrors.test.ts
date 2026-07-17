import { describe, expect, it } from "vitest";
import { explainStartupError } from "./startupErrors.js";

describe("explainStartupError", () => {
  describe("disallowed intents (gateway 4014)", () => {
    // The exact message discord.js throws — copied verbatim from a real failure
    // so a library wording change breaks this test rather than silently
    // reverting the guidance to a stack trace.
    const REAL_ERROR = new Error("Used disallowed intents");

    it("recognizes the real discord.js error", () => {
      expect(explainStartupError(REAL_ERROR)).not.toBeNull();
    });

    it("names the intent and where to enable it", () => {
      const guidance = explainStartupError(REAL_ERROR)!;
      expect(guidance).toMatch(/MESSAGE CONTENT INTENT/);
      expect(guidance).toMatch(/discord\.com\/developers\/applications/);
      expect(guidance).toMatch(/Privileged Gateway Intents/);
    });

    it("says no code change is needed", () => {
      // The operator's first instinct is to look for a bug in the bot.
      expect(explainStartupError(REAL_ERROR)!).toMatch(/no code change/i);
    });

    it("is case-insensitive", () => {
      expect(explainStartupError(new Error("used DISALLOWED INTENTS"))).not.toBeNull();
    });
  });

  describe("invalid token (gateway 4004)", () => {
    it("recognizes discord.js's wording", () => {
      const guidance = explainStartupError(new Error("An invalid token was provided."));
      expect(guidance).toMatch(/DISCORD_TOKEN/);
      expect(guidance).toMatch(/Reset Token/);
    });
  });

  it("returns null for an unrecognized error, so the stack trace still shows", () => {
    // Anything without known guidance must fall through to the normal logger —
    // swallowing a real bug behind a friendly message would be worse than the
    // stack trace.
    expect(explainStartupError(new Error("ECONNREFUSED 127.0.0.1:5432"))).toBeNull();
  });

  it("handles a non-Error throwable", () => {
    expect(explainStartupError("Used disallowed intents")).not.toBeNull();
    expect(explainStartupError(undefined)).toBeNull();
  });
});
