/**
 * Usage:
 *   node scripts/scrapeRecipe.js <recipeUrl> <outputPath>
 *
 * e.g.
 *   node scripts/scrapeRecipe.js \
 *     https://www.mindfulchef.com/healthy-recipes/sweet-sour-salmon-traybake \
 *     docs/salmon2.html
 */
import fs from 'fs';
//import axios from 'axios';
import { load } from 'cheerio';
//import slugify from 'slugify';
import cloudscraper from 'cloudscraper';

async function main() {
  const [,, url, outPath] = process.argv;
  if (!url || !outPath) {
    console.error('Usage: node scrapeRecipe.js <url> <outputPath>');
    process.exit(1);
  }
  
  // 1) Fetch with Cloudflare‐scraper so we get the real HTML (including JSON‑LD)
   const html = await cloudscraper({
     method: 'GET',
     uri: url,
     headers: {
       'User-Agent':
         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
         'AppleWebKit/537.36 (KHTML, like Gecko) ' +
         'Chrome/115.0.0.0 Safari/537.36',
       'Accept':
         'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
     }
   });
   // now load the raw HTML string into Cheerio
   const $ = load(html);

   // 2) Try JSON‑LD first—if missing, fall back to manual DOM scraping
  const allJsonLd = $('script[type="application/ld+json"]')
    .map((i, el) => {
      try { return JSON.parse($(el).html()); }
      catch (_) { return null; }
    })
    .get();
  const recipeData = allJsonLd.find(o => o && o['@type'] === 'Recipe');

  // hybrid extraction
  let name, desc, img, prep, cook, total, recipeYield, ingredients, nutritionData, sections;
  if (recipeData && recipeData.name) {
    // JSON‑LD extraction
    name        = recipeData.name || '';
    desc        = recipeData.description || '';
    img         = Array.isArray(recipeData.image) ? recipeData.image[0] : recipeData.image || '';
    prep        = recipeData.prepTime    || '';
    cook        = recipeData.cookTime    || '';
    total       = recipeData.totalTime   || '';
    recipeYield = recipeData.recipeYield || '';
    ingredients = recipeData.recipeIngredient || [];
    nutritionData = recipeData.nutrition || {};
    sections = Array.isArray(recipeData.recipeInstructions)
      ? recipeData.recipeInstructions.map(sec => {
          if (sec['@type'] === 'HowToSection') {
            return { title: sec.name, steps: sec.itemListElement.map(s => s.text) };
          }
          return { title: sec.name || '', steps: [sec.text] };
        })
      : [];
  } else {
    // manual DOM scraping fallback (same as Salmon page)
    name = $('h1.css-s3pb72').first().text().trim();
    desc = $('div.css-1c4tiag').first().text().trim();
    img  = $('img[alt]').first().attr('src') || '';
    // times & servings
    const labels = $('span.css-135ql6c').toArray().map(el => $(el).text().trim());
    const vals   = $('a.css-8h2e5c, span.css-d9hq7u').toArray().map(el => $(el).text().trim());
    const info   = Object.fromEntries(labels.map((l,i) => [l.replace(':',''), vals[i]]));
    prep  = info.Prep    ? `PT${info.Prep.match(/\d+/)[0]}M` : '';
    cook  = info.Cook    ? `PT${info.Cook.match(/\d+/)[0]}M` : '';
    total = info.Total   ? `PT${info.Total.match(/\d+/)[0]}M` : '';
    recipeYield = info.Serves;
    ingredients = $('section.ingredients ul li').toArray().map(li => $(li).text().trim());
    sections = [];
    $('section.instructions .instruction-section').each((_, sec) => {
      const title = $(sec).find('h3').text().trim();
      const steps = $(sec).find('.content p').toArray().map(p => $(p).text().trim());
      sections.push({ title, steps });
    });
    nutritionData = {};
    $('table.nutrition tr').each((_, tr) => {
      const [th, td] = $(tr).find('th,td').toArray();
      nutritionData[$(th).text().trim()] = $(td).text().trim();
    });
  }

// ── SNIPPET 2: Replace old JSON‑LD builder (Step 3) with clean re‑emit ──

  // 3) Build JSON‑LD (re‑emit a clean version)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    description: desc,
    image: img,
    prepTime: prep,
    cookTime: cook,
    totalTime: total,
    recipeYield,
    recipeIngredient: ingredients,
    nutrition: {
      "@type": "NutritionInformation",
      calories:            nutritionData.calories            || '',
      proteinContent:      nutritionData.proteinContent      || '',
      carbohydrateContent: nutritionData.carbohydrateContent || '',
      fatContent:          nutritionData.fatContent          || ''
    },
    recipeInstructions: sections.map(sec => ({
      "@type": sec.steps.length > 1 ? "HowToSection" : "HowToStep",
      name: sec.title,
      ...(sec.steps.length > 1
        ? { itemListElement: sec.steps.map(s => ({ "@type": "HowToStep", text: s })) }
        : { text: sec.steps[0] })
    }))
  };

  // 4) Build full HTML
  const htmlOut = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name}</title>
  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>
  <style>
    /* your existing CSS from before… */
    body{font-family:sans-serif;padding:1rem}
    img{max-width:100%}
    h1{margin-top:0}
    /* …etc… */
  </style>
</head>
<body>
  <h1>${name}</h1>
  <p>${desc}</p>
  <img src="${img}" alt="${name}">
  <h2>Ingredients</h2>
  <ul>
    ${ingredients.map(i=>`<li>${i}</li>`).join('\n    ')}
  </ul>

  <h2>Instructions</h2>
  ${sections.map(sec=>`
  <h3>${sec.title}</h3>
  ${sec.steps.map(s=>`<p>${s}</p>`).join('')}
  `).join('')}

  <h2>Nutrition (per serving)</h2>
  <ul>
    ${Object.entries(nutritionData).map(([k,v])=>`<li><strong>${k}:</strong> ${v}</li>`).join('')}
  </ul>
</body>
</html>`;

  fs.writeFileSync(outPath, htmlOut, 'utf-8');
  console.log(`✅ Written → ${outPath}`);
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
