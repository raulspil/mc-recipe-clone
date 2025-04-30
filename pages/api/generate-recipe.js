import { extractRecipe } from '../../utils/recipeExtractor';
import slugify from 'slugify';
import { saveRecipe } from '../../lib/ephemeralStore';

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
    // Create a unique slug from the recipe name and timestamp
    const slug = slugify(name, { lower: true, strict: true }) + '-' + Date.now();

    // Wrap the recipe HTML in a complete HTML document (with schema.org microdata if needed)
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

    // Store in ephemeral in-memory store
    saveRecipe(slug, fullHtml);

    // Return the public URL
    res.status(200).json({ 
      url: `/recipe/${slug}`,
      name: name
    });
  } catch (e) {
    console.error('Error processing recipe:', e);
    res.status(500).json({ error: e.message });
  }
} 