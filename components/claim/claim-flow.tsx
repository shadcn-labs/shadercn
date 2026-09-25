"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyClaimedConfig } from "@/lib/claims/apply-config";
import {
  checkAvailability,
  requestClaim,
  resendClaim,
} from "@/lib/claims/client";
import type { AvailabilityState } from "@/lib/claims/client";
import {
  deriveOrbConfig,
  hashUsernameToSeed,
  pickVariantSlug,
} from "@/lib/claims/orb-generation";
import {
  canonicalizeUsername,
  isValidEmail,
  maskEmail,
  profilePathFor,
  validateUsername,
} from "@/lib/claims/usernames";
import { ORBS } from "@/lib/orbs";

import { TurnstileWidget, resetTurnstile } from "./turnstile-widget";

type Step = "username" | "email" | "inbox";

const DEBOUNCE_MS = 400;
const RESEND_COOLDOWN_S = 30;

const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
};

const availabilityMessage = (state: AvailabilityState): string => {
  switch (state.status) {
    case "checking": {
      return "Checking availability…";
    }
    case "available": {
      return "Username is available.";
    }
    case "unavailable": {
      if (state.code === "taken" || state.code === undefined) {
        return "That username is taken. Try another.";
      }
      return "That username can't be used. Try another.";
    }
    case "invalid": {
      return state.message ?? "That username can't be used.";
    }
    case "error": {
      return "Couldn't check availability. You can still continue — we'll confirm on the next step.";
    }
    default: {
      return "";
    }
  }
};

const statusClassFor = (state: AvailabilityState): string => {
  if (state.status === "available") {
    return "text-green-600 dark:text-green-400";
  }
  if (state.status === "invalid" || state.status === "unavailable") {
    return "text-destructive";
  }
  return "text-muted-foreground";
};

const resendLabel = (resending: boolean, cooldown: number): string => {
  if (resending) {
    return "Resending…";
  }
  if (cooldown > 0) {
    return `Resend (${cooldown}s)`;
  }
  return "Resend link";
};

const EmailStep = ({
  canSubmit,
  canonical,
  email,
  emailError,
  formError,
  onBack,
  onEmailChange,
  onExpireToken,
  onSubmit,
  onToken,
  submitting,
}: {
  canSubmit: boolean;
  canonical: string;
  email: string;
  emailError: string | null;
  formError: string | null;
  onBack: () => void;
  onEmailChange: (value: string) => void;
  onExpireToken: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onToken: (token: string) => void;
  submitting: boolean;
}) => (
  <form className="mt-6 max-w-md" onSubmit={onSubmit}>
    <p className="text-sm">
      Claiming <span className="font-semibold">@{canonical}</span>{" "}
      <span className="text-muted-foreground">
        ({profilePathFor(canonical)})
      </span>
    </p>
    <div className="mt-4">
      <label htmlFor="claim-email" className="text-sm font-medium">
        Email address
      </label>
      <Input
        id="claim-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        aria-invalid={emailError !== null}
        aria-describedby={emailError ? "claim-email-error" : undefined}
        placeholder="you@example.com"
        className="mt-2"
      />
      {emailError ? (
        <p
          id="claim-email-error"
          role="alert"
          className="text-destructive mt-2 text-sm"
        >
          {emailError}
        </p>
      ) : null}
    </div>
    <div className="mt-4">
      <TurnstileWidget onToken={onToken} onExpire={onExpireToken} />
    </div>
    {formError ? (
      <p role="alert" className="text-destructive mt-3 text-sm">
        {formError}
      </p>
    ) : null}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={!canSubmit || submitting} sound="click">
        {submitting ? "Sending…" : "Send confirmation link"}
      </Button>
      <Button type="button" variant="ghost" sound="click" onClick={onBack}>
        Change username
      </Button>
    </div>
    <p id="claim-privacy" className="text-muted-foreground mt-4 text-xs">
      We use your email only to confirm this claim. It stays private and is
      never shown on your public page. Transactional only — no newsletter
      signup.
    </p>
  </form>
);

const InboxStep = ({
  cooldown,
  email,
  formError,
  onChangeEmail,
  onResend,
  resending,
}: {
  cooldown: number;
  email: string;
  formError: string | null;
  onChangeEmail: () => void;
  onResend: () => void;
  resending: boolean;
}) => (
  <div className="mt-6 max-w-md">
    <p className="text-sm">
      We sent a confirmation link to{" "}
      <span className="font-semibold">{maskEmail(email)}</span>. It expires
      after 15 minutes.
    </p>
    {formError ? (
      <p role="alert" className="text-destructive mt-3 text-sm">
        {formError}
      </p>
    ) : null}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        sound="click"
        disabled={resending || cooldown > 0}
        onClick={onResend}
      >
        {resendLabel(resending, cooldown)}
      </Button>
      <Button
        type="button"
        variant="ghost"
        sound="click"
        onClick={onChangeEmail}
      >
        Change email
      </Button>
      <Button asChild variant="ghost" sound="click">
        <Link href="/">Close</Link>
      </Button>
    </div>
    <p className="text-muted-foreground mt-4 text-xs">
      Didn&apos;t get it? Check spam, then resend or change email. Each resend
      replaces older links.
    </p>
  </div>
);

const UsernameStepForm = ({
  availability,
  canContinue,
  onAdvance,
  onChange,
  username,
}: {
  availability: AvailabilityState;
  canContinue: boolean;
  onAdvance: () => void;
  onChange: (value: string) => void;
  username: string;
}) => (
  <form
    className="mt-6 max-w-md"
    onSubmit={(event) => {
      event.preventDefault();
      onAdvance();
    }}
  >
    <label htmlFor="claim-username" className="text-sm font-medium">
      Username
    </label>
    <div className="bg-background mt-2 flex items-stretch overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring/50">
      <span
        aria-hidden="true"
        className="text-muted-foreground flex items-center border-r px-3 text-sm"
      >
        shadercn.run/@
      </span>
      <Input
        id="claim-username"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={username}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={
          availability.status === "invalid" ||
          availability.status === "unavailable"
        }
        aria-describedby="claim-username-status"
        placeholder="yourname"
        className="rounded-none border-0 shadow-none focus-visible:ring-0"
      />
    </div>
    <div
      id="claim-username-status"
      role="status"
      aria-live="polite"
      className="mt-2 min-h-5 text-sm"
    >
      <span className={statusClassFor(availability)}>
        {availabilityMessage(availability)}
      </span>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={!canContinue} sound="click">
        Continue
      </Button>
      <Button asChild variant="ghost" sound="click">
        <Link href="/playground">Back to playground</Link>
      </Button>
    </div>
    <p className="text-muted-foreground mt-4 text-xs">
      3–20 characters: lowercase letters, numbers, underscores. Links expire
      after 15 minutes until confirmed.
    </p>
  </form>
);

export const ClaimFlow = () => {
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
  });
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const reducedMotion = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canonical = canonicalizeUsername(username);
  const localValidation = validateUsername(canonical);
  const usernameLocallyValid = username.trim().length > 0 && localValidation.ok;
  const canContinue =
    usernameLocallyValid &&
    (availability.status === "available" || availability.status === "error");

  // Live deterministic preview over the existing orb runtime.
  const preview = useMemo(() => {
    if (!usernameLocallyValid) {
      return null;
    }
    try {
      const seed = hashUsernameToSeed(canonical);
      const slug = pickVariantSlug(seed);
      const entry = ORBS[slug];
      if (!entry) {
        return null;
      }
      const config = deriveOrbConfig(seed, {
        colors: entry.variant.colors.map((c) => c.key),
        params: entry.variant.params.map((p) => ({
          key: p.key,
          max: p.max,
          min: p.min,
          step: p.step,
        })),
        slug,
      });
      const applied = applyClaimedConfig(entry.variant, config);
      return { Component: entry.Component, slug, ...applied };
    } catch {
      return null;
    }
  }, [canonical, usernameLocallyValid]);

  const backgroundEntry = ORBS["orb-01"];

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setResendCooldown((value) => value - 1),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(
    () => () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      abortRef.current?.abort();
    },
    []
  );

  const runAvailabilityCheck = async (value: string, signal: AbortSignal) => {
    const result = await checkAvailability(value, signal);
    if (signal.aborted) {
      return;
    }
    setAvailability(
      result.status === "checking" ? { status: "checking" } : result
    );
  };

  const onUsernameChange = (value: string) => {
    setUsername(value);
    setFormError(null);
    const next = canonicalizeUsername(value);
    if (value.trim().length === 0) {
      abortRef.current?.abort();
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      setAvailability({ status: "idle" });
      return;
    }
    const validation = validateUsername(next);
    if (!validation.ok) {
      abortRef.current?.abort();
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      setAvailability({ message: validation.message, status: "invalid" });
      return;
    }
    setAvailability({ status: "checking" });
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    debounceRef.current = window.setTimeout(() => {
      void runAvailabilityCheck(next, controller.signal);
    }, DEBOUNCE_MS);
  };

  const advanceFromUsername = () => {
    if (canContinue) {
      setStep("email");
    }
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    if (!turnstileToken) {
      setFormError("Complete the bot check, then try again.");
      return;
    }
    setSubmitting(true);
    const result = await requestClaim({
      email: trimmed,
      turnstileToken,
      username: canonical,
    });
    setSubmitting(false);
    resetTurnstile();
    setTurnstileToken(null);
    if (result.ok) {
      setEmail(trimmed);
      setStep("inbox");
      return;
    }
    const messages: Record<string, string> = {
      email_failed:
        "We couldn't send the confirmation email. Your name isn't locked in — try resending in a moment.",
      rate_limited: "Too many attempts. Wait a minute and try again.",
      turnstile_failed: "The bot check failed. Try again.",
      unavailable: "That username was just taken. Pick another.",
    };
    setFormError(
      messages[result.code ?? ""] ?? "Something went wrong. Try again."
    );
  };

  const handleResend = async () => {
    if (resending || resendCooldown > 0) {
      return;
    }
    setResending(true);
    setFormError(null);
    const result = await resendClaim({ email, username: canonical });
    setResending(false);
    if (result.ok) {
      setResendCooldown(RESEND_COOLDOWN_S);
      return;
    }
    if (result.code === "email_failed") {
      setFormError("We couldn't resend the email. Try again shortly.");
      return;
    }
    if (result.code === "rate_limited") {
      setFormError("Too many resends. Wait a minute and try again.");
      setResendCooldown(RESEND_COOLDOWN_S);
      return;
    }
    setFormError("Something went wrong. Try again.");
  };

  const PreviewOrb = preview?.Component;
  const BackgroundOrb = backgroundEntry.Component;
  const showPreview = PreviewOrb !== undefined && preview !== null;

  return (
    <div className="relative overflow-hidden rounded-xl border">
      {/* Live orb background (decorative, existing runtime only). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {showPreview && preview ? (
          <PreviewOrb
            colors={preview.colors}
            params={preview.params}
            paused={reducedMotion}
            size={560}
            state="idle"
            style={{ height: "100%", width: "100%" }}
          />
        ) : (
          <BackgroundOrb
            paused={reducedMotion}
            size={560}
            state="idle"
            style={{ height: "100%", width: "100%" }}
          />
        )}
        <div className="bg-background/80 absolute inset-0 backdrop-blur-sm" />
      </div>

      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
            Claim your orb
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-2 text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
          >
            {step === "username" ? "Claim your username" : null}
            {step === "email" ? "Make it yours" : null}
            {step === "inbox" ? "Check your inbox" : null}
          </h1>

          {step === "username" ? (
            <UsernameStepForm
              availability={availability}
              canContinue={canContinue}
              onAdvance={advanceFromUsername}
              onChange={onUsernameChange}
              username={username}
            />
          ) : null}
          {step === "email" ? (
            <EmailStep
              canSubmit={isValidEmail(email) && turnstileToken !== null}
              canonical={canonical}
              email={email}
              emailError={emailError}
              formError={formError}
              onBack={() => {
                setStep("username");
                setFormError(null);
              }}
              onEmailChange={(value) => {
                setEmail(value);
                setEmailError(null);
              }}
              onExpireToken={() => setTurnstileToken(null)}
              onSubmit={submitEmail}
              onToken={setTurnstileToken}
              submitting={submitting}
            />
          ) : null}
          {step === "inbox" ? (
            <InboxStep
              cooldown={resendCooldown}
              email={email}
              formError={formError}
              onChangeEmail={() => {
                setStep("email");
                setFormError(null);
              }}
              onResend={handleResend}
              resending={resending}
            />
          ) : null}
        </div>

        <aside className="bg-card/90 hidden rounded-lg border p-4 text-sm backdrop-blur lg:block">
          <p className="font-medium">How it works</p>
          <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5">
            <li>Pick an available username.</li>
            <li>Confirm it through a 15-minute email link.</li>
            <li>Get a deterministic one-of-one orb at /@username.</li>
          </ol>
          <p className="text-muted-foreground mt-3 text-xs">
            No passwords, no accounts. One verified name per email. Your email
            is never public.
          </p>
        </aside>
      </div>
    </div>
  );
};
