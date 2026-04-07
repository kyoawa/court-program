# Dutchie Catalog Manager

Internal tool for managing product images and descriptions across dispensary online menus powered by Dutchie POS. Changes made here push live to each dispensary's catalog.

## Tech Stack

- **Framework:** Next.js 16 (App Router, React 19)
- **Database:** PostgreSQL via Neon serverless driver
- **UI:** Tailwind CSS 4, shadcn/ui, Radix UI
- **AI:** OpenAI (product description generation)
- **Data Fetching:** SWR
- **Deployment:** Vercel (auto-deploys on push)

## Getting Started

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Features

- **Product Browsing** — View and filter products across all dispensary locations
- **Image Management** — Upload, assign, and remove product images synced to Dutchie
- **Image Repository** — Central library of reusable product images with group organization
- **AI Descriptions** — Generate product descriptions using OpenAI
- **Bulk Operations** — Apply images and descriptions across multiple products at once

## Deployment

The app deploys automatically to Vercel on push to the `main` branch.
