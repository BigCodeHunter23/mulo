import { afterEach, describe, expect, it, vi } from "vitest";
import { envProblems, serviceRoleKey, supabaseUrl } from "./env";

const GOOD = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

afterEach(() => vi.unstubAllEnvs());

describe("env", () => {
  it("has no problems when everything is set", () => {
    for (const [name, value] of Object.entries(GOOD)) vi.stubEnv(name, value);
    expect(envProblems()).toEqual([]);
    expect(supabaseUrl()).toBe(GOOD.NEXT_PUBLIC_SUPABASE_URL);
  });

  it("names each missing or broken variable and where to set it", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const problems = envProblems();
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^NEXT_PUBLIC_SUPABASE_URL isn't valid\. .*Vercel/);
    expect(problems[1]).toMatch(/^SUPABASE_SERVICE_ROLE_KEY is missing\./);
  });

  it("throws a clear error when a missing variable is used", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => serviceRoleKey()).toThrow(/SUPABASE_SERVICE_ROLE_KEY is missing/);
  });
});
