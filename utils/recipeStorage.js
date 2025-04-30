import fs from 'fs/promises';
import path from 'path';

const STORAGE_FILE = path.join(process.cwd(), 'public', 'recipes.json');

export async function saveRecipe(recipe) {
  try {
    let recipes = [];
    try {
      const data = await fs.readFile(STORAGE_FILE, 'utf-8');
      recipes = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, that's okay
    }

    recipes.push(recipe);
    await fs.writeFile(STORAGE_FILE, JSON.stringify(recipes, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving recipe:', error);
    return false;
  }
}

export async function getRecipes() {
  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

export async function clearRecipes() {
  try {
    await fs.writeFile(STORAGE_FILE, JSON.stringify([], null, 2));
    return true;
  } catch (error) {
    console.error('Error clearing recipes:', error);
    return false;
  }
} 