# Firebase-to-Clerk Migration Verification Checklist

Use this checklist to verify every aspect of the migration before considering it complete.
Mark each item: **PASS**, **FAIL**, or **N/A** (with reason).

---

## 1. Auth Flows

### 1.1 Email/Password Login
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 1.1.1 | New user can sign up with email and password | Account created in Clerk dashboard, user row created in PostgreSQL with `clerk_user_id` populated |
| 1.1.2 | Existing user can log in with email and password | Session established, user lands on authenticated dashboard |
| 1.1.3 | Invalid credentials show clear error | Wrong password or nonexistent email returns user-facing error, no stack trace or 500 |
| 1.1.4 | Password strength requirements enforced | Clerk rejects weak passwords per dashboard policy |
| 1.1.5 | Logout clears session completely | After sign-out, `useUser()` returns null, protected routes redirect to login, no stale tokens in cookies or localStorage |
| 1.1.6 | Session persists across page refresh | Authenticated user stays logged in after F5 / browser refresh |
| 1.1.7 | Migrated password users can log in via "Forgot Password" | Users whose Firebase scrypt hashes were not imported can reset and set a new Clerk password |

### 1.2 Google OAuth
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 1.2.1 | Google OAuth sign-in works | Clerk OAuth popup/redirect opens, Google consent screen appears, user authenticated on return |
| 1.2.2 | New Google user creates account | First-time Google sign-in creates Clerk user + PostgreSQL row with `clerk_user_id` |
| 1.2.3 | Returning Google user logs in | Existing Google user gets matched to their existing account, no duplicate created |
| 1.2.4 | OAuth redirect URIs configured correctly | No redirect_uri_mismatch errors in any environment (local, staging, production) |
| 1.2.5 | Google OAuth works on mobile browsers | Popup or redirect flow completes on iOS Safari and Android Chrome |

### 1.3 Apple OAuth
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 1.3.1 | Apple OAuth sign-in works | Apple sign-in flow completes, user authenticated |
| 1.3.2 | Apple private relay email handled | If user hides email, Clerk stores the relay address and account still functions |
| 1.3.3 | New Apple user creates account | PostgreSQL row created with `clerk_user_id` |
| 1.3.4 | Returning Apple user logs in | Matched to existing account, no duplicate |
| 1.3.5 | Apple Service ID and redirect configured | Clerk dashboard has correct Apple credentials, no authorization errors |

### 1.4 Email Verification
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 1.4.1 | Sign-up triggers verification email | Clerk sends verification email automatically on registration |
| 1.4.2 | Clicking verification link completes verification | `emailAddresses[].verification.status === "verified"` in Clerk user object |
| 1.4.3 | Unverified users are restricted appropriately | App enforces email verification before granting full access (if required by business logic) |
| 1.4.4 | No references to Firebase `oobCode` query params | Grep codebase for `oobCode`, `applyActionCode`, `applyVerificationCode` -- zero results |
| 1.4.5 | `VerifyEmailPage.tsx` uses Clerk flow | Page either uses Clerk component or redirects to Clerk's built-in verification |

### 1.5 Password Reset
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 1.5.1 | "Forgot password" sends reset email via Clerk | User receives Clerk-branded reset email with code or link |
| 1.5.2 | User can set new password | After reset flow, user logs in with new password successfully |
| 1.5.3 | `ForgotPasswordPage.tsx` uses Clerk | No imports from `firebaseAuth.ts`, uses `useSignIn()` or `<SignIn />` |
| 1.5.4 | `ResetPasswordPage.tsx` uses Clerk | No references to `verifyPasswordResetCode`, `confirmPasswordReset`, or Firebase action codes |
| 1.5.5 | Old Firebase reset links no longer functional | Stale Firebase reset emails do not break the app (graceful error or redirect) |

### 1.6 Phone 2FA
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 1.6.1 | User can add phone number from profile | Clerk phone verification flow sends OTP, user enters code, phone verified |
| 1.6.2 | No reCAPTCHA container in DOM | Grep for `RecaptchaVerifier`, `recaptcha-container` -- zero results in client code |
| 1.6.3 | `ProfilePage.tsx` uses Clerk phone verification | No imports from `firebase/auth` for phone auth |
| 1.6.4 | 2FA enforcement works if enabled | If 2FA is required, user cannot access protected routes without completing phone verification |
| 1.6.5 | Phone number displayed correctly in profile | Stored and displayed in E.164 format |

---

## 2. Push Notifications (FCM Decision)

### Option A: FCM Retained (recommended short-term)
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 2.1 | FCM initialized independently of Firebase Auth | `usePushNotifications.ts` initializes its own Firebase app instance for messaging only, does not import from deleted `firebase.ts` |
| 2.2 | `firebase-messaging-sw.js` works standalone | Service worker registers, receives push events, displays notifications |
| 2.3 | FCM token registration works | `getToken()` succeeds, token stored in `push_subscriptions` table |
| 2.4 | Server can send push via `firebase-admin` messaging | `notificationScheduler.ts` sends test notification, device receives it |
| 2.5 | `FIREBASE_SERVICE_ACCOUNT_KEY` retained in env | Server env has service account key for messaging only |
| 2.6 | `VITE_FIREBASE_MESSAGING_SENDER_ID` and `VITE_FIREBASE_VAPID_KEY` retained | Client env has messaging-specific Firebase vars |
| 2.7 | No Firebase Auth imports in FCM code | Grep `usePushNotifications.ts` and `firebase-messaging-sw.js` for `getAuth`, `signIn`, `onAuthStateChanged` -- zero results |

### Option B: Migrated to Web Push API
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 2.8 | VAPID keys generated and configured | `web-push` library initialized with VAPID public/private keys |
| 2.9 | Client uses native `PushManager.subscribe()` | No Firebase messaging SDK imports in client |
| 2.10 | Service worker uses generic `push` event | `firebase-messaging-sw.js` replaced with generic push service worker |
| 2.11 | Server uses `web-push` library to send | `notificationScheduler.ts` uses `webpush.sendNotification()`, no `firebase-admin` messaging calls |
| 2.12 | `firebase-admin` package fully removed | Not in `package.json`, not in `node_modules` |
| 2.13 | All `VITE_FIREBASE_*` env vars removed | Zero Firebase env vars remain |

---

## 3. Database Migration

| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 3.1 | `clerk_user_id` column exists on `users` table | `ALTER TABLE users ADD COLUMN clerk_user_id TEXT` migration applied, column present |
| 3.2 | `clerk_user_id` has unique constraint | No two rows share the same `clerk_user_id` value |
| 3.3 | All existing users have `clerk_user_id` populated | `SELECT COUNT(*) FROM users WHERE clerk_user_id IS NULL` returns 0 (or only returns test/orphan accounts) |
| 3.4 | `clerk_user_id` values match Clerk dashboard | Spot-check 5+ users: their `clerk_user_id` in PostgreSQL matches the user ID shown in Clerk dashboard |
| 3.5 | `firebaseUid` column deprecated (not dropped yet) | Column still exists for rollback safety, but no application code reads or writes to it |
| 3.6 | `getUserByClerkId()` storage method works | Calling `storage.getUserByClerkId(clerkId)` returns the correct user row |
| 3.7 | `getUserByFirebaseUid()` removed from active code paths | Grep for `getUserByFirebaseUid` -- zero results outside of deprecated/commented code |
| 3.8 | `updateUserFirebaseUid()` removed from active code paths | Grep for `updateUserFirebaseUid` -- zero results |
| 3.9 | `shared/schema.ts` updated | `clerkUserId` field added to schema, `firebaseUid` removed from insert schema exports |
| 3.10 | Clerk webhook creates DB user on `user.created` | Creating a new user in Clerk triggers webhook that inserts a row in `users` table |
| 3.11 | Clerk webhook updates DB user on `user.updated` | Updating email/name in Clerk dashboard syncs to PostgreSQL via webhook |
| 3.12 | `firebaseUid` column dropped (30 days post-migration) | After rollback window: `ALTER TABLE users DROP COLUMN firebase_uid` applied cleanly |

---

## 4. Environment Variables

| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 4.1 | `VITE_CLERK_PUBLISHABLE_KEY` set | Present in `.env`, Dockerfile build args, and Fly.io secrets |
| 4.2 | `CLERK_SECRET_KEY` set | Present in server env (`.env` and Fly.io secrets), never exposed to client |
| 4.3 | `CLERK_WEBHOOK_SECRET` set | Present in server env, used by Svix to verify webhook signatures |
| 4.4 | `VITE_FIREBASE_API_KEY` removed | Not in `.env`, `.replit`, Dockerfile, or fly.toml (unless FCM Option A) |
| 4.5 | `VITE_FIREBASE_AUTH_DOMAIN` removed | Not referenced anywhere in env files or deployment config |
| 4.6 | `VITE_FIREBASE_PROJECT_ID` removed | Removed from all env files (unless needed for FCM standalone init) |
| 4.7 | `VITE_FIREBASE_ACTUAL_PROJECT_ID` removed | Not in `.env`, `.replit`, Dockerfile, or fly.toml |
| 4.8 | `VITE_FIREBASE_APP_ID` removed | Not in any env file or deployment config |
| 4.9 | `VITE_FIREBASE_STORAGE_BUCKET` removed | Not referenced anywhere |
| 4.10 | `FIREBASE_SERVICE_ACCOUNT_KEY` status correct | Removed if FCM migrated (Option B); retained if FCM kept (Option A) |
| 4.11 | `VITE_FIREBASE_MESSAGING_SENDER_ID` status correct | Retained only if FCM kept (Option A); removed if Option B |
| 4.12 | `VITE_FIREBASE_VAPID_KEY` status correct | Retained only if FCM kept (Option A); removed if Option B |
| 4.13 | Dockerfile build args updated | All `ARG VITE_FIREBASE_*` lines replaced with `ARG VITE_CLERK_PUBLISHABLE_KEY` (plus messaging args if FCM kept) |
| 4.14 | `fly.toml` secrets list updated | Comments/config reference Clerk vars, not Firebase auth vars |
| 4.15 | `.replit` env vars updated | `VITE_FIREBASE_AUTH_DOMAIN` and `VITE_FIREBASE_ACTUAL_PROJECT_ID` removed or replaced |
| 4.16 | No hardcoded Firebase config in source | Grep for `lyfeos-a55f4`, `agentos-d3b6e`, `76858514072` in source files -- zero results outside env/config |

---

## 5. Server — Firebase Admin Replacement

| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 5.1 | `server/firebaseAdmin.ts` deleted or gutted | File deleted entirely, or stripped to FCM-only functions (no auth functions remain) |
| 5.2 | `server/clerkAdmin.ts` created | Contains Clerk equivalents: token verification, user creation, user lookup, email verification check |
| 5.3 | `verifyFirebaseIdToken` replaced | All calls now use `clerkClient.verifyToken()` or `ClerkExpressRequireAuth()` middleware |
| 5.4 | `createFirebaseUser` replaced | Server-side user creation uses `clerkClient.users.createUser()` or relies on Clerk webhook |
| 5.5 | `getFirebaseUserByEmail` replaced | Uses `clerkClient.users.getUserList({ emailAddress })` |
| 5.6 | `checkFirebaseEmailVerified` replaced | Uses `clerkClient.users.getUser(id)` and checks `emailAddresses[].verification.status` |
| 5.7 | `createCustomToken` removed | No equivalent needed -- Clerk uses session tokens. Grep for `createCustomToken` -- zero results |
| 5.8 | `updateUserPassword` replaced | Uses `clerkClient.users.updateUser(id, { password })` |
| 5.9 | Six Firebase endpoints removed from `server/routes/auth.ts` | `/api/auth/firebase`, `/api/auth/firebase-custom-token`, `/api/auth/ensure-firebase-user`, `/api/auth/reset-password-firebase`, `/api/auth/2fa/verify-email-firebase`, `/api/auth/2fa/verify-phone-firebase` -- all return 404 |
| 5.10 | Clerk webhook endpoint added | `POST /api/webhooks/clerk` exists, verifies Svix signature, handles `user.created` and `user.updated` |
| 5.11 | Firebase auth proxy removed from `server/index.ts` | No `/__/auth/` proxy route. Grep for `__/auth` -- zero results in server code |
| 5.12 | Clerk Express middleware installed | `ClerkExpressRequireAuth()` or equivalent protects authenticated routes |
| 5.13 | `/api/auth/me` validates via Clerk | Endpoint uses Clerk session token, not Firebase ID token |
| 5.14 | Registration flow uses Clerk | `/api/auth/register` no longer calls `createFirebaseUser`; user creation handled by Clerk + webhook sync |
| 5.15 | Firebase-specific rate limiters removed | No rate limiters targeting deleted Firebase endpoints in `server/index.ts` |
| 5.16 | `firebase-admin` package status correct | Removed from `package.json` if FCM migrated; kept (messaging only) if FCM retained |

---

## 6. Client — Firebase SDK Replacement

| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 6.1 | `client/src/lib/firebase.ts` deleted | File does not exist. Grep for `from.*firebase.ts` or `from.*@/lib/firebase` -- zero results |
| 6.2 | `client/src/lib/firebaseAuth.ts` deleted | File does not exist. Grep for `from.*firebaseAuth` -- zero results |
| 6.3 | `<ClerkProvider>` wraps app | `App.tsx` or root component includes `<ClerkProvider publishableKey={...}>` |
| 6.4 | `authContext.tsx` rewritten | No imports from `firebase/auth`. Uses `useUser()`, `useAuth()`, `useSignIn()`, `useSignUp()` from `@clerk/clerk-react` |
| 6.5 | `firebaseUser` removed from context | Grep for `firebaseUser` -- zero results in client code |
| 6.6 | `onAuthStateChanged` removed | Grep for `onAuthStateChanged` -- zero results |
| 6.7 | `signInWithPopup` / `signInWithRedirect` removed | Grep for `signInWithPopup\|signInWithRedirect` -- zero results |
| 6.8 | `OAuthProvider` from Firebase removed | Grep for `OAuthProvider.*apple` -- zero results |
| 6.9 | `auth.signOut()` replaced with Clerk sign-out | Uses `clerk.signOut()` or `useClerk().signOut()` |
| 6.10 | `RecaptchaVerifier` removed | Grep for `RecaptchaVerifier` -- zero results |
| 6.11 | `signInWithPhoneNumber` removed | Grep for `signInWithPhoneNumber` -- zero results |
| 6.12 | `firebase` client package removed (or messaging-only) | `firebase` not in `package.json` dependencies, OR present but only imported for `firebase/messaging` |
| 6.13 | `@clerk/clerk-react` in dependencies | Present in `package.json` |
| 6.14 | No dead Firebase imports anywhere | Grep for `from 'firebase/` or `from "firebase/` -- zero results (except `firebase/messaging` if FCM kept) |
| 6.15 | `DailyInitModal.tsx` comment removed | No reference to "Firebase-specific fields" |
| 6.16 | Firestore dead code removed | Grep for `getFirestore`, `firestore` in client -- zero results |

---

## 7. Build, Deploy, and Smoke Test

### 7.1 Build
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 7.1.1 | `npm install` completes without errors | No missing peer dependencies, no Firebase/Clerk version conflicts |
| 7.1.2 | `npm run build` completes with zero errors | Vite build succeeds, no TypeScript errors, no missing module errors |
| 7.1.3 | No TypeScript errors related to Firebase types | `tsc --noEmit` passes clean |
| 7.1.4 | No warnings about missing Firebase env vars at build time | Build output has no `VITE_FIREBASE_*` warnings |
| 7.1.5 | Bundle size reduced | Firebase SDK (~200KB) removed from client bundle (check with `vite-bundle-visualizer` or build output) |

### 7.2 Deploy
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 7.2.1 | Docker build succeeds | `docker build` completes with Clerk build args, no Firebase auth args needed |
| 7.2.2 | Fly.io deploy succeeds | `fly deploy` completes, health check passes |
| 7.2.3 | All Clerk env vars set in Fly.io | `fly secrets list` shows `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`; build args include `VITE_CLERK_PUBLISHABLE_KEY` |
| 7.2.4 | Clerk webhook endpoint reachable | Clerk dashboard webhook test ping returns 200 from production URL |
| 7.2.5 | No Firebase auth proxy 404s in production logs | No requests hitting `/__/auth/` in server logs |

### 7.3 Smoke Test (Production)
| # | Check | Pass/Fail Criteria |
|---|-------|-------------------|
| 7.3.1 | Landing page loads | No console errors, Clerk provider initializes |
| 7.3.2 | Sign up with email/password | New account created, verification email received, can verify and access app |
| 7.3.3 | Log in with email/password | Existing user authenticates, sees dashboard |
| 7.3.4 | Sign in with Google | OAuth flow completes, user lands on dashboard |
| 7.3.5 | Sign in with Apple | OAuth flow completes, user lands on dashboard |
| 7.3.6 | Log out and log back in | Session cleared, re-login works |
| 7.3.7 | Password reset end-to-end | Forgot password > email received > new password set > login with new password |
| 7.3.8 | Protected API routes require auth | Unauthenticated requests to `/api/*` return 401, not 500 |
| 7.3.9 | Push notification opt-in works | Notification permission prompt appears, token registered (if FCM kept) |
| 7.3.10 | No Firebase errors in browser console | Console shows no `auth/invalid-api-key`, no `firebase` initialization errors |
| 7.3.11 | No Firebase errors in server logs | Server logs show no `firebase-admin` initialization warnings or auth errors |
| 7.3.12 | All existing user data intact | Spot-check: goals, daily inits, connected apps, profile data all present for migrated users |

---

## Summary Scorecard

| Section | Total Checks | Pass | Fail | N/A |
|---------|-------------|------|------|-----|
| 1. Auth Flows | 27 | | | |
| 2. Push Notifications | 7 or 6 | | | |
| 3. Database | 12 | | | |
| 4. Environment | 16 | | | |
| 5. Server | 16 | | | |
| 6. Client | 16 | | | |
| 7. Build & Deploy | 12 | | | |
| **TOTAL** | **~106** | | | |

**Migration is COMPLETE when:** All checks are PASS or N/A (with documented reason). Zero FAIL items remain.

**Rollback trigger:** If any Section 7.3 smoke test fails in production, revert deploy and re-enable Firebase auth. `firebaseUid` column and Firebase project remain active for 30 days as rollback safety net.
