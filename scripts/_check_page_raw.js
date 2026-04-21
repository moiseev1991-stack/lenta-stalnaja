'use strict';
const http = require('http');

function fetchPage(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function main() {
  const { status, body } = await fetchPage('/08kh18n10/');
  console.log('HTTP status:', status);
  // Find title
  const titleMatch = body.match(/<title>([\s\S]*?)<\/title>/);
  console.log('Title:', titleMatch ? titleMatch[1].slice(0,100) : '—');
  // Find H1
  const h1Match = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  console.log('H1:', h1Match ? h1Match[1].replace(/<[^>]+>/g,'').trim().slice(0,100) : '—');
  // Check for grade intro
  const hasIntro = body.includes('class="lead"');
  const hasKeySpecs = body.includes('key-specs-section');
  const hasArticle = body.includes('page-article');
  const hasFaq = body.includes('faq-section');
  console.log(`intro:${hasIntro} key_specs:${hasKeySpecs} article:${hasArticle} faq:${hasFaq}`);
  // Print first 500 chars of body for debug
  console.log('\n--- body start ---');
  console.log(body.slice(0, 800).replace(/\s+/g,' '));
}
main().catch(e => console.error(e.message));
