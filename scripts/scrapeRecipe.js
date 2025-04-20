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
import axios from 'axios';
import { load } from 'cheerio';
import slugify from 'slugify';

async function main() {
  const [,, url, outPath] = process.argv;
  if (!url || !outPath) {
    console.error('Usage: node scrapeRecipe.js <url> <outputPath>');
    process.exit(1);
  }
  
  // 1) Fetch page (spoof a real browser so Cloudflare lets us through)
  const { data: html } = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/115.0.0.0 Safari/537.36',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;' +
        'q=0.9,image/avif,image/webp,*/*;q=0.8'
    }
  });
  const $ = load(html);

  // 2) Locate and parse the Recipe JSON‑LD block
  const allJsonLd = $('script[type="application/ld+json"]')
    .map((i, el) => {
      try { return JSON.parse($(el).html()); }
      catch (_) { return null; }
    })
    .get();
  const recipeData = allJsonLd.find(obj => obj && obj['@type'] === 'Recipe');
  if (!recipeData) {
    throw new Error('Could not find Recipe JSON‑LD on page');
  }

  // 3) Extract fields straight from the JSON‑LD
  const name        = recipeData.name || '';
  const desc        = recipeData.description || '';
  const img         = Array.isArray(recipeData.image) ? recipeData.image[0] : recipeData.image || '';
  const prep        = recipeData.prepTime    || '';
  const cook        = recipeData.cookTime    || '';
  const total       = recipeData.totalTime   || '';
  const recipeYield = recipeData.recipeYield || '';
  const ingredients = recipeData.recipeIngredient || [];
  const nutritionData = recipeData.nutrition || {};
  const sections = Array.isArray(recipeData.recipeInstructions)
    ? recipeData.recipeInstructions
        .map(sec => {
          if (sec['@type'] === 'HowToSection') {
            return {
              title: sec.name,
              steps: sec.itemListElement.map(s => s.text)
            };
          } else if (sec['@type'] === 'HowToStep') {
            return {
              title: sec.name || '',
              steps: [sec.text]
            };
          }
          return null;
        })
        .filter(Boolean)
    : [];

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
    ${Object.entries(nutrition).map(([k,v])=>`<li><strong>${k}:</strong> ${v}</li>`).join('')}
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
