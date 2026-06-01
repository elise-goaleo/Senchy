import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "destructive" | "outline";
}

const variantStyles = {
  default: "bg-emerald-100 text-emerald-800 border-emerald-200",
  secondary: "bg-slate-100 text-slate-800 border-slate-200",
  success: "bg-green-100 text-green-800 border-green-200",
  destructive: "bg-red-100 text-red-800 border-red-200",
  outline: "bg-transparent text-slate-700 border-slate-300",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
