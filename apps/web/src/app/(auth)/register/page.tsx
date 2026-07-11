"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { AuthStagger, MagneticPress } from "@/components/auth/AuthAnim";
import { friendlyAuthError } from "@/lib/auth-errors";
import { authApi } from "@/lib/api";

const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,19}$/;
const USERNAME_CHECK_DEBOUNCE_MS = 450;

type AccountTypeChoice = "MEMBER" | "GUILD_LEADER" | "FACTION_LEADER";

const ACCOUNT_TYPE_OPTIONS: {
  value: AccountTypeChoice;
  label: string;
  desc: string;
}[] = [
  { value: "MEMBER", label: "Member", desc: "Join an existing guild with an invite code." },
  { value: "GUILD_LEADER", label: "Guild Leader", desc: "Create and lead your own guild." },
  { value: "FACTION_LEADER", label: "Faction Leader", desc: "Run a faction spanning multiple guilds." },
];

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountTypeChoice>("MEMBER");
  const [guildName, setGuildName] = useState("");
  const [factionName, setFactionName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorTitle, setErrorTitle] = useState("");
  const [isVerificationSent, setIsVerificationSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [isResending, setIsResending] = useState(false);
  const { register, verifyRegistrationCode, resendVerificationCode } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();
  const usernameCheckRef = useRef(0);

  // Debounced live availability check as the user types — catches a taken
  // username before they submit, rather than only after the whole form fails.
  useEffect(() => {
    const candidate = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(candidate)) {
      setUsernameStatus("idle");
      return;
    }
    const requestId = ++usernameCheckRef.current;
    setUsernameStatus("checking");
    const handle = setTimeout(async () => {
      try {
        const result = await authApi.checkUsernameAvailable(candidate);
        if (requestId !== usernameCheckRef.current) return; // stale response
        setUsernameStatus(result.success && result.data?.available ? "available" : "taken");
      } catch {
        if (requestId === usernameCheckRef.current) setUsernameStatus("idle");
      }
    }, USERNAME_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [username]);

  function getPasswordStrength(pwd: string): {
    score: number;
    label: string;
    color: string;
  } {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;

    const levels = [
      { label: "Very weak", color: "bg-[#D94A4A]" },
      { label: "Weak", color: "bg-[#E27C3E]" },
      { label: "Fair", color: "bg-[#F5B841]" },
      { label: "Strong", color: "bg-[#10D99A]" },
      { label: "Excellent", color: "bg-[#0AD985]" },
    ];
    const level = levels[Math.max(0, score - 1)] || levels[0]!;
    return { score, ...level };
  }

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Maps a failed register()'s errorTitle to the specific field it's about,
  // so the message shows inline under that input (not just a detached
  // top-of-form banner) — mirrors how client-side validation already renders.
  function fieldForErrorTitle(title: string): string | null {
    switch (title) {
      case "Account already exists":
      case "Invalid email":
        return "email";
      case "Username taken":
        return "username";
      case "Password too weak":
        return "password";
      default:
        return null;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setErrorTitle("");
    setFieldErrors({});
    setIsLoading(true);

    const isLeader = accountType !== "MEMBER";
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedGuild = guildName.trim();
    const trimmedFaction = factionName.trim();

    const errors: Record<string, string> = {};
    if (!trimmedEmail) errors.email = "Email is required";
    else if (!EMAIL_PATTERN.test(trimmedEmail)) errors.email = "Enter a valid email address";
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      errors.username = "3-20 chars, start with a letter, lowercase letters/numbers/underscores only";
    } else if (usernameStatus === "taken") {
      errors.username = "That username is already taken";
    }
    if (displayName.length < 2) errors.displayName = "At least 2 characters";
    if (password.length < 8) errors.password = "At least 8 characters";
    if (password !== confirmPassword)
      errors.confirmPassword = "Passwords don't match";
    if (isLeader && trimmedGuild.length < 2)
      errors.guildName = "At least 2 characters";
    if (accountType === "FACTION_LEADER" && trimmedFaction.length < 2)
      errors.factionName = "At least 2 characters";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    // Final authoritative check right before creating the Supabase account —
    // the debounced live check can be stale if the user submits quickly, and
    // once signUp() succeeds there's no clean way to undo it.
    try {
      const availability = await authApi.checkUsernameAvailable(trimmedUsername);
      if (!availability.success || !availability.data?.available) {
        setFieldErrors({ username: availability.data?.reason || "That username is already taken" });
        setIsLoading(false);
        return;
      }
    } catch {
      setFieldErrors({ username: "Couldn't verify username availability. Please try again." });
      setIsLoading(false);
      return;
    }

    try {
      const result = await register(
        trimmedEmail,
        password,
        confirmPassword,
        displayName,
        trimmedUsername,
        isLeader
          ? {
              accountType,
              guildName: trimmedGuild,
              ...(accountType === "FACTION_LEADER"
                ? { factionName: trimmedFaction }
                : {}),
            }
          : undefined,
      );
      if (result.success) {
        if (result.requiresVerification) {
          setIsVerificationSent(true);
          addToast("success", "Verification email sent!");
        } else {
          addToast("success", "Account created! Welcome to ForgeKeep.");
          router.push("/dashboard");
        }
      } else {
        const title = result.errorTitle || "";
        const message = result.error || "We couldn't create your account. Please try again.";
        const field = fieldForErrorTitle(title);
        if (field) {
          // Show it right under the relevant input instead of (or in addition
          // to) a detached banner, so it reads like the rest of the form's
          // validation rather than a generic failure.
          setFieldErrors({ [field]: message });
        } else {
          setError(message);
          setErrorTitle(title);
        }
      }
    } catch (err) {
      const friendly = friendlyAuthError(err instanceof Error ? err.message : undefined);
      setError(friendly.message);
      setErrorTitle(friendly.title);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setVerifyError("");
    if (verificationCode.trim().length < 6) {
      setVerifyError("Enter the 6-digit code from your email.");
      return;
    }
    setIsVerifying(true);
    try {
      const result = await verifyRegistrationCode(email, verificationCode.trim());
      if (result.success) {
        addToast("success", "Account verified! Welcome to ForgeKeep.");
        router.push(result.platformRole ? "/admin" : "/dashboard");
      } else {
        setVerifyError(result.error || "That code is invalid or has expired.");
      }
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResendCode() {
    setVerifyError("");
    setIsResending(true);
    try {
      const result = await resendVerificationCode(email);
      if (result.success) {
        addToast("success", "New code sent!");
      } else {
        setVerifyError(result.error || "Couldn't resend the code. Please try again.");
      }
    } finally {
      setIsResending(false);
    }
  }

  const strength = getPasswordStrength(password);

  if (isVerificationSent) {
    return (
      <div className="w-full relative text-center py-6">
        <AuthStagger baseDelay={200} stagger={80}>
          <div className="mb-6 flex justify-center">
            <div className="h-16 w-16 rounded-full bg-[#10D99A]/10 border border-[#10D99A]/30 flex items-center justify-center text-[#10D99A]">
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Verify your email
            <span className="text-[#F5B841]">.</span>
          </h1>
          <p className="text-sm text-[#8B8F98] mt-3 max-w-sm mx-auto leading-relaxed">
            We sent a 6-digit code to <strong className="text-white">{email}</strong>. Enter it below to activate your account.
          </p>

          {verifyError && (
            <div className="mt-5 px-4 py-3 rounded-xl bg-[#3A1A1E]/80 border border-[#D94A4A]/40 text-xs text-red-200 text-left animate-slide-down max-w-xs mx-auto">
              {verifyError}
            </div>
          )}

          <form onSubmit={handleVerifyCode} className="mt-6 max-w-xs mx-auto">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
              className="w-full text-center text-2xl tracking-[0.5em] font-mono px-4 py-3 rounded-xl bg-[#11141A] border border-white/[0.08] focus:border-[#F5B841]/50 text-white outline-none transition-colors"
            />
            <MagneticPress strength={5} className="block mt-4">
              <Button type="submit" fullWidth isLoading={isVerifying} size="lg" variant="auth">
                Verify &amp; continue
              </Button>
            </MagneticPress>
          </form>

          <div className="mt-5 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isResending}
              className="text-xs text-[#8B8F98] hover:text-[#F5B841] font-medium transition-colors disabled:opacity-50"
            >
              {isResending ? "Sending…" : "Didn't get a code? Resend"}
            </button>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl border border-white/[0.08] hover:border-[#F5B841]/30 bg-[#11141A] hover:bg-[#0B0D10] text-xs font-bold uppercase tracking-wider text-white transition-all duration-300"
            >
              Go to Login Page
            </Link>
          </div>
        </AuthStagger>
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <AuthStagger baseDelay={260} stagger={75}>
        <div className="mb-8 font-fantasy">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-[#F5B841] font-bold uppercase tracking-[0.24em]">
              Get started
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#F5B841]/25 to-transparent" />
          </div>
          <h1 className="text-[28px] leading-tight font-extrabold text-white tracking-tight">
            Create your account
            <span className="text-[#F5B841]">.</span>
          </h1>
          <p className="text-sm text-[#8B8F98] mt-2 leading-relaxed">
            Stand up your guild&apos;s command center in minutes. No credit card.
          </p>
        </div>

        <div className={error ? "block mb-5" : "hidden"}>
          {error && (
            <div className="px-4 py-3 rounded-xl bg-[#3A1A1E]/80 border border-[#D94A4A]/40 text-xs text-red-200 flex items-start gap-2.5 animate-slide-down">
              <svg
                className="h-4 w-4 text-[#D94A4A] flex-shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-red-100">{errorTitle || "Registration failed"}</span>
                <span className="text-red-300/80 leading-relaxed">{error}</span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Account type — drives self-serve guild / faction creation */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/70 mb-2">
              I&apos;m registering as
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPE_OPTIONS.map((opt) => {
                const active = accountType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAccountType(opt.value)}
                    aria-pressed={active}
                    className={`rounded-xl border px-2.5 py-2.5 text-center text-[11px] font-bold transition-all duration-200 ${
                      active
                        ? "border-[#F5B841]/60 bg-[#F5B841]/10 text-white shadow-[0_0_0_1px_rgba(245,184,65,0.15)]"
                        : "border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/20 hover:text-white/85"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#8B8F98]">
              {ACCOUNT_TYPE_OPTIONS.find((o) => o.value === accountType)?.desc}
            </p>
          </div>

          {accountType !== "MEMBER" && (
            <div className="animate-slide-down">
              <Input
                label="Guild name"
                type="text"
                placeholder="e.g. KuraCORP"
                value={guildName}
                onChange={(e) => setGuildName(e.target.value)}
                error={fieldErrors.guildName}
                variant="auth"
                required
                icon={
                  <svg
                    className="h-4 w-4 text-white/40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                }
              />
            </div>
          )}

          {accountType === "FACTION_LEADER" && (
            <div className="animate-slide-down">
              <Input
                label="Faction name"
                type="text"
                placeholder="e.g. Kurakortz"
                value={factionName}
                onChange={(e) => setFactionName(e.target.value)}
                error={fieldErrors.factionName}
                variant="auth"
                required
                icon={
                  <svg
                    className="h-4 w-4 text-white/40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                }
              />
            </div>
          )}

          <Input
            label="Display name"
            type="text"
            placeholder="GuildLeader"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={fieldErrors.displayName}
            variant="auth"
            required
            autoComplete="nickname"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
          />

          <div>
            <Input
              label="Username"
              type="text"
              placeholder="e.g. guildleader08"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              error={fieldErrors.username}
              variant="auth"
              required
              autoComplete="username"
              icon={
                <svg
                  className="h-4 w-4 text-white/40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
              }
            />
            {!fieldErrors.username && username.trim().length > 0 && (
              <p className={`mt-1.5 text-xs animate-slide-down ${
                usernameStatus === "available" ? "text-emerald-400" : usernameStatus === "taken" ? "text-red-400" : "text-[#8B8F98]"
              }`}>
                {usernameStatus === "checking" && "Checking availability…"}
                {usernameStatus === "available" && "Username is available"}
                {usernameStatus === "taken" && "That username is already taken"}
                {usernameStatus === "idle" && !USERNAME_PATTERN.test(username.trim().toLowerCase()) &&
                  "3-20 chars, start with a letter, lowercase letters/numbers/underscores only"}
              </p>
            )}
          </div>

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            variant="auth"
            required
            autoComplete="email"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <path d="M22 6l-10 7L2 6" />
              </svg>
            }
          />

          <div>
            <Input
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              variant="auth"
              required
              autoComplete="new-password"
              icon={
                <svg
                  className="h-4 w-4 text-white/40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              }
            />
            {password.length > 0 && (
              <div className="mt-3 space-y-1.5 animate-slide-down">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                        i <= strength.score ? strength.color : "bg-white/[0.04]"
                      }`}
                      style={{
                        transitionDelay: `${i * 40}ms`,
                      }}
                    />
                  ))}
                </div>
                <p className="text-[10px] tracking-wider flex items-center justify-between">
                  <span className="text-[#8B8F98] uppercase font-bold text-[9px] tracking-[0.12em] flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${strength.color}`} />
                    {strength.label}
                  </span>
                  <span className="font-mono text-[#8B8F98]">
                    {strength.score}/5
                  </span>
                </p>
              </div>
            )}
          </div>

          <Input
            label="Confirm password"
            type="password"
            placeholder="Type password again"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={fieldErrors.confirmPassword}
            variant="auth"
            required
            autoComplete="new-password"
            icon={
              <svg
                className="h-4 w-4 text-white/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            }
          />

          <MagneticPress strength={5} className="block mt-4">
            <Button type="submit" fullWidth isLoading={isLoading} size="lg" variant="auth" className="group">
              <span className="inline-flex items-center justify-center w-full">
                {/* Shield icon */}
                <svg
                  className="h-4 w-4 mr-2 text-[#F5B841]/90 transition-transform duration-300 group-hover:scale-110"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Create account
                {/* Right arrow icon */}
                <svg
                  className="h-3.5 w-3.5 ml-2 text-white/80 transition-transform duration-300 group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </Button>
          </MagneticPress>
        </form>

        <p className="text-[10px] text-[#8B8F98] mt-5 leading-relaxed text-center">
          By creating an account you agree to our{" "}
          <Link
            href="/"
            className="text-[#F5B841] hover:text-[#F5B841]/80 hover:underline underline-offset-2 transition-colors font-medium"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/"
            className="text-[#F5B841] hover:text-[#F5B841]/80 hover:underline underline-offset-2 transition-colors font-medium"
          >
            Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-7 pt-5 border-t border-white/[0.04] text-center">
          <p className="text-xs text-[#8B8F98]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="group text-white hover:text-[#F5B841] font-semibold transition-colors inline-flex items-center gap-1"
            >
              Sign in
              <svg
                className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5 text-[#F5B841]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </p>
        </div>
      </AuthStagger>
    </div>
  );
}
