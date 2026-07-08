const fs = require('fs-extra');
const path = require('path');

const REPORT_DIR = path.resolve(__dirname, '..', 'reports');

async function analyzeWithOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const resultPath = path.join(REPORT_DIR, 'playwright-results.json');
  if (!(await fs.pathExists(resultPath))) return null;

  const raw = await fs.readJson(resultPath);
  const compact = compactPlaywrightResults(raw);
  const runtimeFiles = (await fs.readdir(REPORT_DIR)).filter((f) => f.endsWith('-runtime.json'));
  const runtime = [];
  for (const file of runtimeFiles) {
    runtime.push(await fs.readJson(path.join(REPORT_DIR, file)));
  }

  const prompt = `You are a senior QA engineer for a React + Node + MongoDB + Cloudinary ecommerce SaaS project. Analyze the Playwright QA results and runtime console/network issues. Return a concise issue report with: severity, affected area, exact symptom, probable root cause, and recommended fix. Prioritize real defects over noise.\n\nPlaywright summary:\n${JSON.stringify(compact, null, 2)}\n\nRuntime observations:\n${JSON.stringify(runtime, null, 2).slice(0, 50000)}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost',
      'X-Title': 'StoreKit Local QA Bot'
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You produce practical QA bug reports for developers. No filler.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const report = data.choices?.[0]?.message?.content || 'No AI report returned.';
  await fs.writeFile(path.join(REPORT_DIR, 'AI_QA_REPORT.md'), report);
  return report;
}

function compactPlaywrightResults(raw) {
  const suites = [];
  for (const suite of raw.suites || []) {
    suites.push(...walkSuite(suite));
  }
  return suites;
}

function walkSuite(suite, parentTitle = '') {
  const title = [parentTitle, suite.title].filter(Boolean).join(' > ');
  const rows = [];
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      for (const result of test.results || []) {
        rows.push({
          suite: title,
          test: spec.title,
          status: result.status,
          durationMs: result.duration,
          errors: (result.errors || []).map((e) => e.message || e.stack || String(e)).slice(0, 3)
        });
      }
    }
  }
  for (const child of suite.suites || []) rows.push(...walkSuite(child, title));
  return rows;
}

module.exports = { analyzeWithOpenRouter };
