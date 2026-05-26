import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

export default function Card({
  children,
  className = "",
  hover = false,
  glow = false,
  padding = "md",
}: CardProps) {
  const paddings = {
    none: "",
    sm: "p-4",
    md: "p-5",
    lg: "p-6",
  };

  return (
    <div
      className={`
        glass rounded-xl
        ${paddings[padding]}
        ${hover ? "hover:bg-white/[0.08] hover:-translate-y-px transition-all duration-200" : ""}
        ${glow ? "neon-glow" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
