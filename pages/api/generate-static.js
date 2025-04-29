import { extractRecipe } from '../../utils/recipeExtractor';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url || !/^https:\/\/www\.mindfulchef\.com\//.test(url)) {
    return res.status(400).json({ error: 'Please provide a valid Mindful Chef recipe URL.' });
  }

  try {
    const { html, name } = await extractRecipe(url);
    
    // Create a sanitized filename
    const filename = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '.html';
    
    // Create the recipes directory if it doesn't exist
    const recipesDir = path.join(process.cwd(), 'public', 'recipes');
    if (!fs.existsSync(recipesDir)) {
      fs.mkdirSync(recipesDir, { recursive: true });
    }

    // Write the file
    const filePath = path.join(recipesDir, filename);
    fs.writeFileSync(filePath, html);

    res.status(200).json({ 
      url: `/recipes/${filename}`,
      message: `Recipe saved as ${filename}`
    });
  } catch (e) {
    console.error('Error processing recipe:', e);
    res.status(500).json({ error: e.message });
  }
} 