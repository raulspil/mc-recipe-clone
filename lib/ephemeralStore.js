// Simple in-memory store for ephemeral recipes
// Recipes are stored as { [slug]: { html, createdAt } }

const recipes = {};

export function saveRecipe(slug, html) {
  recipes[slug] = {
    html,
    createdAt: Date.now(),
  };
}

export function getRecipe(slug) {
  return recipes[slug] || null;
}

export function deleteRecipe(slug) {
  delete recipes[slug];
}

export function clearAllRecipes() {
  Object.keys(recipes).forEach((slug) => delete recipes[slug]);
} 