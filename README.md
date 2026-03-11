# GlowStack — Beauty & Fashion

AI-powered media asset management and analytics platform for beauty & fashion influencers.

## Quick Start

### 1. Preview (No Install Required)
Open `preview.html` in your browser for an interactive demo with all features.

### 2. Full Development Setup

```bash
cd glowstack
cp .env.example .env     # Edit with your credentials
npm install
npm run dev              # Starts both API (port 3001) and frontend (port 5173)
```

### 3. Database Setup (Supabase)
1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL in `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor
3. Add your Supabase URL and keys to `.env`

## Architecture

```
glowstack/
├── server/                 # Express API (Node.js)
│   ├── index.js            # Entry point
│   ├── routes/             # API endpoints
│   │   ├── media.js        # Media CRUD, search, tagging
│   │   ├── analytics.js    # Platform analytics, post analytics
│   │   ├── posts.js        # Published/scheduled posts
│   │   ├── calendar.js     # Content calendar events
│   │   ├── chat.js         # AI assistant conversation
│   │   ├── platforms.js    # Integration connections + setup guides
│   │   ├── dashboard.js    # Dashboard widgets + insights
│   │   ├── ai.js           # AI tagging, captions, scheduling
│   │   ├── reports.js      # On-demand report generation
│   │   └── tags.js         # Tag management
│   └── services/
│       ├── supabase.js     # Supabase client
│       └── demoData.js     # Demo data for prototype
├── src/                    # React frontend (Vite + Tailwind)
│   ├── App.jsx             # Root layout with sidebar + routing
│   ├── pages/
│   │   ├── Dashboard.jsx   # Metrics, charts, insights
│   │   ├── MediaLibrary.jsx # Grid/list view, search, tags, detail modal
│   │   ├── Analytics.jsx   # Platform analytics, top posts, best times
│   │   ├── ContentCalendar.jsx # Calendar view with AI suggestions
│   │   ├── AiChat.jsx      # Full-page AI assistant
│   │   └── SetupWizard.jsx # Platform connection + setup guides
│   ├── components/
│   │   └── chat/ChatDrawer.jsx # Floating chat drawer
│   └── services/api.js     # API client
├── supabase/migrations/    # Database schema
├── preview.html            # Standalone demo (no build needed)
└── .env.example            # Environment variables template
```

## Features

### Media Library
- Google Photos integration + direct upload
- AI-powered auto-tagging (content type, products, brands, mood, season)
- Full-text search across titles, descriptions, and tags
- Quality scoring per asset
- AI caption generation per platform

### Analytics
- Cross-platform metrics (Instagram, TikTok, YouTube, Pinterest, Facebook)
- Post-level engagement tracking (likes, comments, shares, saves, reach, impressions)
- Affiliate revenue tracking (ShopMy, LTK, Walmart, Amazon)
- Best posting time analysis
- On-demand report generation

### Content Calendar
- Visual calendar with drag-and-drop
- AI-suggested posting times and content ideas
- Multi-platform scheduling
- Event types: posts, shoots, deadlines, reminders

### AI Assistant
- Conversational interface for analytics queries
- Caption generation
- Content planning recommendations
- Performance insights
- Report generation

### Integrations
- Step-by-step setup wizard for each platform
- OAuth flow scaffolding
- Connection status monitoring
- Credential management via Supabase

## Platform Integrations

| Platform | Type | Features |
|----------|------|----------|
| Instagram | Social | Posts, Reels, Stories analytics |
| TikTok | Social | Video performance, trending data |
| YouTube | Social | Video analytics, subscriber data |
| Pinterest | Social | Pin performance, board analytics |
| Facebook | Social | Page analytics, cross-platform data |
| ShopMy | Affiliate | Commission tracking, link analytics |
| LTK | Affiliate | Sales data, click-through rates |
| Walmart | Affiliate | Product affiliate performance |
| Amazon | Affiliate | Storefront analytics, commissions |
| Google Photos | Media | Photo/video sync, library import |

## Tech Stack
- **Frontend:** React 18, Tailwind CSS, Recharts, Lucide Icons
- **Backend:** Node.js, Express
- **Database:** PostgreSQL via Supabase
- **AI:** OpenAI Vision API (for tagging), GPT-4 (for captions/insights)
- **Build:** Vite
