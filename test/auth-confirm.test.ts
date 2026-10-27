import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  exchange: null as unknown,
  remember: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: async () => state.exchange,
      verifyOtp: async () => state.exchange,
    },
  })),
}));
vi.mock("@/lib/invites", () => ({ consumeInviteCookie: vi.fn(async () => undefined) }));
vi.mock("@/lib/apple-tokens", async (original) => ({
  ...(await original<typeof import("@/lib/apple-tokens")>()),
  rememberAppleToken: state.remember,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));

const EARLIER = "2026-10-01T09:00:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";

/**
 * A sign-in by `provider` with this provider token. `first` is what the
 * account was first made with (`app_metadata.provider`); `before` is a way of
 * signing in it used earlier.
 */
function session(
  provider: string,
  refresh: string | null,
  { first = provider, before }: { first?: string; before?: string } = {},
) {
  const identities = [
    ...(before ? [{ provider: before, last_sign_in_at: EARLIER }] : []),
    { provider, last_sign_in_at: NOW },
  ].map((identity) => ({
    ...identity,
    id: `${identity.provider}-id`,
    identity_id: `${identity.provider}-identity`,
    user_id: "user-1",
  }));
  const user = { id: "user-1", app_metadata: { provider: first }, identities };
  return { data: { user, session: { user, provider_refresh_token: refresh } }, error: null };
}

async function visit(search: string) {
  const { GET } = await import("@/app/auth/confirm/route");
  return GET(new NextRequest(`http://localhost/auth/confirm${search}`)).catch((e: Error) => e);
}

beforeEach(() => {
  state.remember.mockClear();
  process.env.APPLE_SERVICES_ID = "com.example.web";
});

describe("/auth/confirm", () => {
  it("keeps Apple's token after signing in with Apple", async () => {
    state.exchange = session("apple", "r-token");
    expect(await visit("?code=abc&next=%2Fratings")).toEqual(new Error("redirect:/ratings"));
    expect(state.remember).toHaveBeenCalledWith("user-1", "r-token", "com.example.web");
  });

  it("keeps Apple's token for an account first made with email, now signing in with Apple", async () => {
    state.exchange = session("apple", "r-token", { first: "email", before: "email" });
    await visit("?code=abc");
    expect(state.remember).toHaveBeenCalledWith("user-1", "r-token", "com.example.web");
  });

  it("never keeps Google's token as Apple's, for an Apple account signing in with Google", async () => {
    state.exchange = session("google", "g-token", { first: "apple", before: "apple" });
    expect(await visit("?code=abc")).toEqual(new Error("redirect:/"));
    expect(state.remember).not.toHaveBeenCalled();
  });

  it("keeps nothing for Google, or when Apple gave no token, or with no client id", async () => {
    state.exchange = session("google", "r-token");
    await visit("?code=abc");
    state.exchange = session("apple", null);
    await visit("?code=abc");
    state.exchange = session("apple", "r-token");
    delete process.env.APPLE_SERVICES_ID;
    await visit("?code=abc");
    expect(state.remember).not.toHaveBeenCalled();
  });

  it("copes with a user that has no app_metadata or identities", async () => {
    state.exchange = {
      data: { user: { id: "u" }, session: { user: { id: "u" }, provider_refresh_token: "x" } },
      error: null,
    };
    expect(await visit("?code=abc")).toEqual(new Error("redirect:/"));
    expect(state.remember).not.toHaveBeenCalled();
  });

  it("sends a cancelled sign-in back to log in, saying so plainly", async () => {
    expect(
      await visit("?error=access_denied&error_description=User+cancelled&next=%2Fratings"),
    ).toEqual(new Error("redirect:/login?next=%2Fratings&notice=sign-in-cancelled"));
    expect(await visit("?error=server_error")).toEqual(
      new Error("redirect:/login?notice=sign-in-cancelled"),
    );
    expect(state.remember).not.toHaveBeenCalled();
  });

  it("still calls an expired email link expired, even when Supabase sends it back with an error", async () => {
    expect(await visit("?error=access_denied&error_code=otp_expired&next=%2Fratings")).toEqual(
      new Error("redirect:/login?next=%2Fratings&notice=link-expired"),
    );
    expect(
      await visit("?error=access_denied&error_code=otp_expired&next=%2Fauth%2Fupdate-password"),
    ).toEqual(new Error("redirect:/auth/reset?expired=1"));
    state.exchange = { data: { user: null, session: null }, error: { message: "expired" } };
    expect(await visit("?code=abc")).toEqual(new Error("redirect:/login?notice=link-expired"));
    expect(await visit("")).toEqual(new Error("redirect:/login?notice=link-expired"));
  });

  it("leaves the token_hash branch alone", async () => {
    state.exchange = session("apple", "r-token");
    await visit("?token_hash=h&type=recovery");
    expect(state.remember).not.toHaveBeenCalled();
  });
});
