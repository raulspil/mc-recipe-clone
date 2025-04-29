import { extractRecipe } from '../../utils/recipeExtractor';
import slugify from 'slugify';
import fs from 'fs/promises';
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
    
    // Create a slug from the recipe name
    const slug = slugify(name, { lower: true, strict: true });
    
    // Wrap the recipe HTML in a complete HTML document
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        img { max-width: 100%; height: auto; }
        h1 { margin-top: 0; }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;

    // Define paths
    const publicDir = path.join(process.cwd(), 'public');
    const recipesDir = path.join(publicDir, 'recipes');
    const filePath = path.join(recipesDir, `${slug}.html`);

    // Ensure recipes directory exists
    await fs.mkdir(recipesDir, { recursive: true });

    // Write the file
    await fs.writeFile(filePath, fullHtml, 'utf-8');

    // Return the public URL (relative to domain root)
    const publicUrl = `/recipes/${slug}.html`;
    res.status(200).json({ 
      url: publicUrl,
      name: name
    });
  } catch (e) {
    console.error('Error processing recipe:', e);
    res.status(500).json({ error: e.message });
  }
} 