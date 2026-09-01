type ClerkExternalAccount = {
  provider?: string | null;
};

const GOOGLE_EXTERNAL_ACCOUNT_PROVIDERS = new Set([
  "google",
  "oauth_google",
]);

export function isGoogleExternalAccount(account: ClerkExternalAccount): boolean {
  const provider = account.provider?.trim().toLowerCase();
  return provider ? GOOGLE_EXTERNAL_ACCOUNT_PROVIDERS.has(provider) : false;
}

export function hasGoogleExternalAccount(accounts: readonly ClerkExternalAccount[]): boolean {
  return accounts.some(isGoogleExternalAccount);
}
