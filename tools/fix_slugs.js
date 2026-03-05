/**
 * Updates MySQL grades and groups slugs using the same slugify() logic as the app.
 * Run once after import: node tools/fix_slugs.js
 */
require('dotenv').config();
const pool = require('../src/db/mysql');

function slugify(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[хХ]/g, 'h')
    .replace(/[сС]/g, 's')
    .replace(/[нН]/g, 'n')
    .replace(/[юЮ]/g, 'yu')
    .replace(/[а-яё]/gi, c => {
      const m = {
        а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'j',к:'k',
        л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',
        ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
      };
      return m[c.toLowerCase()] || c;
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function run() {
  const conn = await pool.getConnection();
  try {
    // Fix grade slugs
    const [grades] = await conn.query('SELECT id, name FROM grades');
    let fixed = 0;
    for (const g of grades) {
      const newSlug = slugify(g.name);
      if (newSlug) {
        await conn.query('UPDATE grades SET slug = ? WHERE id = ?', [newSlug, g.id]);
        fixed++;
      }
    }
    console.log(`Grades updated: ${fixed}`);

    // Fix group slugs
    const [groups] = await conn.query('SELECT id, name FROM `groups`');
    fixed = 0;
    for (const g of groups) {
      const newSlug = slugify(g.name);
      if (newSlug) {
        await conn.query('UPDATE `groups` SET slug = ? WHERE id = ?', [newSlug, g.id]);
        fixed++;
      }
    }
    console.log(`Groups updated: ${fixed}`);

    // Show sample
    const [sample] = await conn.query('SELECT name, slug FROM grades LIMIT 5');
    console.log('Sample grades:', sample.map(r => `${r.name} -> ${r.slug}`).join(', '));
    const [gSample] = await conn.query('SELECT name, slug FROM `groups`');
    console.log('All groups:', gSample.map(r => `${r.name} -> ${r.slug}`).join(', '));

  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
