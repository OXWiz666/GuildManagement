import { AppError } from "@guild/core";

/**
 * An error whose message is safe and useful to show a Discord user.
 *
 * Anything that is NOT one of these (or an operational AppError from
 * @guild/core) is treated as a bug: the user gets a generic apology and the
 * details go to the logs. This keeps internals — connection strings, stack
 * traces, row ids — out of a public channel.
 */
export class UserFacingError extends Error {
  /** Optional second line offering the user a way forward. */
  public readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "UserFacingError";
    this.hint = hint;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnknownBossError extends UserFacingError {
  constructor(input: string, suggestions: string[] = []) {
    const hint = suggestions.length
      ? `Did you mean: ${suggestions.join(", ")}?`
      : "Run `!spawn` to see the boss list, or ask an officer to add an alias.";
    super(`No boss matches **${input}**.`, hint);
    this.name = "UnknownBossError";
  }
}

export class NotLinkedError extends UserFacingError {
  constructor() {
    super(
      "Your Discord account isn't linked to a ForgeKeep account yet.",
      "Open ForgeKeep → Settings → Link Discord to get a code, then run `!link <code>`.",
    );
    this.name = "NotLinkedError";
  }
}

export class NotGuildMemberError extends UserFacingError {
  constructor() {
    super(
      "Your Discord account is linked, but it is not an active member of this ForgeKeep guild.",
      "Join this guild on ForgeKeep first, or ask a Guild Leader to approve your join request.",
    );
    this.name = "NotGuildMemberError";
  }
}

export class ServerNotBoundError extends UserFacingError {
  constructor() {
    super(
      "This Discord server isn't bound to a ForgeKeep guild.",
      "A Guild Leader must run `!bindguild <invite-code>` here first.",
    );
    this.name = "ServerNotBoundError";
  }
}

export class MissingPermissionError extends UserFacingError {
  constructor(required: string, actual: string) {
    super(
      `This command requires **${required}** or higher — your rank is **${actual}**.`,
    );
    this.name = "MissingPermissionError";
  }
}

/**
 * Decide what a Discord user should see for a thrown value.
 *
 * Operational AppErrors from @guild/core (ForbiddenError, BadRequestError, …)
 * already carry deliberately user-appropriate messages, so they pass through.
 * Programmer errors and infrastructure failures do not.
 */
export function toUserMessage(error: unknown): { message: string; hint?: string; internal: boolean } {
  if (error instanceof UserFacingError) {
    return { message: error.message, ...(error.hint ? { hint: error.hint } : {}), internal: false };
  }

  if (error instanceof AppError && error.isOperational) {
    return { message: error.message, internal: false };
  }

  return {
    message: "Something went wrong on our side. The team has been notified.",
    internal: true,
  };
}
