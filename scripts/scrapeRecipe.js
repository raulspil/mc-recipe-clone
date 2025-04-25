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
import { load } from 'cheerio';
import puppeteer from 'puppeteer';

async function main() {
  const [,, url, outPath] = process.argv;
  if (!url || !outPath) {
    console.error('Usage: node scrapeRecipe.js <url> <outputPath>');
    process.exit(1);
  }

  // 1) Launch browser and load page
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // 2) Extract instructions & serving size
  const { instructionsHtml, servingSizeDom } = await page.evaluate(() => {
    // Instructions: header + siblings until next h2
    const header = Array.from(document.querySelectorAll('h2'))
      .find(h => h.textContent.trim().toLowerCase() === 'cooking instructions');
    let instrHtml = '';
    if (header) {
      instrHtml += header.outerHTML;
      let sib = header.nextElementSibling;
      while (sib && sib.tagName.toLowerCase() !== 'h2') {
        instrHtml += sib.outerHTML;
        sib = sib.nextElementSibling;
      }
      instrHtml = `<div>${instrHtml}</div>`;
    }
    // Serving size: checked radio's label
    let size = '';
    const checked = document.querySelector('input[type="radio"]:checked');
    if (checked && checked.parentElement) {
      const lbl = checked.parentElement.querySelector('[data-testid$="-label"]');
      if (lbl) size = lbl.textContent.trim();
    }
    return { instructionsHtml: instrHtml, servingSizeDom: size };
  });

  // 3) Get full HTML for parsing
  const fullHtml = await page.content();
  await browser.close();

  // 4) Load into Cheerio and parse JSON-LD
  const $ = load(fullHtml);
  const allJsonLd = $('script[type="application/ld+json"]').map((i, el) => {
    try { return JSON.parse($(el).html()); } catch { return null; }
  }).get();
  const recipeData = allJsonLd.find(o => o && o['@type'] === 'Recipe') || {};

  // 5) Core fields
  const name        = recipeData.name        || $('h1').first().text().trim();
  const description = recipeData.description || $('p').first().text().trim();
  const image       = Array.isArray(recipeData.image)
                        ? recipeData.image[0]
                        : recipeData.image || $('img[alt]').first().attr('src') || '';
  const prepTime    = recipeData.prepTime    || '';
  const cookTime    = recipeData.cookTime    || '';
  const totalTime   = recipeData.totalTime   || '';
  const ingredients = recipeData.recipeIngredient
                        || $('section.ingredients ul li').toArray().map(li => $(li).text().trim());

  // 6) Serving size
  let recipeYield = recipeData.recipeYield || servingSizeDom || '';

  // 7) Nutrition extraction: JSON-LD or DOM fallback using data-testid
  const nutritionLd = recipeData.nutrition || {};
  const nutrition = {
    calories:            nutritionLd.calories            || '',
    proteinContent:      nutritionLd.proteinContent      || '',
    carbohydrateContent: nutritionLd.carbohydrateContent || '',
    fatContent:          nutritionLd.fatContent          || ''
  };
  // DOM fallback if JSON-LD empty
  if (!nutrition.calories) {
    $('span[data-testid="recipe-details-info-name"]').each((_, el) => {
      const label = $(el).text().replace(':','').trim().toLowerCase();
      const value = $(el).next('span[data-testid="recipe-details-info-value"]').text().trim();
      if (label === 'calories') nutrition.calories = value;
      else if (label === 'protein') nutrition.proteinContent = value;
      else if (label === 'carbs') nutrition.carbohydrateContent = value;
      else if (label === 'fat') nutrition.fatContent = value;
    });
  }

  // 8) Build structured JSON-LD for output
  const outputJsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    description,
    image,
    prepTime,
    cookTime,
    totalTime,
    recipeYield,
    recipeIngredient: ingredients,
    nutrition: { "@type": "NutritionInformation", ...nutrition },
    recipeInstructions: recipeData.recipeInstructions || []
  };

  // 9) Render final HTML
  const htmlOut = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${name}</title>
  <script type="application/ld+json">
${JSON.stringify(outputJsonLd, null, 2)}
  </script>
  <style>
    body{font-family:sans-serif;padding:1rem}
    img{max-width:100%}
    h1{margin-top:0}
  </style>
</head>
<body>
  <h1>${name}</h1>
  <p>${description}</p>
  <img src="${image}" alt="${name}">
  <h2>Ingredients</h2>
  <ul>
    ${ingredients.map(i => `<li>${i}</li>`).join('\n    ')}
  </ul>
  <h2>Serving Size</h2>
  <p>${recipeYield}</p>
  <h2>Prep Time</h2>
  <p>${prepTime}</p>
  <h2>Cook Time</h2>
  <p>${cookTime}</p>
  <!-- Cooking Instructions -->
  ${instructionsHtml}
  <h2>Nutrition (per serving)</h2>
  <ul>
    ${Object.entries(nutrition).map(([k,v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')}  
  </ul>
</body>
</html>`;

  fs.writeFileSync(outPath, htmlOut, 'utf-8');
  console.log(`✅ Written → ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
