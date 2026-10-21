"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/brand";
import BrandMark from "@/components/brand/BrandMark";
import CoBrand from "@/components/brand/CoBrand";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("E-mail ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-br from-ink-950 via-brand-950 to-ink-900 px-4">
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-8 shadow-2xl backdrop-blur-lg">
            <div className="mb-8 text-center">
              <BrandMark className="mx-auto mb-4 h-14 w-14 rounded-2xl" />
              <h1 className="text-2xl font-bold text-white">{APP_NAME}</h1>
              <p className="mt-1 text-slate-400">Espace RH et direction</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                  className={inputClass}
                  placeholder="prenom.nom@entreprise.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={`${inputClass} pr-12`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!email || !password} icon={<LogIn className="h-4 w-4" />}>
                {loading ? "Connexion…" : "Se connecter"}
              </Button>

              <p className="text-center text-xs text-slate-400">
                Mot de passe oublié ? Contactez un administrateur de l&apos;application.
              </p>
            </form>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <CoBrand onDark size="md" />
          </div>
        </div>
      </main>
      <footer className="pb-6 text-center text-xs text-slate-500">
        <Link href="/privacy" className="hover:text-slate-300 hover:underline">
          Politique de confidentialité
        </Link>
      </footer>
    </div>
  );
}
