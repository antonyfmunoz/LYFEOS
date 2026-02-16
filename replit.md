# LYFEOS - Gamified Life Operating System

## Overview
LYFEOS is a gamified personal productivity and life management web application that transforms daily tasks, habits, and goals into a game-like experience. It features XP systems, levels, stats (Energy Points, Health Points, Time Tokens, Attention Tokens), quests, and an AI assistant. The application has a "Solo Leveling" anime-inspired aesthetic with dark themes, neon accents, and futuristic HUD-style interfaces. Its core purpose is to enhance user engagement and motivation in managing their life.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses a dark theme with neon accents and a futuristic HUD-style interface, inspired by "Solo Leveling." It leverages Radix UI primitives and shadcn/ui for components, styled with Tailwind CSS, supporting a dark-only theme system.

### Technical Implementations
- **Frontend**: React 18 with TypeScript, Wouter for routing, React Context API and TanStack React Query for state management. Vite is used for building. Drag and drop functionality is provided by `react-dnd`.
- **Backend**: Node.js with Express, providing a RESTful JSON API. Session-based authentication is managed with `express-session` and `bcrypt` for password hashing.
- **AI Integration**: The NOVA AI System uses Anthropic models (Haiku for simple tasks, Sonnet for complex reasoning) via Replit AI Integrations. NOVA acts as an Advisor, Coach, and Executive Assistant, equipped with a Salience Engine and full data ingestion capabilities (user profile, stats, missions, logs, vision milestones, calendar, conversation history). It includes autonomous agent capabilities with tools for web search, web page reading, vision goal creation, batch mission creation, and uncompleting missions, supporting deep tool chaining. Smart model routing upgrades from Haiku to Sonnet when tools are used, complex interactions are detected, or images are present. Voice control is integrated via the Web Speech API and NOVA. NOVA now includes a comprehensive Life OS 2.0 Knowledge Base (`server/replit_integrations/chat/knowledge-base.ts`) with 16 domains covering philosophy, sleep, exercise, nutrition, psychology, relationships, finance, learning, productivity, crisis management, modern challenges, breathwork, advanced nutrition, functional fitness, biomarkers, and supplementation. The system uses automatic topic detection to inject relevant knowledge into the system prompt, plus a `lookup_knowledge_base` tool for active knowledge retrieval during conversations. NOVA has **vision/image analysis capability**: users can attach images directly in chat (via image upload button or paste), and NOVA also automatically extracts and analyzes inline images from mission descriptions, goal descriptions, and daily logs when the user's message references visual content (triggered by keywords like "image", "photo", "mission", "goal", "log", etc.). Images are sent as base64 vision content blocks to Anthropic (max 5 most recent).
- **Inline Image System**: Images can be uploaded inline across all text fields (missions, goals, daily logs, kanban, contacts, timeline) using the RichTextToolbar (`client/src/components/ui/rich-text-toolbar.tsx`) or MarkdownEditor image button. Images are stored as base64 in the `mediaItems` table with userId ownership enforcement. Served via `/api/inline-upload/:id` with authentication. Descriptions render as markdown with ObsidianMarkdown component across all display views.
- **Data Storage**: PostgreSQL (Neon serverless) with Drizzle ORM for type-safe schema definitions and migrations.
- **Authentication**: Email/password and optional OAuth (Firebase for Google/Apple/Facebook). Features include email verification, password reset, 2FA (email via Resend, phone via Firebase Phone Auth), rate limiting, security headers (Helmet), and Zod-based input validation.
- **Key Data Models**: Users, UserStats, UserProfile, Quests (with repeat patterns and vision goal linkage), Onboarding Missions, VisionGoals (milestone-based with time horizons, rewards, and XP bonuses), UserCategories (custom, AI-described), CalendarEvents, MissionPages, KanbanBoards, Documents, Contacts, Spreadsheets, Canvases, Graphs.
- **Gamification System**:
    - **Player Stats**: Energy Points, Health Points, Time Tokens, Attention Tokens (all starting at 100/100, with specific reset and calculation logic). An Efficiency Score tracks daily performance.
    - **XP and Leveling**: Exponential growth curve across three tiers of levels (1-10, 11-50, 51-100) with increasing XP multipliers.
    - **Stat Detail Pages**: Dedicated pages for Experience, Health, Efficiency, Energy, Time, and Attention, featuring real-time data fetching, recharts visualizations, time range selectors, and AI-powered insights.
- **Tracker Page**: Renamed from "Analytics," it includes a Milestone Analytics widget for vision goal progress and recent completions.
- **Progressive Web App (PWA)**: Includes a manifest, service worker for offline caching and push notifications, an install prompt, and a comprehensive push notification system with VAPID keys and subscription management.
- **Payment Processing**: Stripe integration for subscription-based payments, managing checkout sessions, customer creation, and webhook processing.

## External Dependencies

- **Database**: Neon PostgreSQL (requires `DATABASE_URL`).
- **AI Services**: Anthropic (via Replit AI Integrations).
- **Authentication (Optional)**: Firebase (for Google/Apple/Facebook OAuth, requires `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`).
- **Email Service**: Resend (for email verification and password resets).
- **SMS Service**: Firebase Phone Authentication (for 2FA via SMS). Phone verification is handled entirely on the frontend using Firebase's `RecaptchaVerifier` and `signInWithPhoneNumber` — no separate SMS provider needed. Twilio was previously used but has been removed. Server-side token verification uses Firebase Admin SDK (`server/firebaseAdmin.ts`); for full functionality, set `FIREBASE_SERVICE_ACCOUNT_KEY` secret with the service account JSON.
- **Payment Gateway**: Stripe.