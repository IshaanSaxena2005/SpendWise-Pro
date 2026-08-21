# Demo Account Production Update Guide

## Problem Analysis

The deployed demo account on Vercel/Render was showing ₹0 values because:

1. **Root Cause**: The production database (TiDB Cloud) contained old static demo data from February-July 2026
2. **Date Mismatch**: Current date is August 2026, but database had no August 2026 transactions
3. **API Behavior**: Analytics endpoints use `MONTH(CURDATE())` and `YEAR(CURDATE())` to filter current month data
4. **Result**: All current-month queries returned zero results

## Solution

A safe production update script has been created to refresh ONLY the demo account with rolling demo data.

## Files Changed

### Backend Scripts
- `Backend/scripts/seed-demo-user.js` - Added safety check for production
- `Backend/scripts/update-demo-production.js` - **NEW FILE** - Safe production update script
- `Backend/package.json` - Added npm scripts for demo management

### Backend Controllers  
- `Backend/controllers/goalController.js` - Dynamic demo goals based on current date

### Frontend
- `Frontend/src/lib/constants.ts` - Demo email constant
- `Frontend/src/components/dashboard/DashboardLayout.tsx` - Demo user detection

## How to Update Production Demo Account

### Prerequisites
- Access to production environment variables (Render dashboard)
- Database credentials for TiDB Cloud
- SSH/Console access to Render backend

### Step 1: Access Production Backend
```bash
# Via Render CLI or SSH into the production backend
# Or use Render Console to execute commands
```

### Step 2: Set Environment Variables
Ensure the following are set in production:
- `DB_HOST` - TiDB Cloud host
- `DB_USER` - Database user  
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name
- `DB_PORT` - Database port (usually 4000 for TiDB)

### Step 3: Run the Safe Update Script
```bash
cd Backend
CONFIRM_DEMO_SEED=true node scripts/update-demo-production.js
```

**⚠️ SAFETY FEATURES:**
- Script will NOT run without `CONFIRM_DEMO_SEED=true`
- Only affects demo@spendwise.ai account
- Does NOT modify real user data
- Uses current system date for rolling data generation

### Step 4: Verify the Update
The script will output:
- Generated months (e.g., "2026-03, 2026-04, 2026-05, 2026-06, 2026-07, 2026-08")
- Number of transactions created (~60-70 transactions)
- Number of budgets created (12 budgets)
- Number of recurring transactions created (9 recurring)

### Step 5: Test the Demo Account
1. Visit https://spendwise-pro-nu.vercel.app/
2. Login with demo credentials: `demo@spendwise.ai` / `SpendWiseDemo@2026`
3. Verify Dashboard shows:
   - Monthly Income: ~₹65,000
   - Monthly Expenses: ~₹40,000-₹50,000
   - Monthly Savings: ~₹15,000-₹25,000
   - Budget Left: ~₹5,000-₹15,000
   - Recent Transactions: Multiple transactions for current month

## How Rolling Demo Data Works

### Date Generation
- Uses `new Date()` to get current system date
- Generates data for: current month + 5 previous months
- Example for August 2026: March, April, May, June, July, August

### Transaction Distribution
- **Monthly Pattern**: 10 fixed transactions per month (salary, rent, groceries, etc.)
- **Random Transactions**: 4-7 additional random transactions per month
- **Current Month Specific**: 19 specific transactions to ensure current month is well-populated

### Budget Generation
- Current month: Overall budget ₹55,000 + category budgets
- Previous month: Overall budget ₹55,000 + category budgets  
- Two months ago: Overall budget ₹50,000 + category budgets

### Data Consistency
- All dashboard values calculated from actual transaction data
- Budget utilization derived from transaction totals
- Analytics use same transaction dataset
- No hardcoded values across different pages

## Maintenance

### Monthly Updates
The demo data will need to be updated when:
- A new month begins (to ensure current month has data)
- Demo data becomes stale (old months drop out of 6-month window)

### Update Frequency
Run the update script at the start of each month to ensure the current month always contains fresh demo data.

### Automation (Optional)
To automate this, you could:
1. Set up a cron job on Render to run the update script monthly
2. Create a Render cron job that calls a protected API endpoint
3. Use GitHub Actions with scheduled workflows

## Troubleshooting

### Script Won't Run
- Ensure `CONFIRM_DEMO_SEED=true` is set
- Check database connection variables are correct
- Verify demo user exists in database

### Dashboard Still Shows ₹0
- Verify script ran successfully
- Check browser cache (hard refresh)
- Verify current month matches generated data
- Check browser console for API errors

### Wrong Month Data
- Verify system date on production server
- Check that script was run after month change
- Review script output for generated months

## Security Notes

- ⚠️ Never commit `.env` files with production credentials
- ⚠️ The update script requires explicit confirmation (`CONFIRM_DEMO_SEED=true`)
- ⚠️ Script only affects demo@spendwise.ai account
- ⚠️ Real user data is never touched by this script
- ⚠️ Keep database credentials secure in Render environment variables
