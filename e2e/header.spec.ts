import { expect, test } from "@playwright/test";

/**
 * The header, signed out. Needs no database: the charts page renders its
 * empty state when it can't count anything.
 */

test.describe("header on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("offers Log in and Join, and only the public places", async ({ page }) => {
    await page.goto("/charts");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Join" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Your account" })).toHaveCount(0);

    const nav = header.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link")).toHaveText(["Home", "Discover", "Charts", "Versus", "Lists"]);
  });

  test("Join and Log in come back to this page", async ({ page }) => {
    await page.goto("/charts");
    await expect(page.locator("header").getByRole("link", { name: "Join" })).toHaveAttribute(
      "href",
      /next=%2Fcharts/,
    );
  });

  test('"/" and Ctrl+K jump to search', async ({ page }) => {
    await page.goto("/charts");
    const box = page.getByRole("combobox", { name: "Search artists, albums and songs" });

    await page.locator("body").press("/");
    await expect(box).toBeFocused();

    await box.blur();
    await page.locator("body").press("Control+k");
    await expect(box).toBeFocused();
  });

  test("the search page has no second box in the header", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator("header").getByRole("combobox")).toHaveCount(0);
  });
});

test.describe("header on a phone", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("search opens a sheet, and Escape hands focus back", async ({ page }) => {
    await page.goto("/charts");
    const icon = page.locator("header").getByRole("button", { name: "Search" });
    await icon.click();

    const sheet = page.getByRole("dialog", { name: "Search" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("combobox")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(icon).toBeFocused();
  });

  test("Log in is in the tab bar and Join in the header", async ({ page }) => {
    await page.goto("/charts");
    await expect(page.locator("nav.fixed").getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(page.locator("header").getByRole("link", { name: "Join" })).toBeVisible();
  });
});
