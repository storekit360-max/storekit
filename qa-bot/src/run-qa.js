const { spawnSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const dotenv = require('dotenv');
const { analyzeWithOpenRouter } = require('./ai-analyzer');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');

async function main() {
  await fs.emptyDir(REPORT_DIR);

  console.log('======================================');
  console.log('StoreKit Local QA Bot');
  console.log('======================================');
  console.log(`Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`Backend : ${process.env.BACKEND_URL || 'http://localhost:5001'}`);
  console.log('Running browser + API QA checks...');

  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'test'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env }
  });

  const summary = await buildMarkdownSummary(result.status || 0);
  await fs.writeFile(path.join(REPORT_DIR, 'QA_SUMMARY.md'), summary);

  if (process.env.OPENROUTER_API_KEY) {
    console.log('\nGenerating AI QA report with OpenRouter...');
    try {
      await analyzeWithOpenRouter();
      console.log('AI report: qa-bot/reports/AI_QA_REPORT.md');
    } catch (error) {
      console.error(`AI analysis skipped: ${error.message}`);
    }
  } else {
    console.log('\nOpenRouter key not set. Skipped AI analysis. Add OPENROUTER_API_KEY to qa-bot/.env to enable it.');
  }

  console.log('\nReports created:');
  console.log('- qa-bot/reports/QA_SUMMARY.md');
  console.log('- qa-bot/reports/playwright-html/index.html');
  console.log('- qa-bot/reports/playwright-results.json');

  process.exit(result.status || 0);
}

async function buildMarkdownSummary(exitCode) {
  const resultPath = path.join(REPORT_DIR, 'playwright-results.json');
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

  if (await fs.pathExists(resultPath)) {
    const raw = await fs.readJson(resultPath);
    const rows = collect(raw.suites || []);
    for (const row of rows) {
      if (row.status === 'passed') passed += 1;
      else if (row.status === 'skipped') skipped += 1;
      else {
        failed += 1;
        failures.push(row);
      }
    }
  }

  return `# StoreKit QA Summary\n\nStatus: ${exitCode === 0 ? 'PASS' : 'FAIL'}\n\n## Totals\n\n- Passed: ${passed}\n- Failed: ${failed}\n- Skipped: ${skipped}\n\n## Failed tests\n\n${failures.length ? failures.map((f) => `- **${f.title}**: ${f.error || 'failed'}`).join('\n') : 'No failed tests.'}\n\n## Next steps\n\n1. Open \`qa-bot/reports/playwright-html/index.html\` for screenshots, traces, and videos.\n2. Check runtime JSON files for API 4xx/5xx, console errors, and failed network requests.\n3. Fix the highest severity defects and rerun \`npm run qa\`.\n`;
}

function collect(suites, prefix = '') {
  const rows = [];
  for (const suite of suites) {
    const suiteTitle = [prefix, suite.title].filter(Boolean).join(' > ');
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const latest = test.results?.[test.results.length - 1];
        rows.push({
          title: [suiteTitle, spec.title].filter(Boolean).join(' > '),
          status: latest?.status || 'unknown',
          error: latest?.errors?.[0]?.message || ''
        });
      }
    }
    rows.push(...collect(suite.suites || [], suiteTitle));
  }
  return rows;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
