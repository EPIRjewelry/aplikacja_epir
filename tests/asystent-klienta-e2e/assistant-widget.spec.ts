import { test, expect, type Page } from '@playwright/test';

/**
 * Szkielet E2E dla widgetu asystenta (Theme App Extension).
 *
 * Uruchamianie lokalne:
 *   cd extensions/asystent-klienta
 *   npx playwright install chromium
 *   npx playwright test
 *
 * Przydatne zmienne środowiskowe:
 *   EPIR_TEST_BASE_URL        – adres sklepu (domyślnie https://epirbizuteria.pl)
 *   EPIR_TEST_CUSTOMER_EMAIL  – email klienta testowego (opcjonalnie)
 *   EPIR_TEST_CUSTOMER_PASS   – hasło klienta testowego (opcjonalnie)
 *   EPIR_TEST_SHOP_PASSWORD   – jeśli sklep ma password page
 *
 * Testy zalogowane są pomijane, gdy brakuje poświadczeń — utrzymuje to szkielet
 * „zielonym” do czasu, aż zespół zdecyduje się dodać sekretne dane testowe.
 */

async function maybeUnlockShop(page: Page) {
  const shopPassword = process.env.EPIR_TEST_SHOP_PASSWORD;
  if (!shopPassword) return;
  const passwordInput = page.locator('input[name="password"]');
  if (await passwordInput.count()) {
    await passwordInput.fill(shopPassword);
    await page.locator('form[action*="password"] button[type="submit"]').click();
    await page.waitForLoadState('domcontentloaded');
  }
}

async function openAssistantPanel(page: Page) {
  const launcher = page.locator('#assistant-launcher, #assistant-launcher-embed').first();
  await expect(launcher, 'Widget asystenta powinien być osadzony na stronie').toBeVisible({
    timeout: 20_000,
  });
  const panel = page.locator('#assistant-panel, #assistant-panel-embed').first();
  const isClosed = await panel.evaluate((el) => el.classList.contains('is-closed')).catch(() => true);
  if (isClosed) {
    await launcher.click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

async function sendAssistantMessage(page: Page, message: string) {
  const input = page.locator('#assistant-input, #assistant-input-embed').first();
  await input.fill(message);
  const send = page.locator('#assistant-send-button, #assistant-send-button-embed').first();

  const chatResponsePromise = page.waitForResponse(
    (response) =>
      /\/apps\/assistant\/chat/.test(response.url()) && response.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await send.click();
  const chatResponse = await chatResponsePromise;
  expect(chatResponse.status(), 'POST /apps/assistant/chat powinien zwrócić 200').toBe(200);
}

async function expectAssistantReply(page: Page) {
  const messages = page.locator('#assistant-messages, #assistant-messages-embed').first();
  await expect
    .poll(
      async () => {
        const text = (await messages.textContent()) ?? '';
        return text.trim().length;
      },
      { timeout: 45_000, message: 'Asystent powinien dopisać odpowiedź do okna rozmowy' },
    )
    .toBeGreaterThan(10);
}

test.describe('Widget asystenta EPIR', () => {
  test('ładuje widget i odpowiada na wiadomość anonimową', async ({ page }) => {
    await page.goto('/');
    await maybeUnlockShop(page);
    await openAssistantPanel(page);
    await sendAssistantMessage(page, 'Dzień dobry, czy mogę dowiedzieć się czegoś o Pracowni EPIR?');
    await expectAssistantReply(page);
  });

  test('druga tura utrzymuje kontekst rozmowy', async ({ page }) => {
    await page.goto('/');
    await maybeUnlockShop(page);
    await openAssistantPanel(page);
    await sendAssistantMessage(page, 'Interesuje mnie srebrny pierścionek z szafirem.');
    await expectAssistantReply(page);
    await sendAssistantMessage(page, 'A jaki rozmiar polecacie dla kobiety?');
    await expectAssistantReply(page);
  });

  test('scenariusz zalogowanego klienta (pomijany bez poświadczeń)', async ({ page }) => {
    const email = process.env.EPIR_TEST_CUSTOMER_EMAIL;
    const password = process.env.EPIR_TEST_CUSTOMER_PASS;
    test.skip(!email || !password, 'Brak EPIR_TEST_CUSTOMER_EMAIL / EPIR_TEST_CUSTOMER_PASS');

    await page.goto('/account/login');
    await maybeUnlockShop(page);
    await page.locator('input[type="email"], input[name="customer[email]"]').first().fill(email!);
    await page
      .locator('input[type="password"], input[name="customer[password]"]')
      .first()
      .fill(password!);
    await page.locator('form[action*="/account/login"] button[type="submit"]').first().click();
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/');
    await openAssistantPanel(page);
    await sendAssistantMessage(page, 'Pamiętasz moje preferencje z ostatniej wizyty?');
    await expectAssistantReply(page);
  });
});