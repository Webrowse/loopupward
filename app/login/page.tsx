"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, apiConfigured, GOOGLE_CLIENT_ID, setToken } from "@/lib/api";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const configured = apiConfigured() && GOOGLE_CLIENT_ID.length > 0;
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCredential = useCallback(async (credential: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string }>("/v1/auth/google", {
        method: "POST",
        body: { credential },
      });
      setToken(res.token);
      window.location.href = "/home";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed — try again");
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const render = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => handleCredential(resp.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: 280,
        text: "continue_with",
      });
    };
    if (window.google) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    document.body.appendChild(script);
  }, [configured, handleCredential]);

  return (
    <div className="relative z-[1] mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6">
      <p className="font-display text-3xl text-ink">LoopUpward</p>
      <p className="mt-2 text-sm text-ink-2">A place where you build yourself.</p>

      <div className="mt-12 flex w-full max-w-xs flex-col items-center">
        {configured ? (
          <>
            <div ref={buttonRef} className="min-h-11" />
            {busy && <p className="mt-3 text-sm text-ink-3">Opening your space…</p>}
            {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
          </>
        ) : (
          <p className="text-center text-sm leading-relaxed text-ink-2">
            Cloud sign-in isn&apos;t configured for this deployment yet. You can still use
            LoopUpward — everything is saved privately on this device.
          </p>
        )}

        <Link
          href="/home"
          className="mt-6 block text-center text-sm text-ink-3 hover:text-ink-2"
        >
          {configured ? "Or continue on this device only →" : "Open LoopUpward →"}
        </Link>
      </div>

      <p className="mt-16 max-w-xs text-center text-xs leading-relaxed text-ink-3">
        Your account is private. Your data is never mixed with anyone else&apos;s, never
        sold, and you can export all of it anytime. Anything already captured on this
        device moves into your account when you sign in.
      </p>
    </div>
  );
}
