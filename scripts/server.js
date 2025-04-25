import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper: extract recipe info from Mindful Chef page
async function extractRecipe(url) {
  const { data: html } = await axios.get(url);
  const $ = cheerio.load(html);
  // Try to find JSON-LD recipe data
  const ldJson = $('script[type="application/ld+json"]').html();
  if (!ldJson) throw new Error('Recipe data not found');
  const recipe = JSON.parse(ldJson);
  if (!recipe || recipe['@type'] !== 'Recipe') throw new Error('No recipe found');
  // Format for Recipe Keeper (simple HTML)
  let out = `<h1>${recipe.name}</h1>`;
  if (recipe.description) out += `<p>${recipe.description}</p>`;
  if (recipe.image) out += `<img src='${recipe.image}' style='max-width:100%'><br>`;
  if (recipe.recipeIngredient) {
    out += '<h2>Ingredients</h2><ul>';
    for (const ing of recipe.recipeIngredient) out += `<li>${ing}</li>`;
    out += '</ul>';
  }
  if (recipe.recipeInstructions) {
    out += '<h2>Instructions</h2>';
    // Instructions may be a string or array
    if (Array.isArray(recipe.recipeInstructions)) {
      out += '<ol>';
      for (const step of recipe.recipeInstructions) {
        if (typeof step === 'string') out += `<li>${step}</li>`;
        else if (step.text) out += `<li>${step.text}</li>`;
      }
      out += '</ol>';
    } else {
      out += `<p>${recipe.recipeInstructions.replace(/\n/g, '<br>')}</p>`;
    }
  }
  if (recipe.nutrition) {
    out += '<h2>Nutrition</h2><ul>';
    for (const [k, v] of Object.entries(recipe.nutrition)) {
      if (k !== '@type') out += `<li>${k}: ${v}</li>`;
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

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => console.log('Server running on port', port));
}

export default app; // For Vercel