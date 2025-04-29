import { extractRecipe } from '../../utils/recipeExtractor';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url || !/^https:\/\/www\.mindfulchef\.com\//.test(url)) {
    return res.status(400).json({ error: 'Please provide a valid Mindful Chef recipe URL.' });
  }

  try {
    const { html } = await extractRecipe(url);
    res.status(200).json({ html });
  } catch (e) {
    console.error('Error processing recipe:', e);
    res.status(500).json({ error: e.message });
  }
} 