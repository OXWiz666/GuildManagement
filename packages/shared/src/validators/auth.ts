import { z } from "zod";

// ─── Auth Validators ────────────────────────────
// Used on both frontend (client-side validation) and backend (request validation)

export const emailSchema = z
  .string()
  .email("Invalid email address")
  .min(1, "Email is required")
  .max(255, "Email too long")
  .transform((v) => v.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password too long")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain a special character (e.g., !, @, #, $, etc.)");

export const displayNameSchema = z
  .string()
  .min(2, "Display name must be at least 2 characters")
  .max(32, "Display name must be at most 32 characters")
  .regex(
    /^[a-zA-Z0-9_\-. ]+$/,
    "Display name can only contain letters, numbers, underscores, hyphens, dots, and spaces",
  );

// The login/account identifier used instead of (or alongside) email. Lowercase
// only, must start with a letter, 3-20 chars — deliberately stricter than
// display name since it's a unique lookup key, not just a shown label.
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-z][a-z0-9_]*$/, "Username must start with a letter and contain only lowercase letters, numbers, and underscores");

// Anything containing "@" is treated as an email login attempt; otherwise
// it's a username lookup. Deliberately lenient (no format validation beyond
// "non-empty") — the actual resolution/lookup will reject anything invalid.
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, "Username or email is required");

// Resolves a login identifier (username or email) to the account's real
// email before the client calls Supabase/the legacy login, both of which
// only understand email.
export const resolveIdentifierSchema = z.object({
  identifier: loginIdentifierSchema,
});

export const loginSchema = z.object({
  // Kept as `email` for API compatibility with existing clients, but this
  // field now accepts the same username-or-email identifier as the login form.
  email: loginIdentifierSchema,
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    displayName: displayNameSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// ─── Leader Onboarding (self-serve guild / faction creation) ─────────
// Chosen at signup. MEMBER = plain account (joins via invite code).
// GUILD_LEADER = creates a guild and leads it.
// FACTION_LEADER = creates a faction (a group of guilds) + its first guild.
export const ACCOUNT_TYPES = ["MEMBER", "GUILD_LEADER", "FACTION_LEADER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const orgNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(48, "Name must be at most 48 characters")
  .regex(
    /^[a-zA-Z0-9 '\-_.]+$/,
    "Use letters, numbers, spaces, and - _ . ' only",
  );

// Validated payload the client passes (via Supabase user_metadata) and the
// server re-validates before creating the org on first authenticated sync.
export const leaderOnboardingSchema = z
  .object({
    accountType: z.enum(ACCOUNT_TYPES),
    guildName: orgNameSchema,
    factionName: orgNameSchema.optional(),
  })
  .refine(
    (d) => d.accountType !== "FACTION_LEADER" || !!d.factionName,
    { message: "Faction name is required", path: ["factionName"] },
  );
export type LeaderOnboardingInput = z.infer<typeof leaderOnboardingSchema>;

/**
 * Turn a display name into a URL-safe slug. Not guaranteed unique — the caller
 * appends a suffix on collision.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const updateUserSchema = z.object({
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
});

// Character-profile fields (IGN / Combat Power / Class / Weapon) — character-wide
// stats dual-written to the user profile and every guild membership.
export const updateCharacterProfileSchema = z.object({
  ign: z.string().trim().max(60).nullable().optional(),
  cp: z.number().int().nonnegative().max(100_000_000).nullable().optional(),
  class: z.string().trim().max(40).nullable().optional(),
  weapon: z.string().trim().max(40).nullable().optional(),
});

// Combat Power update (e.g. from the screenshot scanner). CP is a character-wide
// stat; 100M is generous headroom above any real in-game value.
export const combatPowerSchema = z.object({
  cp: z.number().int().nonnegative().max(100_000_000),
});

// Avatar/banner upload — client sends a base64 data URL, decoded and re-uploaded
// to Supabase Storage server-side (see auth.service.ts::updateAvatar/updateBanner).
export const uploadProfileImageSchema = z.object({
  dataUrl: z.string().min(1, "Image data is required"),
});

// ─── Payment methods (member profile QR codes) ──────────────────────
// The browser sends a base64 data URL, stored inline like avatarUrl — these
// are meant to be shown to whoever pays the member, not kept private.
export const addPaymentMethodSchema = z.object({
  method: z.string().trim().min(1, "Select a payment method").max(40),
  label: z.string().trim().max(60).optional(),
  qrDataUrl: z
    .string()
    .min(1, "QR code image is required")
    .max(2_800_000, "Image is too large")
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "Must be a PNG, JPEG, or WebP data URL"),
});
export type AddPaymentMethodInput = z.infer<typeof addPaymentMethodSchema>;

// Infer types from schemas
export type LoginInput = z.infer<typeof loginSchema>;
export type ResolveIdentifierInput = z.infer<typeof resolveIdentifierSchema>;
export type CombatPowerInput = z.infer<typeof combatPowerSchema>;
export type UpdateCharacterProfileInput = z.infer<typeof updateCharacterProfileSchema>;
export type UploadProfileImageInput = z.infer<typeof uploadProfileImageSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
