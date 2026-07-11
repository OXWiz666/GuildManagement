// ─── Auth error message mapping ──────────────────
// Translates raw Supabase / local-API auth errors into clear, user-facing
// messages (wrong password, unverified email, etc.) instead of leaking
// low-level strings or a generic "unexpected error".

export interface FriendlyAuthError {
  /** Short heading for the error box (e.g. "Incorrect password"). */
  title: string;
  /** Full, human-readable explanation shown to the user. */
  message: string;
}

/**
 * Map a raw auth error string to a friendly title + message.
 * Falls back to the original message so real, unmapped errors still surface
 * (we never swallow them behind "An unexpected error occurred").
 */
export function friendlyAuthError(
  raw?: string | null,
  fallback = "Something went wrong. Please try again.",
): FriendlyAuthError {
  const msg = (raw ?? "").trim();
  const lower = msg.toLowerCase();

  // ── Wrong email / password ──
  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid email or password") ||
    lower.includes("incorrect password") ||
    lower.includes("wrong password")
  ) {
    return {
      title: "Incorrect email or password",
      message: "The email or password you entered is incorrect. Please try again.",
    };
  }

  // ── Email not verified ──
  if (
    lower.includes("email not confirmed") ||
    lower.includes("not confirmed") ||
    lower.includes("email not verified") ||
    lower.includes("verify your email")
  ) {
    return {
      title: "Email not verified",
      message:
        "Your email address hasn't been verified yet. Please check your inbox for the confirmation link before signing in.",
    };
  }

  // ── Account already exists (register) ──
  if (
    lower.includes("already registered") ||
    lower.includes("already exists") ||
    lower.includes("user already") ||
    lower.includes("email address is already")
  ) {
    return {
      title: "Account already exists",
      message: "An account with this email already exists. Try signing in instead.",
    };
  }

  // ── Weak / invalid password (register) ──
  if (lower.includes("password should be") || lower.includes("password is too") || lower.includes("weak password")) {
    return {
      title: "Password too weak",
      message: msg || "Please choose a stronger password (at least 8 characters).",
    };
  }

  // ── Invalid email format ──
  if (lower.includes("invalid format") || lower.includes("unable to validate email") || lower.includes("invalid email")) {
    return {
      title: "Invalid email",
      message: "Please enter a valid email address.",
    };
  }

  // ── Rate limiting (Supabase's actual wording is "For security purposes,
  // you can only request this after N seconds", not the words "rate limit") ──
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("security purposes") ||
    lower.includes("only request this after")
  ) {
    return {
      title: "Too many attempts",
      message: msg && lower.includes("after") ? msg : "Too many attempts. Please wait a moment and try again.",
    };
  }

  // ── Signups disabled for this project ──
  if (lower.includes("signups not allowed") || lower.includes("signup is disabled") || lower.includes("signups are disabled")) {
    return {
      title: "Registration unavailable",
      message: "New account registration is temporarily unavailable. Please try again later.",
    };
  }

  // ── Passwords don't match (client-side) ──
  if (lower.includes("passwords do not match") || lower.includes("passwords don't match")) {
    return {
      title: "Passwords don't match",
      message: "The passwords you entered don't match.",
    };
  }

  // ── Inactive / disabled account ──
  if (lower.includes("inactive") || lower.includes("disabled") || lower.includes("banned")) {
    return {
      title: "Account unavailable",
      message: "This account is inactive. Please contact your guild administrator.",
    };
  }

  // ── Network / fetch failures ──
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("timeout")) {
    return {
      title: "Connection problem",
      message: "Couldn't reach the server. Check your connection and try again.",
    };
  }

  // ── Unknown: surface the real message when we have one ──
  return {
    title: "Something went wrong",
    message: msg || fallback,
  };
}
