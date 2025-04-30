import { getRecipes, clearRecipes } from '../../utils/recipeStorage';
import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all stored recipes
    const recipes = await getRecipes();
    
    // Create recipes directory if it doesn't exist
    const recipesDir = path.join(process.cwd(), 'public', 'recipes');
    await fs.mkdir(recipesDir, { recursive: true });

    // Write each recipe to a file
    for (const recipe of recipes) {
      const filePath = path.join(recipesDir, `${recipe.slug}.html`);
      await fs.writeFile(filePath, recipe.html, 'utf-8');
    }

    // Clear the temporary storage
    await clearRecipes();

    res.status(200).json({ 
      message: 'Build triggered successfully',
      recipesGenerated: recipes.length
    });
  } catch (error) {
    console.error('Error triggering build:', error);
    res.status(500).json({ error: error.message });
  }
} 