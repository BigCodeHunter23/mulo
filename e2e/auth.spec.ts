import { expect, test, type Page } from "@playwright/test";

/**
 * The flows that need a real account: log in, stay logged in, come back to
 * where you were, rate an album, see a profile, log out. They run against a
 * NON-PRODUCTION Supabase project (the app must be built with its URL and
 * keys) and an existing, confirmed test account that has a username:
 *
 *   E2E_EMAIL, E2E_PASSWORD   the test account
 *   E2E_USERNAME              its username
 *   E2E_ALBUM_MBID            an album already in that project's catalogue
 *   E2E_SIGNUP_DOMAIN         optional: lets the sign-up test create
 *                             throwaway accounts at <random>@<domain>
 *
 * Without them, these skip.
 */

const env = {
  email: process.env.E2E_EMAIL,
  password: process.env.E2E_PASSWORD,
  username: process.env.E2E_USERNAME,
  album: process.env.E2E_ALBUM_MBID,
};

test.describe("signed-in flows", () => {
  test.skip(
    !env.email || !env.password || !env.username || !env.album,
    "Needs E2E_EMAIL, E2E_PASSWORD, E2E_USERNAME and E2E_ALBUM_MBID for a test project.",
  );

  async function logIn(page: Page) {
    await page.getByLabel("Email").fill(env.email!);
    await page.getByLabel("Password").fill(env.password!);
    await page.getByRole("button", { name: "Log in", exact: true }).last().click();
  }

  test("a wrong password gets a plain answer", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(env.email!);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Log in", exact: true }).last().click();
    await expect(page.getByText("doesn't match an account")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("a protected page sends you to log in and back again", async ({ page }) => {
    await page.goto("/ratings");
    await expect(page).toHaveURL(/\/login\?next=%2Fratings/);
    await logIn(page);
    await expect(page).toHaveURL(/\/ratings$/);
    await expect(page.getByRole("heading", { name: "My ratings" })).toBeVisible();
  });

  test("logging in from a page comes back to it, and the session survives a reload", async ({
    page,
  }) => {
    await page.goto(`/album/${env.album}`);
    await page.getByRole("link", { name: "Log in" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Falbum%2F${env.album}`));
    await logIn(page);
    await expect(page).toHaveURL(new RegExp(`/album/${env.album}$`));

    await page.reload();
    await expect(page.getByRole("group", { name: "Your score out of 10" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Notifications/ })).toBeVisible();
  });

  test("rate an album, and the score is still there after a reload", async ({ page }) => {
    await page.goto(`/login?next=${encodeURIComponent(`/album/${env.album}`)}`);
    await logIn(page);
    await expect(page).toHaveURL(new RegExp(`/album/${env.album}$`));

    const scores = page.getByRole("group", { name: "Your score out of 10" });
    // Pick whichever of 7 and 8 isn't already chosen, so the save is a real change.
    const seven = scores.getByRole("button", { name: "7", exact: true });
    const target = (await seven.getAttribute("aria-pressed")) === "true" ? "8" : "7";
    await scores.getByRole("button", { name: target, exact: true }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.reload();
    await expect(scores.getByRole("button", { name: target, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("view a profile", async ({ page }) => {
    await page.goto(`/u/${env.username}`);
    await expect(page.getByText(`@${env.username}`).first()).toBeVisible();
  });

  test("log out ends the session on this device", async ({ page }) => {
    await page.goto("/login?next=%2Fprofile");
    await logIn(page);
    await expect(page).toHaveURL(/\/profile$/);

    await page.getByRole("button", { name: "Log out" }).last().click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/ratings");
    await expect(page).toHaveURL(/\/login\?next=%2Fratings/);
  });
});

test.describe("sign up", () => {
  const domain = process.env.E2E_SIGNUP_DOMAIN;
  test.skip(!domain, "Needs E2E_SIGNUP_DOMAIN: creates a throwaway account.");

  test("a new account either goes to the welcome steps or is told to confirm", async ({ page }) => {
    const email = `mulo-e2e-${Date.now()}@${domain}`;
    await page.goto("/login?mode=signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("e2e-password-123");
    await page.getByRole("button", { name: "Create account" }).click();

    // Which one depends on the project's "Confirm email" setting.
    await expect(
      page.getByText("Check your email for a confirmation link").or(page.getByText("Your profile")),
    ).toBeVisible();
  });
});
