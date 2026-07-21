"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

interface FieldErrors {
  name?: string[];
  email?: string[];
  password?: string[];
  confirmPassword?: string[];
}

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  function validateClient(): boolean {
    const errors: FieldErrors = {};

    if (!name.trim()) {
      errors.name = ["Name is required"];
    }

    if (!email) {
      errors.email = ["Email is required"];
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = ["Please enter a valid email address"];
    }

    if (password.length < 8) {
      errors.password = ["Password must be at least 8 characters"];
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = ["Passwords do not match"];
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!validateClient()) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setFieldErrors({ email: [data.error] });
        } else if (data.details) {
          setFieldErrors(data.details);
        } else {
          setError(data.error ?? "Registration failed. Please try again.");
        }
        return;
      }

      // Success: redirect to login with success indicator
      router.push("/login?registered=true");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const passwordStrength = (() => {
    if (!password) return null;
    if (password.length < 8) return { label: "Too short", color: "text-red-500", width: "w-1/4" };
    if (password.length < 10) return { label: "Weak", color: "text-orange-500", width: "w-1/2" };
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password))
      return { label: "Fair", color: "text-yellow-500", width: "w-3/4" };
    return { label: "Strong", color: "text-emerald-600", width: "w-full" };
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Image src="/logo.webp" alt="Senchy" width={48} height={48} className="rounded-xl shadow-lg" unoptimized />
          <div>
            <h1 className="text-2xl font-bold text-white">Senchy</h1>
            <p className="text-xs text-emerald-400">Bike Trip Planner</p>
          </div>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Create your account</CardTitle>
            <CardDescription>
              Start planning your cycling adventures
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  autoFocus
                  error={fieldErrors.name?.[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  error={fieldErrors.email?.[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  error={fieldErrors.password?.[0]}
                />
                {passwordStrength && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${passwordStrength.width} ${
                          passwordStrength.label === "Strong"
                            ? "bg-emerald-500"
                            : passwordStrength.label === "Fair"
                            ? "bg-yellow-400"
                            : passwordStrength.label === "Weak"
                            ? "bg-orange-400"
                            : "bg-red-400"
                        }`}
                      />
                    </div>
                    <p className={`text-xs font-medium ${passwordStrength.color}`}>
                      {passwordStrength.label}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    error={fieldErrors.confirmPassword?.[0]}
                    className={
                      confirmPassword && password === confirmPassword
                        ? "pr-10 border-emerald-400 focus:ring-emerald-500"
                        : ""
                    }
                  />
                  {confirmPassword && password === confirmPassword && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 pointer-events-none" />
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500">
                By creating an account, you agree to our{" "}
                <span className="text-emerald-600 cursor-pointer hover:underline">
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="text-emerald-600 cursor-pointer hover:underline">
                  Privacy Policy
                </span>
                .
              </p>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 pt-2">
              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
                disabled={!name || !email || !password || !confirmPassword}
              >
                Create account
              </Button>

              <p className="text-sm text-slate-500 text-center">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
