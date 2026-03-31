const fs          = require('fs');
const path        = require('path');
const config      = require('../config');
const lenta       = require('../services/lenta');
const { buildGradeSEO, buildGroupSEO, buildCategorySEO } = require('../helpers/seoTemplates');

const TEXT_DIR = path.join(__dirname, '../../text');

function parseArticleFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  let title = '', description = '', bodyLines = [], pastMeta = false;
  for (const line of lines) {
    if (line.includes('**Title:**')) {
      title = line.replace(/\*\*Title:\*\*/, '').trim();
      continue;
    }
    if (line.includes('**Description:**')) {
      description = line.replace(/\*\*Description:\*\*/, '').trim();
      pastMeta = true;
      continue;
    }
    if (pastMeta) bodyLines.push(line);
  }
  const body = bodyLines
    .map(l => { const t = l.trim(); if (!t) return ''; return t.startsWith('<') ? t : `<p>${t}</p>`; })
    .filter(Boolean)
    .join('\n');
  return { title, description, body };
}

// Пробует ключи по порядку; файлы названы по-кириллически, слаги — латиницей
function tryLoadArticle(keys) {
  const seen = new Set();
  for (const key of keys) {
    if (!key || typeof key !== 'string') continue;
    const k = key.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const fp = path.join(TEXT_DIR, `статья ${k}_ru_ru_moscow_.txt`);
    if (fs.existsSync(fp)) return parseArticleFile(fp);
  }
  return null;
}

// «12Х18Н10Т» → «12х18н10т», «ЭИ814 (17ХНГТ)» → «эи814-17хнгт»
function gradeArticleKeys(gradeName) {
  if (!gradeName) return [];
  const k = gradeName.toLowerCase()
    .replace(/\s*\(\s*/g, '-')
    .replace(/\)\s*/g, '')
    .trim();
  return k ? [k] : [];
}

// В некоторых файлах опечатки: «стойкие» → «стоикие»
function withFilenameTypos(s) {
  return s
    .replace(/жаростойкие/g, 'жаростоикие')
    .replace(/стойкие/g, 'стоикие');
}

// «Коррозионно-стойкие стали» → [«коррозионно-стойкие-стали», «…-лента», «…-металлическая-лента» + варианты с опечатками]
function groupArticleKeys(groupName) {
  if (!groupName) return [];
  const hyphen = groupName.toLowerCase().trim().replace(/\s+/g, '-');
  const hTypo  = withFilenameTypos(hyphen);
  const out = [];
  const push = x => { if (x && !out.includes(x)) out.push(x); };
  push(hyphen);
  push(`${hyphen}-лента`);
  push(`${hTypo}-лента`);
  push(`${hyphen}-металлическая-лента`);
  push(`${hTypo}-металлическая-лента`);
  return out;
}

const LENTA_URL  = '/';
const GRADE_BASE = '/';
const GROUP_BASE = '/';

function parseFilters(query) {
  const arr = v => (Array.isArray(v) ? v : v ? [v] : []);
  return {
    mark:      arr(query.mark),
    thickness: arr(query.thickness),
    width:     arr(query.width),
    surface:   arr(query.surface),
    state:     arr(query.state),
    standard:  arr(query.standard),
    q: typeof query.q === 'string' ? query.q : '',
  };
}

function hasFilters(f) {
  return (f.mark && f.mark.length) || f.thickness.length || f.width.length ||
    f.surface.length || f.state.length || f.standard.length || (f.q && f.q.trim());
}

function base(res, data) {
  res.render(data._template, {
    siteUrl: config.siteUrl,
    ...data,
  });
}

// ── /lenta/ ───────────────────────────────────────────────────────────────────

async function lentaIndex(req, res, next) {
  try {
    const searchQuery = req.query.q || '';
    const activeTab   = req.query.tab === 'groups' ? 'groups' : 'grades';

    let filters    = parseFilters(req.query);
    let activeGrade = null;
    let activeGroup = null;

    const gradeSlug = req.query.grade;
    const groupSlug = req.query.group;

    if (gradeSlug) {
      activeGrade = await lenta.getGradeBySlug(gradeSlug);
      if (activeGrade) filters = { ...filters, mark: [activeGrade.name] };
    } else if (groupSlug) {
      activeGroup = await lenta.getGroupBySlug(groupSlug);
      if (activeGroup) {
        const gnames = (await lenta.getGradesByGroup(activeGroup.id)).map(g => g.name);
        if (gnames.length) filters = { ...filters, mark: gnames };
      }
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [groups, allGrades, { products, total, perPage, totalPages }] = await Promise.all([
      lenta.getAllGroups(),
      lenta.getAllGrades(),
      lenta.getLentaProducts(filters, page),
    ]);

    const grades = searchQuery ? await lenta.searchGrades(searchQuery) : allGrades;

    let filterValues;
    if (activeGrade)      filterValues = await lenta.getFilterValuesByGrade(activeGrade.name);
    else if (activeGroup) filterValues = await lenta.getFilterValuesByGroup(activeGroup.id);
    else                  filterValues = await lenta.getLentaFilterValues();

    const q = { ...req.query };
    delete q.page;

    // ?tab= pages: noindex + canonical on clean /catalog/lenta/
    const hasTab    = req.query.tab === 'grades' || req.query.tab === 'groups';
    const categorySeo = buildCategorySEO(config.siteName);
    base(res, {
      _template: 'catalog/lenta/index.html',
      title:           categorySeo.title,
      h1:              categorySeo.h1,
      metaDescription: categorySeo.metaDescription,
      canonical:       config.siteUrl + LENTA_URL,
      robots:          hasTab ? 'noindex,follow' : undefined,
      breadcrumbs: [],
      groups, grades, allGrades, searchQuery, activeTab,
      products, total, page, totalPages, perPage,
      filters, filterValues,
      queryString:     new URLSearchParams(q).toString(),
      hasActiveFilters: hasFilters(filters),
      activeGrade, activeGroup,
      categoryDescription: 'Нержавеющая и конструкционная лента по ГОСТ. Выберите марку или назначение ниже.',
    });
  } catch (err) { next(err); }
}

// ── /lenta/marka/:slug/ ───────────────────────────────────────────────────────

async function gradePage(req, res, next) {
  try {
    // #region agent log
    let grade;
    try {
      grade = await lenta.getGradeBySlug(req.params.slug);
      const _dbgA = {location:'lentaController.js:gradePage',message:'getGradeBySlug OK',data:{slug:req.params.slug,found:!!grade},hypothesisId:'A-B-C',timestamp:Date.now()};
      console.log('[DEBUG]', JSON.stringify(_dbgA));
      fetch('http://127.0.0.1:7246/ingest/e30f7c28-399b-4c8e-aebe-534d8a1619d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_dbgA)}).catch(()=>{});
    } catch (dbErr) {
      const _dbgB = {location:'lentaController.js:gradePage',message:'getGradeBySlug THREW',data:{slug:req.params.slug,error:dbErr.message,code:dbErr.code},hypothesisId:'A-B-C',timestamp:Date.now()};
      console.error('[DEBUG]', JSON.stringify(_dbgB));
      fetch('http://127.0.0.1:7246/ingest/e30f7c28-399b-4c8e-aebe-534d8a1619d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_dbgB)}).catch(()=>{});
      return next(dbErr);
    }
    // #endregion
    if (!grade) return next();

    const filters      = parseFilters(req.query);
    const page         = Math.max(1, parseInt(req.query.page, 10) || 1);
    const result       = await lenta.getProductsByGrade(grade.name, filters, page);
    const filterValues = await lenta.getFilterValuesByGrade(grade.name);
    const withFilters  = hasFilters(filters);
    const q = { ...req.query }; delete q.page;
    const gradeSeo = buildGradeSEO(grade, config.siteName);
    const pageUrl  = GRADE_BASE + req.params.slug + '/';
    base(res, {
      _template: 'catalog/lenta/grade.html',
      title:           gradeSeo.title,
      h1:              gradeSeo.h1,
      metaDescription: gradeSeo.metaDescription,
      canonical:       config.siteUrl + pageUrl,
      robots: withFilters ? 'noindex,follow' : undefined,
      breadcrumbs: [
        { name: grade.name, url: pageUrl },
      ],
      grade,
      products:   result.products,
      total:      result.total,
      page:       result.page,
      totalPages: result.totalPages,
      filters, filterValues,
      queryString:     new URLSearchParams(q).toString(),
      hasActiveFilters: withFilters,
    });
  } catch (err) { next(err); }
}

// ── /lenta/naznachenie/:slug/ ─────────────────────────────────────────────────

async function groupPage(req, res, next) {
  try {
    // #region agent log
    let group;
    try {
      group = await lenta.getGroupBySlug(req.params.slug);
      const _dbgC = {location:'lentaController.js:groupPage',message:'getGroupBySlug OK',data:{slug:req.params.slug,found:!!group,groupId:group&&group.id},hypothesisId:'A-C',timestamp:Date.now()};
      console.log('[DEBUG]', JSON.stringify(_dbgC));
      fetch('http://127.0.0.1:7246/ingest/e30f7c28-399b-4c8e-aebe-534d8a1619d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_dbgC)}).catch(()=>{});
    } catch (dbErr) {
      const _dbgD = {location:'lentaController.js:groupPage',message:'getGroupBySlug THREW',data:{slug:req.params.slug,error:dbErr.message,code:dbErr.code},hypothesisId:'A-C',timestamp:Date.now()};
      console.error('[DEBUG]', JSON.stringify(_dbgD));
      fetch('http://127.0.0.1:7246/ingest/e30f7c28-399b-4c8e-aebe-534d8a1619d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_dbgD)}).catch(()=>{});
      return next(dbErr);
    }
    // #endregion
    if (!group) return next();

    const filters      = parseFilters(req.query);
    const page         = Math.max(1, parseInt(req.query.page, 10) || 1);
    // #region agent log
    let result, filterValues, gradesInGroup;
    try {
      [result, filterValues, gradesInGroup] = await Promise.all([
        lenta.getProductsByGroup(group.id, filters, page),
        lenta.getFilterValuesByGroup(group.id),
        lenta.getGradesByGroup(group.id),
      ]);
      const _dbgE = {location:'lentaController.js:groupPage',message:'group queries OK',data:{groupId:group.id,total:result&&result.total},hypothesisId:'B-D',timestamp:Date.now()};
      console.log('[DEBUG]', JSON.stringify(_dbgE));
      fetch('http://127.0.0.1:7246/ingest/e30f7c28-399b-4c8e-aebe-534d8a1619d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_dbgE)}).catch(()=>{});
    } catch (dbErr) {
      const _dbgF = {location:'lentaController.js:groupPage',message:'group queries THREW',data:{groupId:group.id,error:dbErr.message,code:dbErr.code},hypothesisId:'B-D',timestamp:Date.now()};
      console.error('[DEBUG]', JSON.stringify(_dbgF));
      fetch('http://127.0.0.1:7246/ingest/e30f7c28-399b-4c8e-aebe-534d8a1619d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_dbgF)}).catch(()=>{});
      return next(dbErr);
    }
    // #endregion
    const withFilters = hasFilters(filters);
    const q = { ...req.query }; delete q.page;
    const groupSeo  = buildGroupSEO(group, config.siteName);
    const pageUrl   = GROUP_BASE + req.params.slug + '/';
    base(res, {
      _template: 'catalog/lenta/group.html',
      title:           groupSeo.title,
      h1:              groupSeo.h1,
      metaDescription: groupSeo.metaDescription,
      canonical:       config.siteUrl + pageUrl,
      robots: withFilters ? 'noindex,follow' : undefined,
      breadcrumbs: [
        { name: group.name, url: pageUrl },
      ],
      group, gradesInGroup, topGrades: gradesInGroup.slice(0, 8),
      products:   result.products,
      total:      result.total,
      page:       result.page,
      totalPages: result.totalPages,
      filters, filterValues,
      queryString:     new URLSearchParams(q).toString(),
      hasActiveFilters: withFilters,
    });
  } catch (err) { next(err); }
}

module.exports = { lentaIndex, gradePage, groupPage, parseFilters, hasFilters };
