# Debugging Demo Zero Values - Production Issue

## Problem Summary
Production database was successfully updated with rolling demo data (user_id 39, 103 transactions, March-August 2026), but deployed Vercel dashboard still shows ₹0 values.

## Root Cause Analysis

Based on the investigation, the most likely causes are:

### 1. Missing/Incorrect VITE_API_BASE_URL
The frontend uses `VITE_API_BASE_URL` environment variable:
```typescript
const rawBaseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
```

**If not set in Vercel**: Falls back to `localhost:5000` → all API calls fail → dashboard shows zeros

**If set incorrectly**: Points to wrong backend → wrong data or auth failures

### 2. Authentication Issue (Most Likely)
The recent migration to httpOnly cookie authentication may have issues:
- User not authenticated as demo user (user_id 39)
- Cookies not being sent from Vercel to Render
- CORS blocking cookie transmission
- User logged into different account

### 3. Date/Timezone Issue
Backend uses `MONTH(CURDATE())` and `YEAR(CURDATE())`:
- If database timezone differs from expected
- If server date is not August 2026
- This would cause current month queries to return empty

## Step-by-Step Debugging Guide

### STEP 1: Check Vercel Environment Variables

1. Go to Vercel Dashboard → SpendWise Pro project
2. Go to Settings → Environment Variables
3. Check if `VITE_API_BASE_URL` is set
4. Verify it points to: `https://spendwise-pro-backend.onrender.com` (or your actual Render URL)
5. **If missing or wrong**: Add/Update `VITE_API_BASE_URL` and redeploy

### STEP 2: Check Browser Network Requests

1. Open deployed Vercel demo
2. Login with demo@spendwise.ai
3. Open Browser DevTools → Network tab
4. Look for `/api/analytics/dashboard-summary` request
5. Check:
   - **Request URL**: Does it point to correct backend?
   - **Status Code**: 200? 401? 404? 500?
   - **Response**: What does the JSON response contain?
   - **Cookies**: Are cookies being sent?

### STEP 3: Verify Authentication

In Browser DevTools → Application tab:

1. Check Cookies for your domain
2. Look for: `access_token`, `refresh_token` cookies
3. Check if they exist and are not expired
4. If missing: Authentication is broken

### STEP 4: Test Backend API Directly

Use the provided verification script:

```bash
cd Backend
node scripts/verify-demo-data.js
```

This will show:
- Database current date
- August 2026 transaction counts
- Current month transaction counts
- Sample transactions

### STEP 5: Test API Endpoint with Authentication

Use curl to test the backend directly:

```bash
# First login to get cookies
curl -X POST https://your-render-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@spendwise.ai","password":"SpendWiseDemo@2026"}' \
  -c cookies.txt

# Then test dashboard API with cookies
curl https://your-render-backend.onrender.com/api/analytics/dashboard-summary \
  -b cookies.txt
```

### STEP 6: Check Render CORS Configuration

In Render Dashboard → Backend service:

1. Check environment variables:
   - `FRONTEND_URL`: Should be `https://spendwise-pro-nu.vercel.app`
   - `CORS_ORIGIN`: Should include Vercel URL
2. Check logs for CORS errors
3. Verify CORS allows credentials

## Most Likely Fix

Based on the analysis, the most probable issue is **missing or incorrect VITE_API_BASE_URL** in Vercel.

### Fix Steps:

1. **Set Vercel Environment Variable:**
   - Go to Vercel Dashboard → SpendWise Pro → Settings → Environment Variables
   - Add: `VITE_API_BASE_URL = https://spendwise-pro-backend.onrender.com`
   - (Replace with your actual Render backend URL)

2. **Redeploy Vercel:**
   - Push a commit or trigger redeploy in Vercel
   - Environment variables are only applied on new deployments

3. **Clear Browser Cache:**
   - Hard refresh the deployed site
   - Clear localStorage if needed

4. **Test:**
   - Login with demo@spendwise.ai
   - Check dashboard values
   - Should now show non-zero amounts

## Alternative: Authentication Issue

If VITE_API_BASE_URL is correct but still shows zeros:

### Check Cookie Configuration

Backend server.js shows:
```javascript
app.use(cors({
  origin(origin, callback) {
    const normalizedOrigin = origin?.replace(/\/$/, '');
    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }
    console.error(`[CORS Blocked] Origin: "${origin}"`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true  // Important for cookies
}));
```

**Verify in Render:**
- `FRONTEND_URL` environment variable is set to Vercel URL
- `CORS_ORIGIN` includes Vercel URL
- Backend logs show no CORS errors

### Check Cookie Settings

Frontend api.ts shows:
```javascript
const api = axios.create({
  baseURL,
  withCredentials: true, // Important for httpOnly cookies
});
```

**Verify:**
- Cookies are being set by backend
- Cookies are being sent by frontend
- SameSite and Secure attributes are correct

## Verification After Fix

After applying the fix:

1. **Check Network Tab:**
   - `/api/analytics/dashboard-summary` should return 200
   - Response should contain non-zero values:
     ```json
     {
       "success": true,
       "summary": {
         "current_month_income": 65000,
         "current_month_spending": 45000,
         "current_month_balance": 20000,
         "budget_remaining": 10000
       }
     }
     ```

2. **Check Dashboard:**
   - Monthly Income: ~₹65,000
   - Monthly Expenses: ~₹40,000-₹50,000
   - Monthly Savings: ~₹15,000-₹25,000
   - Budget Left: ~₹5,000-₹15,000
   - Recent Transactions: Multiple transactions

3. **Check Other Pages:**
   - Transactions page shows August transactions
   - Budgets page shows current month budgets
   - Analytics shows March-August data

## Files for Debugging

Created debugging scripts:
- `Backend/scripts/verify-demo-data.js` - Database verification
- `Backend/scripts/update-demo-production.js` - Production update

## Quick Fix Checklist

- [ ] VITE_API_BASE_URL set in Vercel
- [ ] VITE_API_BASE_URL points to correct Render backend
- [ ] Vercel redeployed after environment variable change
- [ ] Browser cache cleared
- [ ] User logged into demo account
- [ ] Network requests show correct backend URL
- [ ] API responses contain non-zero values
- [ ] Dashboard displays correct values

## If Still Not Working

If after setting VITE_API_BASE_URL the issue persists:

1. Check Render backend logs for errors
2. Verify database connection is working
3. Test backend API directly with curl
4. Check CORS configuration in both Vercel and Render
5. Verify cookie transmission between domains
6. Check if user is authenticated as correct user_id (39)
