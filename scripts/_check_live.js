'use strict';
const https = require('https');

const PAGES = ['/08kh18n10/', '/kh20n80-n/', '/29nk/', '/ei814-17khngt/'];
const HOST = 'lenta-stalnaja.ru';

function fetchPage(path) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host: HOST, path, headers: { 'User-Agent': 'Node.js/check' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  for (const path of PAGES) {
    try {
      const { status, headers, body } = await fetchPage(path);
      // Redirect?
      if (status >= 300 && status < 400) {
        console.log(`→ ${path}: ${status} redirect → ${headers.location}`);
        continue;
      }
      const h1Match = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g,'').trim().slice(0,80) : '—';
      const hasIntro  = /class="lead"/.test(body);
      const hasSpecs  = /key-specs-section|specs-table/.test(body);
      const hasArticle = /page-article/.test(body);
      const hasFaq    = /faq-section|faq-item/.test(body);
      const all = hasIntro && hasSpecs && hasArticle && hasFaq;
      console.log(`${all?'✓':'✗'} [${status}] ${path}`);
      console.log(`   H1: "${h1}"`);
      console.log(`   intro:${hasIntro?'✓':'✗'}  key_specs:${hasSpecs?'✓':'✗'}  article:${hasArticle?'✓':'✗'}  faq:${hasFaq?'✓':'✗'}`);
    } catch(e) {
      console.log(`✗ ${path} — ${e.message}`);
    }
  }
}
main();
