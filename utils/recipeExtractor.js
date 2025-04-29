import { load } from 'cheerio';
import puppeteer from 'puppeteer';

export async function extractRecipe(url) {
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Extract instructions & serving size
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
    const fullHtml = await page.content();

    // Load into Cheerio and parse JSON-LD
    const $ = load(fullHtml);
    const allJsonLdScripts = $('script[type="application/ld+json"]');
    
    const allJsonLd = allJsonLdScripts.map((i, el) => {
      try { 
        const json = JSON.parse($(el).html());
        return json;
      } catch (e) { 
        console.log('JSON parse error:', e);
        return null; 
      }
    }).get();

    const recipeData = allJsonLd.find(o => o && o['@type'] === 'Recipe') || {};

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

    // Build final HTML for Recipe Keeper
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
    if (instructionsHtml) {
      out += `<!-- Cooking Instructions -->\n${instructionsHtml}`;
    }
    if (nutrition && Object.values(nutrition).some(Boolean)) {
      out += '<h2>Nutrition (per serving)</h2><ul>';
      for (const [k, v] of Object.entries(nutrition)) {
        if (v) out += `<li><strong>${k.replace(/Content$/,'')}:</strong> ${v}</li>`;
      }
      out += '</ul>';
    }
    return { html: out, name };
  } catch (error) {
    console.error('Error in extractRecipe:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
} 