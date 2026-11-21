const { XMLParser, XMLValidator } = require('fast-xml-parser');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const args = process.argv.slice(2);
const usage = `Usage: node archive-rexondex-sitemap.cjs [--dry-run] [--sitemap URL] [--delay SECONDS] [--report FILE]
Environment: IA_ACCESS_KEY and IA_SECRET_KEY (required except for --dry-run).`;
function options() {
  const result = { sitemap: 'https://rexondex.github.io/sitemap', delay: 25, report: path.join(__dirname, 'reports', 'rexondex-github-io-wayback-report.json'), dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') { console.log(usage); process.exit(0); }
    if (arg === '--dry-run') { result.dryRun = true; continue; }
    if (!['--sitemap', '--delay', '--report'].includes(arg) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Invalid option: ${arg}\n${usage}`);
    result[arg.slice(2)] = args[++i];
  }
  result.delay = Number(result.delay);
  if (!Number.isFinite(result.delay) || result.delay < 0) throw Error('Delay must be a nonnegative number.');
  return result;
}
function httpUrl(value) {
  const u = new URL(value);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error(`Invalid HTTP URL: ${value}`);
  u.hash = '';
  return u.href;
}
async function request(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
  const body = await res.text();
  if (!res.ok) throw Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return body;
}
const list = x => x == null ? [] : Array.isArray(x) ? x : [x];
async function getPages(start) {
  const seen = new Set(), pages = new Set(), parser = new XMLParser({ ignoreAttributes: false });
  async function visit(url) {
    url = httpUrl(url);
    if (seen.has(url)) return;
    seen.add(url);
    const xml = await request(url);
    const valid = XMLValidator.validate(xml);
    if (valid !== true) throw Error(`Invalid XML at ${url}: ${valid.err.msg}`);
    const data = parser.parse(xml);
    if (data.urlset) {
      for (const item of list(data.urlset.url)) {
        if (typeof item.loc !== 'string') throw Error(`Missing page loc in ${url}`);
        pages.add(httpUrl(item.loc.trim()));
      }
    } else if (data.sitemapindex) {
      for (const item of list(data.sitemapindex.sitemap)) {
        if (typeof item.loc !== 'string') throw Error(`Missing sitemap loc in ${url}`);
        await visit(item.loc.trim());
      }
    } else throw Error(`Not a sitemap: ${url}`);
  }
  await visit(start);
  if (!pages.size) throw Error('No page URLs found in sitemap.');
  return [...pages];
}
async function main() {
  const opt = options(), access = process.env.IA_ACCESS_KEY, secret = process.env.IA_SECRET_KEY;
  if (!opt.dryRun && (!access || !secret)) throw Error('Set both IA_ACCESS_KEY and IA_SECRET_KEY. Use --dry-run to list URLs without credentials.');
  const pages = await getPages(opt.sitemap);
  console.log(`Found ${pages.length} unique page URLs.`);
  if (opt.dryRun) { pages.forEach(url => console.log(url)); return; }
  const headers = { Accept: 'application/json', Authorization: `LOW ${access}:${secret}` };
  const report = { sitemap: opt.sitemap, startedAt: new Date().toISOString(), results: [] };
  const saveReport = () => { fs.mkdirSync(path.dirname(path.resolve(opt.report)), { recursive: true }); fs.writeFileSync(opt.report, JSON.stringify(report, null, 2) + '\n'); };
  let lastSubmit = 0;
  for (const [index, url] of pages.entries()) {
    const wait = opt.delay * 1000 - (Date.now() - lastSubmit);
    if (wait > 0) await sleep(wait);
    const result = { url, status: 'error' };
    report.results.push(result);
    try {
      console.log(`[${index + 1}/${pages.length}] ${url}`);
      lastSubmit = Date.now();
      const submitted = JSON.parse(await request('https://web.archive.org/save', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ url }) }));
      if (!submitted.job_id) throw Error(`No job_id returned: ${JSON.stringify(submitted).slice(0, 300)}`);
      result.jobId = submitted.job_id;
      result.status = 'pending';
      saveReport();
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await sleep(5000);
        const status = JSON.parse(await request(`https://web.archive.org/save/status/${encodeURIComponent(result.jobId)}`, { headers }));
        if (status.status === 'success') {
          result.status = 'success';
          if (status.timestamp) result.captureUrl = `https://web.archive.org/web/${status.timestamp}/${url}`;
          break;
        }
        if (status.status === 'error') throw Error(status.status_ext || status.exception || JSON.stringify(status));
      }
      if (result.status === 'pending') result.message = 'Polling timed out; check this job ID later.';
    } catch (error) { result.status = result.jobId ? 'unknown' : 'error'; result.message = error.message; }
    saveReport();
    console.log(`  ${result.status}${result.message ? ': ' + result.message : ''}`);
  }
  report.finishedAt = new Date().toISOString();
  saveReport();
  const failed = report.results.filter(x => x.status !== 'success').length;
  console.log(`Finished: ${pages.length - failed} successful, ${failed} unconfirmed or failed. Report: ${opt.report}`);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });

