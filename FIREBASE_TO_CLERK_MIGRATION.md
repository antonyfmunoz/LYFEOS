# Firebase to Clerk Migration Plan — LyfeOS

## Executive Summary

LyfeOS currently uses Firebase for three distinct services across 17 source files:

1. **Firebase Auth (Client)** — OAuth (Google/Apple), email/password sign-in, email verification, password reset, phone auth, custom tokens
2. **Firebase Admin (Server)** — Token verification, user creation, email verification checks, custom token generation, password updates
3. **Firebase Cloud Messaging (FCM)** — Push notifications (client token management + server-side sending via Admin SDK)
4. **Firestore** — Initialized but effectively unused (imported in `firebase.ts`, no read/write operations found)

Clerk replaces #1 and #2 entirely. FCM (#3) has no Clerk equivalent and must be handled separately (keep FCM or migrate to Web Push API). Firestore (#4) is dead code — remove on migration.

---

## Firebase Service to Clerk Mapping

| Firebase Service | Clerk Equivalent | Notes |
|---|---|---|
| `signInWithPopup` / `signInWithRedirect` (Google) | `<SignIn />` component or `clerk.client.signIn.create()` with OAuth | Clerk handles popup/redirect internally |
| `OAuthProvider("apple.com")` | Clerk Apple OAuth social connection | Configure in Clerk Dashboard |
| `signInWithEmailAndPassword` | `clerk.client.signIn.create({ identifier, password })` | Clerk manages password hashing |
| `sendEmailVerification` | Clerk handles automatically on sign-up, or `user.createEmailAddress()` | Built-in, no custom action codes |
| `sendPasswordResetEmail` / `confirmPasswordReset` | `clerk.client.signIn.create({ strategy: 'reset_password_email_code' })` | Clerk's own flow |
| `RecaptchaVerifier` + `signInWithPhoneNumber` | Clerk phone number verification via `user.createPhoneNumber()` + OTP | No reCAPTCHA needed |
| `onAuthStateChanged` | `useUser()` / `useAuth()` hooks from `@clerk/clerk-react` | Reactive, hook-based |
| `auth.currentUser` | `useUser()` hook or `clerk.user` | Always available in context |
| `firebase-admin verifyIdToken` | `clerkClient.verifyToken(sessionToken)` or Express middleware `ClerkExpressRequireAuth()` | Session-based, not ID tokens |
| `firebase-admin createUser` | `clerkClient.users.createUser()` | Server-side user creation |
| `firebase-admin getUserByEmail` | `clerkClient.users.getUserList({ emailAddress })` | Server-side lookup |
| `firebase-admin createCustomToken` | Not needed — Clerk uses session tokens | Eliminate custom token flow |
| `firebase-admin checkEmailVerified` | `clerkClient.users.getUser(id)` → check `emailAddresses[].verification.status` | Server-side check |
| `firebase-admin updateUser (password)` | `clerkClient.users.updateUser(id, { password })` | Server-side password update |
| FCM `getToken` / `getMessaging` | **No Clerk equivalent** — keep FCM or migrate to generic Web Push | See Phase 5 |
| FCM `admin.messaging().send()` | **No Clerk equivalent** — keep `firebase-admin` for messaging only, or use web-push lib | See Phase 5 |
| Firestore `getFirestore` | **Remove** — dead code, no actual reads/writes | Delete on migration |

---

## File-by-File Audit & Effort Estimate

### Tier 1: Core Auth Infrastructure (delete/rewrite)

| # | File | Firebase Usage | Migration Action | Effort |
|---|---|---|---|---|
| 1 | `client/src/lib/firebase.ts` | App init, Auth init, Firestore init | **Delete entirely.** Replace with Clerk provider setup. | S |
| 2 | `client/src/lib/firebaseAuth.ts` | Google/Apple OAuth, email sign-in, email verification, password reset, custom token sign-in, action codes | **Delete entirely.** All flows replaced by Clerk components/hooks. | M |
| 3 | `server/firebaseAdmin.ts` | Admin SDK init, `verifyIdToken`, `createUser`, `getUserByEmail`, `checkEmailVerified`, `createCustomToken`, `updateUserPassword` | **Rewrite as `clerkAdmin.ts`.** Replace all functions with `@clerk/express` equivalents. Keep if FCM stays. | L |
| 4 | `client/src/lib/authContext.tsx` | `onAuthStateChanged`, `firebaseUser` state, OAuth redirect handling, `auth.signOut()`, Firebase sign-in after registration | **Rewrite.** Replace with Clerk's `useUser()`/`useAuth()`. Remove all Firebase redirect logic (~150 lines). Context becomes much simpler. | XL |

### Tier 2: Server Auth Routes (heavy rewrite)

| # | File | Firebase Usage | Migration Action | Effort |
|---|---|---|---|---|
| 5 | `server/routes/auth.ts` | `createFirebaseUser` on register, `checkFirebaseEmailVerified`, `verifyFirebaseIdToken`, `createCustomToken`, `getFirebaseUserByEmail`, 6 Firebase-specific endpoints | **Heavy rewrite.** Remove endpoints: `/api/auth/firebase`, `/api/auth/firebase-custom-token`, `/api/auth/ensure-firebase-user`, `/api/auth/reset-password-firebase`, `/api/auth/2fa/verify-email-firebase`, `/api/auth/2fa/verify-phone-firebase`. Replace with Clerk webhook for user sync. Registration flow simplifies massively. | XL |
| 6 | `server/index.ts` | Firebase auth proxy (`/__/auth/`), rate limiters for Firebase endpoints | **Remove** proxy setup and Firebase-specific rate limiters. Add Clerk middleware. | M |
| 7 | `server/storage.ts` | `getUserByFirebaseUid()`, `updateUserFirebaseUid()`, `pushSubscriptions` (FCM) | **Remove** Firebase UID methods. Keep push subscription methods if FCM stays. Add `clerkUserId` column. | M |

### Tier 3: Client Pages (moderate changes)

| # | File | Firebase Usage | Migration Action | Effort |
|---|---|---|---|---|
| 8 | `client/src/pages/ProfilePage.tsx` | `RecaptchaVerifier`, `signInWithPhoneNumber`, Firebase phone auth, `verify-email-firebase` API call, `verify-phone-firebase` API call | **Rewrite 2FA section.** Replace with Clerk's phone/email verification components. Remove reCAPTCHA. | L |
| 9 | `client/src/pages/ForgotPasswordPage.tsx` | `sendPasswordReset` from firebaseAuth, `ensure-firebase-user` API call | **Rewrite.** Replace with Clerk's `<SignIn />` forgot password flow or custom `useSignIn()` hook. | S |
| 10 | `client/src/pages/ResetPasswordPage.tsx` | `verifyPasswordResetCode`, `confirmPasswordReset`, `firebaseSignInWithEmail`, `reset-password-firebase` API call | **Rewrite.** Replace with Clerk's password reset flow. | S |
| 11 | `client/src/pages/VerifyEmailPage.tsx` | `applyVerificationCode`, `auth.currentUser`, `firebaseUser.reload()` | **Rewrite.** Clerk handles email verification natively. May become a simple redirect. | S |

### Tier 4: Push Notifications (FCM — separate decision)

| # | File | Firebase Usage | Migration Action | Effort |
|---|---|---|---|---|
| 12 | `client/src/hooks/usePushNotifications.ts` | `getMessaging`, `getToken`, `deleteToken`, `onMessage`, `isSupported` | **Decision needed.** If keeping FCM: keep this file, just decouple from `firebase.ts` (init FCM app separately). If migrating to web-push: rewrite. | M-L |
| 13 | `client/public/firebase-messaging-sw.js` | Firebase messaging service worker | **Keep if FCM stays.** Delete if migrating to generic web-push. | S |
| 14 | `server/notificationScheduler.ts` | `firebase-admin` messaging, `admin.messaging().send()` | **Keep if FCM stays** (only needs `firebase-admin` for messaging, not auth). If migrating: replace with `web-push` library. | M-L |

### Tier 5: Schema & Database

| # | File | Firebase Usage | Migration Action | Effort |
|---|---|---|---|---|
| 15 | `shared/schema.ts` | `firebaseUid` column on `users`, `fcmToken` on `push_subscriptions` | **Add** `clerkUserId` column. **Deprecate** `firebaseUid` (keep during transition, drop later). Keep `fcmToken` if FCM stays. | M |
| 16 | `server/routes/goals.ts` | `/api/push/subscribe` and `/api/push/unsubscribe` (FCM token CRUD) | **No change if FCM stays.** These are FCM-agnostic (just store tokens). | None |

### Tier 6: Peripheral / Dead Code

| # | File | Firebase Usage | Migration Action | Effort |
|---|---|---|---|---|
| 17 | `client/src/components/dailyInit/DailyInitModal.tsx` | Comment referencing "Firebase-specific fields" | **Remove comment.** No functional Firebase code. | None |

---

## Breaking Changes

### Client Breaking Changes
1. **`firebaseUser` removed from AuthContext** — Any component reading `firebaseUser` must switch to Clerk's `useUser()`.
2. **OAuth flow completely changes** — No more `signInWithPopup`/`signInWithRedirect`. Clerk uses its own modal/redirect.
3. **`auth` export from `firebase.ts` disappears** — All imports of `auth` from `@/lib/firebase` break.
4. **reCAPTCHA removed** — Phone verification uses Clerk's built-in OTP, no reCAPTCHA container needed.
5. **Service worker changes** — If FCM stays, `firebase-messaging-sw.js` needs standalone Firebase init (can't rely on `firebase.ts`).
6. **Email verification flow changes** — No more `oobCode` query params. Clerk uses its own verification flow.
7. **Password reset flow changes** — No more Firebase action codes. Clerk manages the entire flow.

### Server Breaking Changes
1. **Session model changes** — Currently uses `express-session` with `userId`. Clerk uses its own session tokens. Must decide: keep express-session + sync from Clerk webhook, or fully adopt Clerk sessions.
2. **6 API endpoints removed** — `/api/auth/firebase`, `/api/auth/firebase-custom-token`, `/api/auth/ensure-firebase-user`, `/api/auth/reset-password-firebase`, `/api/auth/2fa/verify-email-firebase`, `/api/auth/2fa/verify-phone-firebase`.
3. **Registration endpoint changes** — `/api/auth/register` no longer creates Firebase users. Clerk webhook handles user creation sync.
4. **`firebaseUid` column deprecated** — New `clerkUserId` column needed. Existing users need migration mapping.
5. **Auth proxy removed** — `/__/auth/` proxy to Firebase no longer needed.

### Database Breaking Changes
1. **New column**: `clerk_user_id TEXT` on `users` table
2. **Deprecated column**: `firebase_uid` (keep for rollback safety, drop after 30 days)
3. **Migration script needed**: Map existing Firebase UIDs to Clerk user IDs during user import

---

## Migration Order (5 Phases)

### Phase 1: Foundation (Day 1-2)
**Goal: Clerk SDK installed, configured, running alongside Firebase**

1. `npm install @clerk/clerk-react @clerk/express`
2. Create Clerk application in dashboard, configure:
   - Google OAuth social connection
   - Apple OAuth social connection
   - Email/password authentication
   - Phone number verification
3. Add `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env`
4. Add `<ClerkProvider>` wrapper in `App.tsx` (alongside existing `AuthProvider`)
5. Create `server/clerkAdmin.ts` with equivalent functions
6. Add database migration: `ALTER TABLE users ADD COLUMN clerk_user_id TEXT`
7. Add Clerk Express middleware to `server/index.ts`

**No breaking changes. Firebase still works.**

### Phase 2: Auth Context Rewrite (Day 3-5)
**Goal: Client auth switches from Firebase to Clerk**

1. Rewrite `client/src/lib/authContext.tsx`:
   - Replace `onAuthStateChanged` with Clerk `useUser()`
   - Replace `loginWithGoogle`/`loginWithApple` with Clerk OAuth
   - Replace `login` (email/password) with Clerk sign-in
   - Replace `register` with Clerk sign-up
   - Remove all Firebase redirect/popup logic (~150 lines deleted)
   - Remove `firebaseUser` from context
2. Delete `client/src/lib/firebase.ts`
3. Delete `client/src/lib/firebaseAuth.ts`
4. Rewrite `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, `VerifyEmailPage.tsx`
5. Update `ProfilePage.tsx` — replace Firebase phone auth with Clerk phone verification

**Firebase Auth client SDK fully removed after this phase.**

### Phase 3: Server Auth Rewrite (Day 5-7)
**Goal: Server validates Clerk sessions instead of Firebase tokens**

1. Rewrite `server/routes/auth.ts`:
   - Remove all 6 Firebase-specific endpoints
   - Add Clerk webhook endpoint (`/api/webhooks/clerk`) for user.created / user.updated events
   - Registration flow: Clerk handles user creation, webhook syncs to DB
   - Login: Clerk session token validated via middleware, session synced
   - Keep `/api/auth/me` but validate via Clerk session
2. Rewrite `server/firebaseAdmin.ts` → `server/clerkAdmin.ts`:
   - Replace `verifyFirebaseIdToken` → `clerkClient.verifyToken()`
   - Replace `createFirebaseUser` → `clerkClient.users.createUser()`
   - Replace `checkFirebaseEmailVerified` → check via Clerk user object
   - Remove `createCustomToken` (not needed)
3. Remove Firebase auth proxy from `server/index.ts`
4. Update `server/storage.ts` — add `getUserByClerkId()`, deprecate Firebase UID methods
5. Run user migration script: import existing users into Clerk, map IDs

**Firebase Auth (server) fully removed. `firebase-admin` package kept only if FCM stays.**

### Phase 4: Cleanup & Database (Day 8-9)
**Goal: Remove all Firebase auth artifacts**

1. Remove `firebase` package from `package.json` (client SDK)
2. Remove `firebase-admin` **only if FCM is also migrated** (otherwise keep for messaging)
3. Remove all `VITE_FIREBASE_*` env vars (except messaging-related if FCM stays)
4. Remove `FIREBASE_SERVICE_ACCOUNT_KEY` **only if FCM migrated**
5. Clean up `shared/schema.ts` — remove `firebaseUid` export from insert schema
6. Database migration: drop `firebase_uid` column (after confirming all users migrated)
7. Remove dead Firestore import/init code
8. Update `DailyInitModal.tsx` comment

### Phase 5: FCM Decision (Day 10+)
**Goal: Resolve push notification dependency**

**Option A: Keep FCM (recommended short-term)**
- Keep `firebase-admin` package (server only, for messaging)
- Keep `firebase` client package **only for messaging** — or extract FCM into standalone init
- Keep `firebase-messaging-sw.js`
- Keep `usePushNotifications.ts` with standalone FCM init (decouple from deleted `firebase.ts`)
- Effort: S (just decouple FCM init)

**Option B: Migrate to Web Push API**
- Replace `firebase-admin` messaging with `web-push` npm package
- Replace FCM client with native Push API + VAPID keys
- Rewrite `usePushNotifications.ts` to use native `PushManager.subscribe()`
- Rewrite `firebase-messaging-sw.js` to use generic push event handler
- Rewrite `notificationScheduler.ts` to use `web-push` library
- Effort: L (full rewrite of push system)

**Recommendation: Option A for now.** FCM works, and push notifications are a separate concern from auth. Migrate FCM later if you want to fully remove all Firebase dependencies.

---

## Effort Summary

| Phase | Files Changed | Effort | Risk |
|---|---|---|---|
| Phase 1: Foundation | 4-5 new/modified | S-M | Low — additive only |
| Phase 2: Client Auth | 6 files (3 deleted, 3 rewritten) | L | Medium — all client auth changes |
| Phase 3: Server Auth | 4-5 files | XL | High — session model changes, user migration |
| Phase 4: Cleanup | 3-4 files | S | Low — just removal |
| Phase 5: FCM (Option A) | 1-2 files | S | Low — just decouple init |
| **Total** | **~15 files** | **~3-5 days focused work** | |

---

## Environment Variables

### Remove (after migration)
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_ACTUAL_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_STORAGE_BUCKET
FIREBASE_SERVICE_ACCOUNT_KEY          # Keep if FCM stays
```

### Keep (if FCM stays)
```
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_VAPID_KEY
FIREBASE_SERVICE_ACCOUNT_KEY
```

### Add
```
VITE_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
```

---

## Packages

### Remove
```
firebase           # Remove after Phase 2 (or keep messaging module only for FCM)
firebase-admin     # Remove after Phase 3 (or keep for FCM messaging only)
```

### Add
```
@clerk/clerk-react    # Client-side auth
@clerk/express        # Server-side middleware + admin SDK
svix                  # Webhook signature verification (for Clerk webhooks)
```

---

## User Migration Strategy

Existing users have accounts in both PostgreSQL (primary) and Firebase Auth. Migration plan:

1. **Export Firebase users** — Use Firebase Admin SDK to list all users
2. **Create Clerk users** — Use Clerk's Backend API to create each user with matching email
3. **Map IDs** — Store `clerk_user_id` in PostgreSQL for each migrated user
4. **Password users** — Cannot migrate password hashes (Firebase uses scrypt). Users with email/password auth will need to use "Forgot Password" on first Clerk login.
5. **OAuth users** — Will work seamlessly once Google/Apple social connections are configured in Clerk. They just sign in again.
6. **Rollback plan** — Keep `firebaseUid` column and Firebase project active for 30 days post-migration. If issues arise, revert to Firebase auth.

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Password users can't log in (hashes don't transfer) | Pre-migration: send email to all password users with password reset link. Clerk supports importing Firebase scrypt hashes via API. |
| OAuth redirect URIs break | Configure Clerk's redirect URIs before cutover. Test on staging first. |
| Session invalidation on cutover | Deploy server changes during low-traffic window. All users will need to re-login once. |
| Webhook delivery failure (Clerk → server) | Use Svix retry logic. Add manual sync endpoint as fallback. |
| FCM breaks if Firebase SDK removed too early | Phase 5 explicitly keeps FCM working. Only remove Firebase SDK after FCM is decoupled or migrated. |
| Replit deployment specifics | Test Clerk's domain/cookie configuration on Replit Autoscale. May need custom domain for auth cookies. |
