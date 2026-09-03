# 🚀 Deployment Guide - Delivery Tambon App

**Status:** Ready to Deploy ✅

---

## ⚡ Quick Deployment (5 minutes)

### Step 1: Create GitHub Repository

1. Go to: https://github.com/new
2. Fill in:
   - **Repository name:** `delivery-tambon-app`
   - **Description:** Delivery system with shop dashboard
   - **Public** ✓
3. DO NOT check "Initialize this repository with:"
4. Click **"Create repository"**
5. Copy the repository URL (looks like: `https://github.com/bhiddaya/delivery-tambon-app.git`)

### Step 2: Push Code to GitHub

Run these commands in terminal:

```bash
cd /home/claude/delivery-tambon-app

# Set remote URL
git remote add origin https://github.com/bhiddaya/delivery-tambon-app.git

# Rename branch to main
git branch -M main

# Push code
git push -u origin main
```

You should see:
```
Enumerating objects: 80, done.
Counting objects: 100% (80/80), done.
Compressing objects: 100% (75/75), done.
Writing objects: 100% (80/80), ...

* [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

### Step 3: Deploy to Vercel

1. Go to: https://vercel.com/bhiddaya-4813s-projects
2. Click **"+ Add New Project"**
3. Click **"Import Project"**
4. Paste GitHub repository URL: `https://github.com/bhiddaya/delivery-tambon-app.git`
5. Click **"Import"**
6. In the **"Environment Variables"** section, add:

   ```
   SUPABASE_SERVICE_ROLE_KEY
   <PASTE_YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE>
   ```

7. Click **"Deploy"** ✅

### Step 4: Wait for Deployment

Vercel will:
- Build the Next.js app
- Run tests (if any)
- Deploy to CDN

You'll see a URL like: `https://delivery-tambon-app.vercel.app` ✨

---

## 📋 What's Included in This Deployment

### ✅ Frontend Components
- RoleSelector (home page with 3 roles)
- LoginForm with Password Reset
- Shop Dashboard (Orders, Menu, Profile tabs)
- Registration forms (Shop & Rider)

### ✅ Backend API Routes
- `GET /api/shops/[id]` - Get shop details
- `GET /api/shops/[shopId]/orders` - List orders
- `PUT /api/shops/[shopId]/orders/[orderId]` - Update order status
- `GET/POST/PUT/DELETE /api/shops/[shopId]/products` - Manage menu

### ✅ Authentication
- JWT tokens with localStorage persistence
- Password reset with OTP
- "Remember Me" 30-day sessions
- Phone-only registration support

### ✅ Database
- Supabase PostgreSQL integration
- Tables: users, shops, orders, order_items, products

---

## 🧪 Testing After Deployment

1. **Visit deployed URL:** `https://delivery-tambon-app.vercel.app`
2. **Test flows:**
   - Click "เจ้าของร้านค้า" (Shop Owner)
   - Click "สมัครใหม่" (Register)
   - Complete registration
   - Should see Shop Dashboard

---

## 📞 Troubleshooting

### Deploy fails with "Module not found"
- Check `.env.local` has all required variables
- Vercel logs will show which one is missing

### API returns 500 error
- Check SUPABASE_SERVICE_ROLE_KEY is set correctly
- Check Supabase tables exist (shops, orders, products)

### "Cannot GET /"
- Check Next.js built successfully
- Vercel logs should show build errors

---

## 🎯 Next Steps

After deployment goes live:

1. **Test Shop Dashboard:**
   - Create test shop account
   - Add menu items
   - Simulate order workflow

2. **Build Customer Flow:**
   - Order browsing
   - Order placement
   - Order tracking

3. **Build Rider App:**
   - Accept deliveries
   - Track route
   - Mark as delivered

4. **Setup PromptPay Payment**
5. **Enable Push Notifications**

---

**✨ Deployed by:** Claude Haiku 4.5
**Date:** 2026-09-03
**Repository:** https://github.com/bhiddaya/delivery-tambon-app
