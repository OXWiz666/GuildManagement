"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent" | "auth";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      fullWidth = false,
      className = "",
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "relative inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 focus-ring select-none active:scale-[0.98] cursor-pointer";

    const variants = {
      primary:
        "bg-primary-600 text-white hover:bg-primary-500 shadow-sm shadow-primary-500/10 hover:shadow-primary-500/20",
      secondary:
        "bg-white/[0.06] text-zinc-300 border border-white/[0.06] hover:bg-white/[0.10] hover:text-white",
      ghost:
        "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]",
      danger:
        "bg-red-600 text-white hover:bg-red-500 shadow-sm shadow-red-500/10",
      accent:
        "bg-accent-600 text-white hover:bg-accent-500 shadow-sm shadow-accent-500/10",
      auth:
        "bg-gradient-to-b from-[#1C2635] to-[#121924] text-white border border-[#1E232B] hover:border-[#F5B841]/50 shadow-[0_0_0_1px_rgba(245,184,65,0.06),_inset_0_1px_0_rgba(255,255,255,0.08)] hover:shadow-[0_0_15px_rgba(245,184,65,0.25),_inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-300",
    };

    const spinnerColors = {
      primary: "text-white",
      secondary: "text-primary-400",
      ghost: "text-primary-400",
      danger: "text-white",
      accent: "text-white",
      auth: "text-[#F5B841]",
    };

    const sizes = {
      xs: "px-2 py-1 text-[10px] gap-1.5",
      sm: "px-3 py-1.5 text-[11px] gap-1.5",
      md: "px-4 py-2 text-[13px] gap-2",
      lg: "px-6 py-3 text-sm gap-2.5",
    };

    const disabledStyles =
      "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:shadow-none";

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${disabledStyles} ${fullWidth ? "w-full" : ""} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <div className="relative flex items-center justify-center shrink-0 -ml-1 mr-0.5">
            {/* Ambient neon pulse glow for secondary and ghost buttons */}
            {(variant === "secondary" || variant === "ghost") && (
              <div className="absolute inset-0 rounded-full bg-primary-400/35 blur-sm animate-pulse" />
            )}
            <svg
              className={`animate-spin h-3.5 w-3.5 ${spinnerColors[variant]}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-20"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3.5"
              />
              <path
                className="opacity-90"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export default Button;
