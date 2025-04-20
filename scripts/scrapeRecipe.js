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

  // 1) Fetch page
  const { data: html } = await axios.get(url);
  const $ = load(html);

  // 2) Extract fields (selectors based on MindfulChef markup)
  const name = $('h1.css-s3pb72').first().text().trim();
  const desc = $('div.css-1c4tiag').first().text().trim();
  const img = $('img[alt*="Salmon Traybake"]').attr('src') ||
              $('img[alt]').first().attr('src');
  // times & servings
  const infoLabels = $('span.css-135ql6c').toArray().map(el => $(el).text().trim());
  const infoValues = $('a.css-8h2e5c, span.css-d9hq7u').toArray().map(el => $(el).text().trim());
  const info = Object.fromEntries(infoLabels.map((lbl,i) => [lbl.replace(':',''), infoValues[i]]));
  // Ingredients
  const ingredients = $('section.ingredients ul li').toArray().map(li => $(li).text().trim());
  // Instructions
  const sections = [];
  $('section.instructions .instruction-section').each((_, sec) => {
    const title = $(sec).find('h3').text().trim();
    const steps = $(sec).find('.content p').toArray().map(p => $(p).text().trim());
    sections.push({ title, steps });
  });
  // Nutrition
  const nutrition = {};
  $('table.nutrition tr').each((_, tr) => {
    const [th, td] = $(tr).find('th,td').toArray();
    nutrition[$(th).text().trim()] = $(td).text().trim();
  });

  // 3) Build JSON‑LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    description: desc,
    image: img,
    prepTime: `PT${info['Prep'].match(/\d+/)[0]}M`,
    cookTime: `PT${info['Cook'].match(/\d+/)[0]}M`,
    totalTime: `PT${info['Total'].match(/\d+/)[0]}M`,
    recipeYield: info['Serves'],
    recipeIngredient: ingredients,
    nutrition: {
      "@type":"NutritionInformation",
      calories: nutrition['Calories'],
      proteinContent: nutrition['Protein'],
      carbohydrateContent: nutrition['Carbs'],
      fatContent: nutrition['Fat']
    },
    recipeInstructions: sections.map(sec => ({
      "@type": sec.steps.length>1 ? "HowToSection" : "HowToStep",
      name: sec.title,
      ...(sec.steps.length>1
        ? { itemListElement: sec.steps.map(s => ({ "@type":"HowToStep","text": s })) }
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
