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
- **Styling**: Tailwind CSS with custom dark/light theme system using CSS variables
- **Drag and Drop**: react-dnd with HTML5 backend for widget reordering
- **Build Tool**: Vite with custom plugins for theming

### Backend Architecture
- **Runtime**: Node.js with Express
- **API Design**: RESTful JSON API with session-based authentication
- **Session Management**: express-session with secure cookie configuration
- **Password Hashing**: bcrypt for secure password storage
- **AI Integration**: OpenAI GPT-4o for AI assistant (NOVA) functionality
- **File Uploads**: Multer for handling media uploads

### Data Storage
- **Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for database migrations (`migrations/` directory)

### Authentication
- **Primary**: Username/password with bcrypt hashing and express-session
- **OAuth**: Firebase Authentication for Google/Apple/Facebook sign-in (optional)
- **Session Storage**: Server-side sessions with secure HTTP-only cookies

### Key Data Models
- **Users**: Core account with profile, avatar, auth provider tracking
- **UserStats**: Gamification stats (XP, level, energy, health, time tokens, attention tokens, streaks)
- **UserProfile**: Onboarding data (archetype, flow style, motivations)
- **Quests**: Task/mission system with XP rewards
- **CalendarEvents**: Scheduling and time-blocking
- **MissionPages**: Markdown-based mission documentation
- **KanbanBoards/Columns/Tasks**: Project management
- **Documents/Folders**: Note-taking and knowledge base
- **Contacts/Spreadsheets/Canvases/Graphs**: Additional productivity tools

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