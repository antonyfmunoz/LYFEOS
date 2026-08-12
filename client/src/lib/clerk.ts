export const clerkPubKey = (window as Window & {
  __LYFEOS_RUNTIME_CONFIG__?: { clerkPublishableKey?: string };
}).__LYFEOS_RUNTIME_CONFIG__?.clerkPublishableKey || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
