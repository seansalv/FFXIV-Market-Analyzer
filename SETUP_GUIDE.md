# Setup Guide - FFXIV Market Profit Analyzer

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com) and create a new project
   - Wait for the project to be fully provisioned

2. **Run Database Migration**
   - Open the SQL Editor in your Supabase dashboard
   - Copy the contents of `supabase/migrations/001_initial_schema.sql`
   - Paste and run it in the SQL Editor
   - This creates all necessary tables and indexes

3. **Get Your Credentials**
   - Go to Project Settings > API
   - Copy the following:
     - Project URL (for `NEXT_PUBLIC_SUPABASE_URL`)
     - `anon` `public` key (for `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
     - `service_role` `secret` key (for `SUPABASE_SERVICE_ROLE_KEY`)

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
UNIVERSALIS_API_URL=https://universalis.app/api/v2
```

### 4. Populate Initial Data

Run the data ingestion script to fetch market data:

```bash
npm run ingest
```

**Note**: The script is configured to fetch data for a small set of popular items. You can modify `lib/universalis/client.ts` in the `getPopularItemIds()` function to add more items.

### 5. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## Project Structure

```
├── app/
│   ├── api/top-items/        # API endpoint for querying top items
│   ├── page.tsx               # Main dashboard page
│   ├── layout.tsx             # Root layout with providers
│   └── globals.css            # Global styles
├── components/
│   ├── FilterPanel.tsx        # Filter sidebar component
│   ├── MetricCards.tsx        # Summary metric cards
│   ├── ItemsTable.tsx         # Results table with sorting
│   └── InfoPanel.tsx          # Help/info modal
├── lib/
│   ├── analytics/
│   │   └── profitability.ts   # Profitability calculations
│   ├── db/
│   │   ├── items.ts           # Item database operations
│   │   ├── worlds.ts          # World database operations
│   │   └── market-data.ts     # Market data operations
│   ├── hooks/
│   │   └── use-top-items.ts   # React hook for fetching data
│   ├── supabase/
│   │   ├── client.ts          # Browser Supabase client
│   │   ├── server.ts          # Server Supabase client
│   │   └── database.types.ts  # Database type definitions
│   ├── universalis/
│   │   └── client.ts          # Universalis API client with rate limiting
│   └── types/
│       ├── api.ts             # API request/response types
│       └── database.ts        # Database table types
├── scripts/
│   └── fetch-universalis.ts   # Data ingestion script
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql  # Database schema
```

## Database Schema

### Tables

- **worlds**: NA worlds and data centers (pre-populated)
- **items**: Item master list (populated during ingestion)
- **recipes**: Crafting recipes with material costs (optional, for profit calculations)
- **market_sales**: Raw sales history from Universalis
- **daily_item_stats**: Aggregated daily statistics per item per world

### Key Relationships

- `market_sales.item_id` → `items.id`
- `market_sales.world_id` → `worlds.id`
- `daily_item_stats.item_id` → `items.id`
- `daily_item_stats.world_id` → `worlds.id`
- `recipes.item_id` → `items.id`

## API Endpoint

### GET /api/top-items

Returns the top N most profitable items based on filters.

**Query Parameters:**
- `worldOrDc` (string): World or data center name (default: 'all-na')
- `timeframe` ('1d' | '7d' | '30d'): Time window (default: '7d')
- `categories` (string): Comma-separated category names
- `craftableOnly` (boolean): Filter to craftable items only
- `nonCraftableOnly` (boolean): Filter to non-craftable items only
- `minSalesVelocity` (number): Minimum units per day
- `minRevenue` (number): Minimum total revenue
- `maxListings` (number): Maximum active listings
- `minPrice` (number): Minimum average price
- `topN` (number): Number of items to return (default: 25)
- `rankingMetric` ('revenue' | 'volume' | 'avgPrice' | 'profit' | 'roi'): Sort by metric

**Response:**
```json
{
  "items": [...],
  "totalItems": 100,
  "metrics": {
    "totalItems": 100,
    "totalRevenue": 1000000000,
    "avgProfitMargin": 25.5,
    "avgSalesVelocity": 15.3
  }
}
```

## Data Ingestion

The ingestion script (`scripts/fetch-universalis.ts`) does the following:

1. Fetches market data from Universalis for configured items and worlds
2. Stores raw sales history in `market_sales` table
3. Calculates and stores daily aggregated stats in `daily_item_stats` table
4. Updates item metadata in `items` table

**To customize:**
- Edit `WORLDS_TO_INGEST` in `scripts/fetch-universalis.ts` to change which worlds to process
- Edit `getPopularItemIds()` in `lib/universalis/client.ts` to add more items

**For production:**
- Set up a cron job or scheduled function to run ingestion periodically (e.g., every 6 hours)
- Consider using Vercel Cron, GitHub Actions, or a dedicated server

## Next Steps / Enhancements

### Immediate Improvements

1. **Item Names**: Currently items are stored with IDs only. Integrate with XIVAPI to fetch item names and categories:
   ```typescript
   // Add to lib/universalis/client.ts or create lib/xivapi/client.ts
   async function fetchItemDetails(itemId: number) {
     const response = await fetch(`https://xivapi.com/item/${itemId}`);
     const data = await response.json();
     return {
       name: data.Name,
       category: data.ItemKind?.Name,
       // ... other fields
     };
   }
   ```

2. **Recipe Data**: Populate the `recipes` table with material costs to enable profit calculations:
   - Option 1: Use XIVAPI recipe endpoints
   - Option 2: Manual entry for popular items
   - Option 3: Community-maintained recipe database

3. **Better Error Handling**: Add retry logic and error boundaries in the frontend

### Future Enhancements

- Historical price charts using Chart.js or Recharts
- Cross-world arbitrage analysis
- User authentication for saved filters
- Export to Excel format
- Real-time updates via WebSockets
- Mobile-responsive optimizations

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure `.env.local` exists and has all required variables
- Restart the dev server after adding environment variables

### "Failed to query stats"
- Check that the database migration ran successfully
- Verify your Supabase credentials are correct
- Ensure you've run the ingestion script at least once

### "No items found"
- Run the ingestion script: `npm run ingest`
- Check that items exist in the `items` table
- Verify your filters aren't too restrictive

### Rate Limiting Issues
- Universalis API limits to 10 requests/second
- The client includes rate limiting, but if you see 429 errors, reduce batch sizes
- Consider adding delays between batches in the ingestion script

## Support

For issues or questions:
1. Check the README.md for general information
2. Review the IMPLEMENTATION_GUIDE.md for architecture details
3. Check Supabase logs for database errors
4. Check browser console for frontend errors
5. Check Next.js server logs for API errors

