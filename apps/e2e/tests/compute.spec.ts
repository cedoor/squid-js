import { test, expect } from "@playwright/test";

// Keygen runs in a wasm worker; duration depends on the chosen `paramsSet`
// (demo default `test`). Allow extra time for cold CI / slow runners.
const KEYGEN_TIMEOUT_MS = 30_000;
const COMPUTE_TIMEOUT_MS = 15_000;

test.setTimeout(KEYGEN_TIMEOUT_MS + COMPUTE_TIMEOUT_MS + 10_000);

test("browser keygen → server FHE add → browser decrypt", async ({ page }) => {
  page.on("pageerror", (err) => console.log(`[e2e] pageerror: ${err.message}`));
  page.on("requestfailed", (req) =>
    console.log(
      `[e2e] requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`,
    ),
  );

  await page.goto("/");

  const button = page.locator("button");
  await expect(button).toHaveText("Compute a + b on server", { timeout: KEYGEN_TIMEOUT_MS });

  await button.click();

  // Defaults in App.tsx are a=17, b=25, so the decrypted sum must be 42.
  await expect(page.locator(".result")).toHaveText("42", { timeout: COMPUTE_TIMEOUT_MS });
});
