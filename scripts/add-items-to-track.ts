/**
 * Helper script to add items to the tracking list
 * 
 * Usage:
 *   npm run add-items <itemId1> <itemId2> ...
 * 
 * Example:
 *   npm run add-items 27835 27836 27837
 * 
 * This will add the item IDs to getPopularItemIds() function
 * 
 * Note: You can also manually edit lib/universalis/client.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: npm run add-items <itemId1> <itemId2> ...');
    console.error('Example: npm run add-items 27835 27836');
    console.error('\nOr manually edit lib/universalis/client.ts and add items to getPopularItemIds()');
    process.exit(1);
  }

  const itemIds = args.map(arg => {
    const id = parseInt(arg, 10);
    if (isNaN(id)) {
      console.error(`Error: "${arg}" is not a valid item ID`);
      process.exit(1);
    }
    return id;
  });

  const filePath = join(process.cwd(), 'lib/universalis/client.ts');
  let content = readFileSync(filePath, 'utf-8');

  // Find the getPopularItemIds function and add items
  const functionStart = content.indexOf('export function getPopularItemIds()');
  if (functionStart === -1) {
    console.error('Error: Could not find getPopularItemIds function');
    process.exit(1);
  }

  const returnStart = content.indexOf('return [', functionStart);
  if (returnStart === -1) {
    console.error('Error: Could not find return statement in getPopularItemIds');
    process.exit(1);
  }

  // Check which items are already in the list
  const existingIds = new Set<number>();
  const idRegex = /(\d+),/g;
  let match;
  while ((match = idRegex.exec(content.substring(returnStart))) !== null) {
    existingIds.add(parseInt(match[1], 10));
  }

  // Add new items
  const newItems: number[] = [];
  for (const id of itemIds) {
    if (!existingIds.has(id)) {
      newItems.push(id);
    }
  }

  if (newItems.length === 0) {
    console.log('All items are already in the tracking list');
    process.exit(0);
  }

  // Find the insertion point (before the closing bracket)
  const closingBracket = content.lastIndexOf('  ];', returnStart + 500);
  if (closingBracket === -1) {
    console.error('Error: Could not find closing bracket');
    process.exit(1);
  }

  // Add new items
  const itemsToAdd = newItems.map(id => `    ${id}, // Add item name here`).join('\n');
  const insertPoint = closingBracket;
  const before = content.substring(0, insertPoint);
  const after = content.substring(insertPoint);

  content = before + itemsToAdd + '\n' + after;

  writeFileSync(filePath, content, 'utf-8');

  console.log(`✅ Added ${newItems.length} item(s) to tracking list: ${newItems.join(', ')}`);
  console.log('\nNext steps:');
  console.log('1. Run: npm run ingest');
  console.log('2. The new items will be fetched from Universalis and XIVAPI');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
