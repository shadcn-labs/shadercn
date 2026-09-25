"use client";

/** Typed client for the same-origin /api/claims proxy (never hits D1 directly). */

import { ROUTES } from "@/constants/routes";

export type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; code?: string }
  | { status: "invalid"; code?: string; message?: string }
  | { status: "error" };

interface AvailabilityResponse {
  available?: boolean;
  code?: string;
  ok?: boolean;
}

export const checkAvailability = async (
  username: string,
  signal?: AbortSignal
): Promise<AvailabilityState> => {
  try {
    const response = await fetch(
      `${ROUTES.API_CLAIMS}/availability?username=${encodeURIComponent(username)}`,
      { signal }
    );
    if (!response.ok) {
      return { status: "error" };
    }
    const data = (await response.json()) as AvailabilityResponse;
    if (data.available) {
      return { status: "available" };
    }
    return { code: data.code, status: "unavailable" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "checking" };
    }
    return { status: "error" };
  }
};

export const requestClaim = async (input: {
  username: string;
  email: string;
  turnstileToken: string;
}): Promise<{ ok: boolean; code?: string }> => {
  const response = await fetch(`${ROUTES.API_CLAIMS}/request`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (response.ok) {
    return { ok: true };
  }
  try {
    const data = (await response.json()) as { code?: string };
    return { code: data.code, ok: false };
  } catch {
    return { code: "request_failed", ok: false };
  }
};

export const resendClaim = async (input: {
  username: string;
  email: string;
}): Promise<{ ok: boolean; code?: string }> => {
  const response = await fetch(`${ROUTES.API_CLAIMS}/resend`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (response.ok) {
    return { ok: true };
  }
  try {
    const data = (await response.json()) as { code?: string };
    return { code: data.code, ok: false };
  } catch {
    return { code: "request_failed", ok: false };
  }
};

export type VerifyResult =
  | { ok: true; username: string }
  | { code: string; ok: false };

export const verifyClaim = async (token: string): Promise<VerifyResult> => {
  const response = await fetch(
    `${ROUTES.API_CLAIMS}/verify?token=${encodeURIComponent(token)}`
  );
  try {
    const data = (await response.json()) as {
      username?: string;
      code?: string;
    };
    if (response.ok && data.username) {
      return { ok: true, username: data.username };
    }
    return { code: data.code ?? "invalid", ok: false };
  } catch {
    return { code: "request_failed", ok: false };
  }
};
