import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Component, type ErrorInfo, type ReactNode } from "react";
import App from "./App";
import { AppErrorFallback } from "./components/AppErrorFallback";
import { captureSentryException } from "./instrument";
import { queryClient } from "./lib/queryClient";

const runtimeConfig = (window as Window & { __LYFEOS_RUNTIME_CONFIG__?: { clerkPublishableKey?: string; }; }).__LYFEOS_RUNTIME_CONFIG__;
const PUBLISHABLE_KEY = runtimeConfig?.clerkPublishableKey || import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) throw new Error("Missing Publishable Key");

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown, _info: ErrorInfo) { void captureSentryException(error); }
  render() { return this.state.error ? <AppErrorFallback error={this.state.error} /> : this.props.children; }
}

export default function AppBootstrap({ clerkJSVersion }: { clerkJSVersion: string }) {
  return <ClerkProvider publishableKey={PUBLISHABLE_KEY} clerkJSVersion={clerkJSVersion}><QueryClientProvider client={queryClient}><AppErrorBoundary><App /></AppErrorBoundary></QueryClientProvider></ClerkProvider>;
}
