"use client";

import { type InputHTMLAttributes, forwardRef, useState } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: "default" | "auth";
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, rightIcon, className = "", type, id, variant = "default", ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    const labelClass = variant === "auth"
      ? "block text-[10px] font-bold uppercase tracking-[0.2em] text-[#8B8F98] mb-2"
      : "block text-sm font-medium text-gray-300 mb-1.5";

    const inputClass = variant === "auth"
      ? `
        w-full rounded-xl bg-[#11141A] border border-[#1E232B]
        text-[#F4F4F5] placeholder-[#8B8F98]
        transition-all duration-300
        focus:outline-none focus:border-[#F5B841]/60 focus:ring-4 focus:ring-[#F5B841]/10
        focus:bg-[#0B0D10]
        hover:border-white/[0.12]
        ${icon ? "pl-10" : "px-4"}
        ${isPassword || rightIcon ? "pr-10" : "pr-4"}
        py-3 text-sm
        ${error ? "border-[#D94A4A]/60 focus:border-[#D94A4A]/60 focus:ring-[#D94A4A]/20" : ""}
      `
      : `
        w-full rounded-xl bg-surface-100 border border-white/8
        text-white placeholder-gray-500
        transition-all duration-200
        focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20
        focus:bg-surface-200
        hover:border-white/12
        ${icon ? "pl-10" : "px-4"}
        ${isPassword || rightIcon ? "pr-10" : "pr-4"}
        py-3 text-sm
        ${error ? "border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20" : ""}
      `;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className={labelClass}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className={`absolute left-3 top-1/2 -translate-y-1/2 ${variant === "auth" ? "text-[#8B8F98]" : "text-gray-500"}`}>
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={isPassword && showPassword ? "text" : type}
            className={`${inputClass} ${className}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          )}
          {rightIcon && !isPassword && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-red-400 animate-slide-down">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
