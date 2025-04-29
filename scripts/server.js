import express from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import cors from 'cors';
import puppeteer from 'puppeteer';
import slugify from 'slugify';
import fs from 'fs/promises';

const app = express();
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// Helper: extract recipe info from Mindful Chef page using Puppeteer and robust fallbacks, with debug logs
async function extractRecipe(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // Extract instructions HTML and serving size from the DOM (like scrapeRecipe.js)
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

  // Get full HTML for parsing
  const html = await page.content();
  await browser.close();

  const $ = load(html);

  // Debug: How many JSON-LD scripts?
  const allJsonLdScripts = $('script[type="application/ld+json"]');
  console.log('Found JSON-LD scripts:', allJsonLdScripts.length);

  const allJsonLd = allJsonLdScripts.map((i, el) => {
    try { 
      const json = JSON.parse($(el).html());
      return json;
    } catch (e) { 
      console.log('JSON parse error:', e);
      return null; 
    }
  }).get();
  console.log('Parsed JSON-LD:', allJsonLd);

  const recipeData = allJsonLd.find(o => o && o['@type'] === 'Recipe') || {};
  console.log('Recipe data:', recipeData);

  // Core fields with fallbacks
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

  // Serving size
  let recipeYield = recipeData.recipeYield || servingSizeDom || '';

  // Nutrition extraction: JSON-LD or DOM fallback using data-testid
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

  // Instructions: prefer DOM-extracted instructionsHtml, else fallback to JSON-LD or DOM scraping
  let finalInstructionsHtml = instructionsHtml;
  if (!finalInstructionsHtml) {
    // Fallback to JSON-LD or DOM scraping for instructions
    if (recipeData.recipeInstructions) {
      if (typeof recipeData.recipeInstructions === 'string') {
        finalInstructionsHtml = `<h2>Instructions</h2><ol><li>${recipeData.recipeInstructions.split('\n').map(s => s.trim()).filter(Boolean).join('</li><li>')}</li></ol>`;
      } else if (Array.isArray(recipeData.recipeInstructions)) {
        // Could be array of strings or HowToStep/HowToSection
        const steps = [];
        for (const step of recipeData.recipeInstructions) {
          if (typeof step === 'string') steps.push(step);
          else if (step.text) steps.push(step.text);
          else if (step.itemListElement) {
            for (const substep of step.itemListElement) {
              if (typeof substep === 'string') steps.push(substep);
              else if (substep.text) steps.push(substep.text);
            }
          }
        }
        finalInstructionsHtml = `<h2>Instructions</h2><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>`;
      }
    } else {
      // Fallback: try to grab instructions from DOM
      const instrs = $('[data-testid="recipe-step"], [data-testid="recipe-bulletpoint"]').toArray().map(el => $(el).text().trim());
      if (instrs.length) {
        finalInstructionsHtml = `<h2>Instructions</h2><ol>${instrs.map(s => `<li>${s}</li>`).join('')}</ol>`;
      }
    }
  }

  // Build final HTML for Recipe Keeper (always include all fields)
  let out = `<h1>${name}</h1>`;
  if (description) out += `<p>${description}</p>`;
  if (image) out += `<img src='${image}' style='max-width:100%'><br>`;
  if (ingredients && ingredients.length) {
    out += '<h2>Ingredients</h2><ul>';
    for (const ing of ingredients) out += `<li>${ing}</li>`;
    out += '</ul>';
  }
  if (recipeYield) {
    out += `<h2>Serving Size</h2><p>${recipeYield}</p>`;
  }
  if (prepTime) {
    out += `<h2>Prep Time</h2><p>${prepTime}</p>`;
  }
  if (cookTime) {
    out += `<h2>Cook Time</h2><p>${cookTime}</p>`;
  }
  if (totalTime) {
    out += `<h2>Total Time</h2><p>${totalTime}</p>`;
  }
  if (finalInstructionsHtml) {
    out += `<!-- Cooking Instructions -->\n${finalInstructionsHtml}`;
  }
  if (nutrition && Object.values(nutrition).some(Boolean)) {
    out += '<h2>Nutrition (per serving)</h2><ul>';
    for (const [k, v] of Object.entries(nutrition)) {
      if (v) out += `<li><strong>${k.replace(/Content$/,'')}:</strong> ${v}</li>`;
    }
    out += '</ul>';
  }
  return out;
}

app.post('/api/convert', async (req, res) => {
  const { url } = req.body;
  if (!url || !/^https:\/\/www\.mindfulchef\.com\//.test(url)) {
    return res.json({ error: 'Please provide a valid Mindful Chef recipe URL.' });
  }
  try {
    const html = await extractRecipe(url);
    res.json({ html });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/generate-static', async (req, res) => {
  const { url } = req.body;
  if (!url || !/^https:\/\/www\.mindfulchef\.com\//.test(url)) {
    return res.json({ error: 'Please provide a valid Mindful Chef recipe URL.' });
  }
  try {
    const html = await extractRecipe(url);
    // Extract the recipe name for slug
    const nameMatch = html.match(/<h1>(.*?)<\/h1>/i);
    const recipeName = nameMatch ? nameMatch[1] : 'recipe';
    const slug = slugify(recipeName, { lower: true, strict: true });
    const filePath = `public/recipes/${slug}.html`;
    await fs.mkdir('public/recipes', { recursive: true });
    await fs.writeFile(filePath, html, 'utf-8');
    const publicUrl = `/recipes/${slug}.html`;
    res.json({ url: publicUrl });
  } catch (e) {
    res.json({ error: e.message });
  }
});

const port = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

export default app; // For Vercel