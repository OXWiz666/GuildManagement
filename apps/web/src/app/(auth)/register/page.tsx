"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { AuthStagger, MagneticPress } from "@/components/auth/AuthAnim";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { register } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

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
      { label: "Very weak", color: "bg-red-500/80" },
      { label: "Weak", color: "bg-orange-500/80" },
      { label: "Fair", color: "bg-yellow-500/80" },
      { label: "Strong", color: "bg-emerald-500/80" },
      { label: "Excellent", color: "bg-emerald-400" },
    ];
    const level = levels[Math.max(0, score - 1)] || levels[0]!;
    return { score, ...level };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setIsLoading(true);

    const errors: Record<string, string> = {};
    if (displayName.length < 2) errors.displayName = "At least 2 characters";
    if (password.length < 8) errors.password = "At least 8 characters";
    if (password !== confirmPassword)
      errors.confirmPassword = "Passwords don't match";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      const result = await register(
        email,
        password,
        confirmPassword,
        displayName,
      );
      if (result.success) {
        addToast("success", "Account created! Welcome to GuildMaster.");
        router.push("/dashboard");
      } else {
        setError(result.error || "Registration failed");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  const strength = getPasswordStrength(password);

  return (
    <div className="w-full relative">
      <AuthStagger baseDelay={260} stagger={75}>
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] text-white/40 uppercase tracking-[0.24em]">
              Get started
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
          </div>
          <h1 className="text-[28px] leading-tight font-semibold text-white tracking-tight">
            Create your account
            <span className="text-white/40">.</span>
          </h1>
          <p className="text-sm text-white/50 mt-2 leading-relaxed">
            Lead your guild with a real management platform.
          </p>
        </div>

        <div className={error ? "block mb-5" : "hidden"}>
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/[0.08] border border-red-500/20 text-xs text-red-300 flex items-start gap-2.5 animate-slide-down">
              <svg
                className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-px"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Display name"
            type="text"
            placeholder="GuildLeader"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            error={fieldErrors.displayName}
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
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            }
          />

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${
                        i <= strength.score ? strength.color : "bg-white/[0.06]"
                      }`}
                      style={{
                        transitionDelay: `${i * 60}ms`,
                      }}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-white/40 tracking-wide flex items-center justify-between">
                  <span>{strength.label}</span>
                  <span className="font-mono text-white/30">
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

          <MagneticPress strength={5} className="block mt-3">
            <Button type="submit" fullWidth isLoading={isLoading} size="lg">
              <span className="inline-flex items-center gap-2">
                Create account
                <svg
                  className="h-3.5 w-3.5"
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

        <p className="text-[10px] text-white/35 mt-5 leading-relaxed text-center">
          By creating an account you agree to our{" "}
          <Link
            href="/"
            className="text-white/60 hover:text-white underline underline-offset-2 transition-colors"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/"
            className="text-white/60 hover:text-white underline underline-offset-2 transition-colors"
          >
            Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-7 pt-5 border-t border-white/[0.06] text-center">
          <p className="text-xs text-white/40">
            Already have an account?{" "}
            <Link
              href="/login"
              className="group text-white hover:text-white/80 font-medium transition-colors inline-flex items-center gap-1"
            >
              Sign in
              <svg
                className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
