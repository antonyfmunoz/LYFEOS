# LYFEOS - Gamified Life Operating System

## Overview

LYFEOS is a gamified personal productivity and life management application built as a full-stack web app. It transforms daily tasks, habits, and goals into a game-like experience with XP systems, levels, stats (Energy Points, Health Points, Time Tokens, Attention Tokens), quests, and AI assistance. The application follows a "Solo Leveling" anime-inspired aesthetic with dark themes, neon accents, and futuristic HUD-style interfaces.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: React Context API (`LYFEOSProvider`, `AuthProvider`, `ThemeProvider`) combined with TanStack React Query for server state
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with dark-only theme system using CSS variables
- **Drag and Drop**: react-dnd with HTML5 backend for widget reordering
- **Build Tool**: Vite with custom plugins for theming

### Backend Architecture
- **Runtime**: Node.js with Express
- **API Design**: RESTful JSON API with session-based authentication
- **Session Management**: express-session with secure cookie configuration
- **Password Hashing**: bcrypt for secure password storage
- **AI Integration**: Anthropic via Replit AI Integrations (no API key required, billed to credits). Smart model routing: Claude Haiku 4.5 for simple tasks (greetings, commands, stat tips, affirmations, mission stat suggestions) and Claude Sonnet 4.5 for complex reasoning (analysis, planning, advice, detailed questions). Complexity classifier in `server/replit_integrations/chat/routes.ts` selects model based on message content.
- **Voice Control**: AI-powered voice commands via Web Speech API + NOVA AI orchestration (`POST /api/voice-command`). Supports navigation, widget toggle, mission management, timer control, and conversational queries. NOVA interprets natural language and returns structured JSON actions.
- **File Uploads**: Multer for handling media uploads

### Data Storage
- **Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for database migrations (`migrations/` directory)

### Authentication & Security
- **Primary**: Username/password with bcrypt hashing and express-session
- **OAuth**: Firebase Authentication for Google/Apple/Facebook sign-in (optional)
- **Session Storage**: Server-side sessions with secure HTTP-only cookies
- **Email Verification**: SHA-256 hashed tokens with 24-hour expiry, sent via Resend
- **Password Reset**: SHA-256 hashed tokens with 1-hour expiry, single-use, sent via Resend
- **Token Security**: All tokens (verification + reset) are hashed with SHA-256 before DB storage; raw tokens only exist in memory and email links
- **Rate Limiting**: forgot-password (3/min), reset-password (5/min), resend-verification (3/min)
- **Security Headers**: Helmet middleware with compression and 1MB request size limits
- **Input Validation**: Zod-based validation on all auth endpoints with format checks

### Key Data Models
- **Users**: Core account with profile, avatar, auth provider tracking
- **UserStats**: Gamification stats (XP, level, energy, health, time tokens, attention tokens, streaks)
- **UserProfile**: Onboarding data (archetype, flow style, motivations)
- **Quests**: Task/mission system with XP rewards, supports ritualized (recurring) missions with hourly/daily/weekly/monthly/yearly repeat patterns
- **CalendarEvents**: Scheduling and time-blocking
- **MissionPages**: Markdown-based mission documentation
- **KanbanBoards/Columns/Tasks**: Project management
- **Documents/Folders**: Note-taking and knowledge base
- **Contacts/Spreadsheets/Canvases/Graphs**: Additional productivity tools

### Player Stats System
- **All stats start at 100/100** (Energy Points, Health Points, Time Tokens, Attention Tokens)
- **Energy Points**: Calculated from yesterday's daily log ratings (mental + physical + emotional, each 1-10) at midnight. Average scaled to max EP. Also subtracted by mission energy cost on completion during the day.
- **Time Tokens**: Subtracted by mission energy cost on completion, reset to max daily
- **Attention Tokens**: Subtracted by mission energy cost on completion, reset to max daily
- **Health Points**: Reset to max at midnight (same as Time/Attention Tokens). Not derived from daily log ratings.
- **Efficiency Score**: Daily metric (0-100) calculated as: 40% today's mission completion rate + 30% token allocation effectiveness (cost of completed vs all missions) + 30% token utilization rate (tokens used vs max)
- **Daily Reset**: All tokens (energy, time, attention) reset to max at midnight via server-side processLoginStreak + client-side interval sync
- All resources are refunded when uncompleting a mission

### XP and Leveling System
- Exponential growth curve with tiered multipliers
- Levels 1-10: Light growth (1.0372x)
- Levels 11-50: Moderate growth (1.0572x)
- Levels 51-100: Steep growth (1.0872x)
- Base XP for Level 1: 1,000 XP

### Project Structure
```
├── client/           # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route page components
│   │   ├── lib/         # Context, utilities, types
│   │   └── hooks/       # Custom React hooks
│   └── public/          # Static assets
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route definitions
│   ├── storage.ts    # Data access layer
│   ├── db.ts         # Database connection
│   └── openai.ts     # AI integration
├── shared/           # Shared code between client/server
│   └── schema.ts     # Drizzle database schema
└── migrations/       # Database migrations
```

## External Dependencies

### Database
- **Neon PostgreSQL**: Serverless Postgres database (requires `DATABASE_URL` environment variable)

### AI Services
- **OpenAI API**: GPT-4o model for AI assistant functionality (requires `OPENAI_API_KEY` environment variable)

### Authentication (Optional)
- **Firebase**: Google/Apple/Facebook OAuth authentication
  - Requires `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` environment variables

### Key NPM Packages
- `@neondatabase/serverless`: Neon database driver
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `@tanstack/react-query`: Server state management
- `@radix-ui/*`: Accessible UI primitives
- `tailwindcss`: Utility-first CSS framework
- `openai`: OpenAI API client
- `bcrypt`: Password hashing
- `express-session`: Session management
- `multer`: File upload handling