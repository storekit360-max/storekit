# StoreKit Local QA Bot

Runnable QA engineer bot for your local React + Node + MongoDB + Cloudinary project.

## What it checks

- Customer pages: home, shop, cart, login, register, forgot password, gift cards
- Admin login and admin pages
- Super admin login and dashboard
- Backend public API smoke checks
- Login API checks
- Browser console errors
- React runtime crashes
- Failed network requests
- API 5xx responses
- Optional AI bug report using OpenRouter

## Install

From project root:

```bash
cd qa-bot
cp .env.example .env
npm install
npm run install:browsers
```

Edit `qa-bot/.env` and add your OpenRouter key if you want AI analysis:

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=openai/gpt-4o-mini
```

## Before running QA

Terminal 1:

```bash
cd backend
npm install
npm run seed
npm run dev
```

Terminal 2:

```bash
cd frontend
npm install
npm start
```

Confirm:

- React: http://localhost:3000
- Backend: http://localhost:5001

## Run QA bot

Terminal 3:

```bash
cd qa-bot
npm run qa
```

Run visible browser mode:

```bash
npm run qa:headed
```

Open visual Playwright report:

```bash
npm run qa:report
```

## Reports

After each run:

- `qa-bot/reports/QA_SUMMARY.md`
- `qa-bot/reports/AI_QA_REPORT.md` when OpenRouter key is set
- `qa-bot/reports/playwright-html/index.html`
- `qa-bot/reports/playwright-results.json`
- `qa-bot/reports/*-runtime.json`

## Seeded credentials used by bot

Store admin:

```txt
admin@storekit.local
Admin@123456
```

Super admin:

```txt
superadmin@storekit.local
SuperAdmin@123456
```

## Add more flows

Create new files inside `qa-bot/tests/`, for example:

```js
const { test, expect } = require('@playwright/test');

test('checkout smoke test', async ({ page }) => {
  await page.goto('/shop');
  // add product click/fill steps here
});
```
