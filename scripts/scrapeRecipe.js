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
import puppeteer from 'puppeteer';

async function main() {
  const [,, url, outPath] = process.argv;
  if (!url || !outPath) {
    console.error('Usage: node scrapeRecipe.js <url> <outputPath>');
    process.exit(1);
  }
  
  // 1) Fetch with Puppeteer so we get the real HTML (including JSON‑LD)
  let html, servingSize = '', instructions = [], prepTime = '';
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    // Extract serving size and instructions from rendered DOM
    const extracted = await page.evaluate(() => {
      // Serving size: find checked radio button in serving size group
      let serving = '';
      const radio = document.querySelector('input[type="radio"][name*="serving"]:checked');
      if (radio) {
        // Try to get label text
        const label = radio.closest('label') || document.querySelector(`label[for='${radio.id}']`);
        if (label) serving = label.textContent.trim();
        else serving = radio.value;
      }
      // Instructions: get all visible bullet points or steps
      let steps = [];
      const instructionSection = document.querySelector('section.instructions');
      if (instructionSection) {
        // Try list items first
        steps = Array.from(instructionSection.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean);
        // Fallback: paragraphs
        if (!steps.length) {
          steps = Array.from(instructionSection.querySelectorAll('p')).map(p => p.textContent.trim()).filter(Boolean);
        }
      }
      // Prep time: try to find in visible text
      let prep = '';
      const bodyText = document.body.innerText;
      const prepMatch = bodyText.match(/Prep time:\s*(\d+\s*mins?)/i);
      if (prepMatch) prep = prepMatch[1];
      // Fallback: look for 'only takes X minutes to prep' in description
      if (!prep) {
        const descMatch = bodyText.match(/only takes (\d+\s*mins?|\d+\s*minutes) to prep/i);
        if (descMatch) prep = descMatch[1];
      }
      return { serving, steps, prep };
    });
    servingSize = extracted.serving;
    instructions = extracted.steps;
    prepTime = extracted.prep;
    html = await page.content();
    await browser.close();
    if (!html || typeof html !== 'string') {
      console.error('Error: Puppeteer did not return a valid HTML string.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error fetching HTML with Puppeteer:', err);
    process.exit(1);
  }
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
    // --- Custom instructions extraction for Mindful Chef ---
    let steps = [];
    if (typeof recipeData.recipeInstructions === 'string') {
      // Custom grouping for this recipe style
      const text = recipeData.recipeInstructions.replace(/\s+/g, ' ').trim();
      // Grouping logic: split into logical steps based on key phrases and semicolons
      // 1. Preheat oven, boil water, cook rice
      // 2. Make the avo salsa
      // 3. Make the marinade, coat hake, roast
      // 4. Meanwhile, drain sweetcorn/beans, cook, add rice/beans, season
      // 5. Thinly slice spring onions, serve
      // We'll use regex to match these groupings for this recipe style
      const stepRegex = [
        /(Preheat the oven.*?then drain\.)/i,
        /(Make the avo salsa;.*?black pepper\.)/i,
        /(Make the marinade;.*?cooked through\.)/i,
        /(Meanwhile, drain.*?to taste\.)/i,
        /(Thinly slice the spring onions.*?spring onions\.)/i
      ];
      let remaining = text;
      for (const re of stepRegex) {
        const m = remaining.match(re);
        if (m) {
          steps.push(m[1].trim());
          remaining = remaining.replace(m[1], '').trim();
        }
      }
      // If anything left, add as last step
      if (remaining) steps.push(remaining);
    } else if (Array.isArray(recipeData.recipeInstructions)) {
      steps = recipeData.recipeInstructions.map(inst => typeof inst === 'string' ? inst : inst.text || '');
    }
    // Render as a single section with numbered steps
    sections = [{ title: '', steps }];
  } else {
    // manual DOM scraping fallback (same as Salmon page)
    name = $('h1.css-s3pb72').first().text().trim();
    desc = $('div.css-1c4tiag').first().text().trim();
    img  = $('img[alt]').first().attr('src') || '';
    // times & servings
    // Extract cook time, prep time, and serving size from visible text
    let cookTime = '', prepTime = '', totalTime = '', recipeYield = '';
    $('div:contains("Cook time")').each((_, el) => {
      const text = $(el).text();
      const match = text.match(/Cook time:\s*([\d]+\s*mins?)/i);
      if (match) cookTime = match[1];
    });
    $('div:contains("Prep time")').each((_, el) => {
      const text = $(el).text();
      const match = text.match(/Prep time:\s*([\d]+\s*mins?)/i);
      if (match) prepTime = match[1];
    });
    // Serving size: use Puppeteer result if available
    recipeYield = servingSize || '';
    // Prep time: use Puppeteer result if available
    prep = prepTime || '';
    // Cook time: try to extract from visible text (e.g. 'Cook time: 35 mins')
    cook = '';
    const cookMatch = $('body').text().match(/Cook time:\s*(\d+\s*mins?)/i);
    if (cookMatch) {
      cook = cookMatch[1];
    } else if (info.Cook) {
      cook = info.Cook;
    }

    prep  = prepTime;
    cook  = cookTime;
    total = totalTime;
    recipeYield = recipeYield;
    ingredients = $('section.ingredients ul li').toArray().map(li => $(li).text().trim());
    // Cooking instructions: use Puppeteer result if available
    sections = [];
    if (instructions && instructions.length) {
      sections.push({ title: '', steps: instructions });
    } else {
      // fallback: get all paragraphs under instructions
      const steps = $('section.instructions p').toArray().map(p => $(p).text().trim()).filter(Boolean);
      if (steps.length) sections.push({ title: '', steps });
    }
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
    body{font-family:sans-serif;padding:1rem}
    img{max-width:100%}
    h1{margin-top:0}
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
  <h2>Serving Size</h2>
  <p>${recipeYield}</p>
  <h2>Prep Time</h2>
  <p>${prep}</p>
  <h2>Cook Time</h2>
  <p>${cook}</p>
  <h2>Cooking Instructions</h2>
  <div>
    <ol>
      ${sections[0].steps.map(s => `<li>${s}</li>`).join('\n      ')}
    </ol>
  </div>
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
