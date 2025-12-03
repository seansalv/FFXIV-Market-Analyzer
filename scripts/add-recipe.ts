/**
 * Helper script to add recipe data (material costs) for items
 * 
 * Usage:
 *   npm run add-recipe <itemId> <materialCost>
 * 
 * Example:
 *   npm run add-recipe 36113 47500
 * 
 * This adds a recipe entry for item 36113 with a material cost of 47,500 gil
 */

// Load environment variables
const dotenv = require('dotenv');
const { resolve } = require('path');
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

import { upsertRecipe } from '../lib/db/items';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npm run add-recipe <itemId> <materialCost>');
    console.error('Example: npm run add-recipe 36113 47500');
    process.exit(1);
  }

  const itemId = parseInt(args[0], 10);
  const materialCost = parseInt(args[1], 10);

  if (isNaN(itemId) || isNaN(materialCost)) {
    console.error('Error: itemId and materialCost must be numbers');
    process.exit(1);
  }

  try {
    await upsertRecipe({
      item_id: itemId,
      material_cost: materialCost,
    });
    console.log(`✅ Added recipe for item ${itemId} with material cost ${materialCost.toLocaleString()} gil`);
  } catch (error) {
    console.error('❌ Error adding recipe:', error);
    process.exit(1);
  }
}

main();

