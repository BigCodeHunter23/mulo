import { describe, expect, it } from "vitest";
import { factsFromClaims, FRESH_SECONDS } from "@/lib/session-facts";

const NOW = 1_800_000_000;

describe("factsFromClaims", () => {
  it("reads the methods, and counts email as a password", () => {
    const facts = factsFromClaims(
      {
        app_metadata: { providers: ["email", "google"] },
        amr: [{ method: "password", timestamp: NOW - 60 }],
      },
      NOW,
    );
    expect(facts).toEqual({
      signInMethods: ["email", "google"],
      hasPassword: true,
      freshSignIn: true,
    });
  });

  it("counts a password set later on a social account", () => {
    const facts = factsFromClaims(
      { app_metadata: { providers: ["apple"], has_password: true }, amr: [] },
      NOW,
    );
    expect(facts.hasPassword).toBe(true);
  });

  it("calls a sign-in older than five minutes stale", () => {
    const facts = factsFromClaims(
      {
        app_metadata: { providers: ["apple"] },
        amr: [{ method: "oauth", timestamp: NOW - FRESH_SECONDS - 1 }],
      },
      NOW,
    );
    expect(facts).toEqual({ signInMethods: ["apple"], hasPassword: false, freshSignIn: false });
  });

  it("doesn't count a token refresh as a sign-in", () => {
    const facts = factsFromClaims(
      {
        app_metadata: { providers: ["apple"] },
        amr: [{ method: "token_refresh", timestamp: NOW - 10 }],
      },
      NOW,
    );
    expect(facts.freshSignIn).toBe(false);
  });

  it("doesn't count a sign-in dated in the future", () => {
    const facts = factsFromClaims(
      {
        app_metadata: { providers: ["apple"] },
        amr: [{ method: "oauth", timestamp: NOW + 600 }],
      },
      NOW,
    );
    expect(facts.freshSignIn).toBe(false);
  });

  it("allows half a minute of clock difference for a sign-in just ahead of this clock", () => {
    const at = (timestamp: number) =>
      factsFromClaims(
        { app_metadata: { providers: ["apple"] }, amr: [{ method: "oauth", timestamp }] },
        NOW,
      ).freshSignIn;
    expect(at(NOW + 30)).toBe(true);
    expect(at(NOW + 31)).toBe(false);
  });

  it.each(["password", "oauth", "otp", "magiclink", "recovery", "sso/saml", "id_token"])(
    "counts a sign-in by %s",
    (method) => {
      const facts = factsFromClaims(
        { app_metadata: { providers: ["apple"] }, amr: [{ method, timestamp: NOW - 10 }] },
        NOW,
      );
      expect(facts.freshSignIn).toBe(true);
    },
  );

  // A second factor (or anything else) added to an old session isn't signing in.
  it.each([
    "totp",
    "mfa/totp",
    "mfa/phone",
    "mfa/webauthn",
    "anonymous",
    "web3",
    "token_refresh",
    "email_change",
    "something-new",
  ])("never counts %s", (method) => {
    const facts = factsFromClaims(
      {
        app_metadata: { providers: ["apple"] },
        amr: [
          { method: "oauth", timestamp: NOW - FRESH_SECONDS - 60 },
          { method, timestamp: NOW - 10 },
        ],
      },
      NOW,
    );
    expect(facts.freshSignIn).toBe(false);
  });

  it("ignores providers it doesn't offer, and claims it can't read", () => {
    expect(
      factsFromClaims({ app_metadata: { providers: ["github", 7] }, amr: ["password"] }, NOW),
    ).toEqual({ signInMethods: [], hasPassword: false, freshSignIn: false });
  });
});
