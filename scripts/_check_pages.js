'use strict';
// Quick HTTP check of local pages - verifies H1 and FAQ are present in response
require('dotenv').config();
const http = require('http');

const PORT = process.env.PORT || 3000;
const PAGES = ['/08kh18n10/', '/kh20n80-n/', '/29nk/', '/ei814-17khngt/'];

function fetchPage(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${path}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function main() {
  for (const page of PAGES) {
    try {
      const { status, body } = await fetchPage(page);
      const hasH1 = /<h1[^>]*>/.test(body);
      const hasIntro = /class="lead"/.test(body);
      const hasKeySpecs = /key-specs-section|specs-table/.test(body);
      const hasArticle = /page-article/.test(body);
      const hasFaq = /faq-section|faq-item/.test(body);
      const h1Match = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g,'').trim().slice(0,60) : '—';
      const ok = hasH1 && hasIntro && hasKeySpecs && hasArticle && hasFaq ? '✓' : '✗';
      console.log(`${ok} ${page}`);
      console.log(`   HTTP ${status} | H1: "${h1Text}"`);
      console.log(`   intro:${hasIntro?'✓':'✗'} key_specs:${hasKeySpecs?'✓':'✗'} article:${hasArticle?'✓':'✗'} faq:${hasFaq?'✓':'✗'}`);
    } catch(e) {
      console.log(`✗ ${page} — ERROR: ${e.message}`);
    }
  }
}
main();
