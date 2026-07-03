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

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
    displayName: displayNameSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

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
  avatarUrl: z.string().nullable().optional(),
  password: passwordSchema.optional(),
  ign: z.string().nullable().optional(),
  cp: z.number().int().nonnegative().nullable().optional(),
  class: z.string().nullable().optional(),
  weapon: z.string().nullable().optional(),
});

// Combat Power update (e.g. from the screenshot scanner). CP is a character-wide
// stat; 100M is generous headroom above any real in-game value.
export const combatPowerSchema = z.object({
  cp: z.number().int().nonnegative().max(100_000_000),
});

// Infer types from schemas
export type LoginInput = z.infer<typeof loginSchema>;
export type CombatPowerInput = z.infer<typeof combatPowerSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
