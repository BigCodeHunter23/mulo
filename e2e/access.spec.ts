import { expect, test } from "@playwright/test";

/**
 * Signed-out visitors are turned away from pages that need an account, with
 * a real redirect to log in that remembers the way back. No database needed:
 * nobody is signed in, so the session check never leaves the server.
 */

const GUARDED: [path: string, next: string][] = [
  ["/stack", "/stack"],
  ["/stack?decade=1990&genre=hip-hop", "/stack?decade=1990&genre=hip-hop"],
  ["/goat?kind=albums", "/goat?kind=albums"],
  ["/ratings", "/ratings"],
  ["/notifications", "/notifications"],
  ["/profile", "/profile"],
  ["/profile/raised-on", "/profile/raised-on"],
  ["/welcome?intro=1", "/welcome?intro=1"],
  ["/lists/new", "/lists/new"],
  ["/badges", "/badges"],
  ["/people", "/people"],
  ["/u/alextest/follows?show=following", "/u/alextest/follows?show=following"],
  ["/u/alextest/vs", "/u/alextest/vs"],
  [
    "/artist/0383dadf-2a4e-4d10-a46a-e9e041da8eb3/gauntlet",
    "/artist/0383dadf-2a4e-4d10-a46a-e9e041da8eb3/gauntlet",
  ],
];

for (const [path, next] of GUARDED) {
  test(`signed out, ${path} redirects to log in and back`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);

    const location = new URL(response.headers()["location"], "http://x.invalid");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(next);
  });
}

test("the login page never sends anyone off-site", async ({ request }) => {
  for (const next of ["//evil.com", "/\\evil.com", "https://evil.com"]) {
    const response = await request.get(`/login?next=${encodeURIComponent(next)}`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    // Where the form will send them once logged in. (The raw query string is
    // echoed in the page's data, so look at the field, not the whole page.)
    const html = await response.text();
    expect(html).toMatch(/<input type="hidden" name="next" value="\/"\/>/);
  }
});

test("the login page keeps a safe way back", async ({ request }) => {
  const response = await request.get(`/login?next=${encodeURIComponent("/charts?type=songs")}`);
  const html = await response.text();
  expect(html).toContain('name="next" value="/charts?type=songs"');
});

test("a bad email link goes to log in with an explanation, never off-site", async ({ request }) => {
  const response = await request.get(
    `/auth/confirm?code=not-a-real-code&next=${encodeURIComponent("/\\evil.com")}`,
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(307);
  const location = new URL(response.headers()["location"], "http://x.invalid");
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("notice")).toBe("link-expired");
  expect(response.headers()["location"]).not.toContain("evil.com");
});

test("an expired password reset link goes back to the reset page", async ({ request }) => {
  const response = await request.get("/auth/confirm?next=%2Fauth%2Fupdate-password", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toContain("/auth/reset?expired=1");
});
