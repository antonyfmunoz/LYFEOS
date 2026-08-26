import Anthropic from "@anthropic-ai/sdk";
import type { OrchestrationGenerator } from "./ai-orchestration";
import { buildOrchestrationPrompt } from "./ai-orchestration";

export type AIExecutionMode = "local" | "hybrid" | "cloud";
export type AIProviderId = "self_hosted" | "anthropic";

export interface AIExecutionPolicy {
  executionMode: AIExecutionMode;
  preferredProvider: AIProviderId;
  cloudFallbackEnabled: boolean;
}

export interface AIProviderAvailability {
  id: AIProviderId;
  label: string;
  boundary: "installation_controlled" | "external_cloud";
  configured: boolean;
  model: string | null;
}

function selfHostedConfiguration(): { baseUrl: string; apiKey?: string; model: string } | null {
  const raw = process.env.LYFEOS_SELF_HOSTED_AI_BASE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && localDevelopment)) return null;
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    apiKey: process.env.LYFEOS_SELF_HOSTED_AI_API_KEY?.trim() || undefined,
    model: process.env.LYFEOS_SELF_HOSTED_AI_MODEL?.trim() || "installation-default",
  };
}

export function listAIProviderAvailability(): AIProviderAvailability[] {
  const local = selfHostedConfiguration();
  const cloudModel = process.env.LYFEOS_ORCHESTRATION_MODEL?.trim() || "claude-haiku-4-5";
  return [
    { id: "self_hosted", label: "Installation-controlled model", boundary: "installation_controlled", configured: Boolean(local), model: local?.model || null },
    { id: "anthropic", label: "Anthropic cloud", boundary: "external_cloud", configured: Boolean(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim()), model: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim() ? cloudModel : null },
  ];
}

function createSelfHostedGenerator(): OrchestrationGenerator | null {
  const configuration = selfHostedConfiguration();
  if (!configuration) return null;
  return {
    async generate(input) {
      const prompt = buildOrchestrationPrompt(input);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      try {
        const response = await fetch(`${configuration.baseUrl}/chat/completions`, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(configuration.apiKey ? { Authorization: `Bearer ${configuration.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: configuration.model,
            temperature: 0.2,
            max_tokens: 800,
            messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
          }),
        });
        if (!response.ok) throw new Error(`AI_SELF_HOSTED_HTTP_${response.status}`);
        const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const output = body.choices?.[0]?.message?.content?.trim() || "";
        if (!output) throw new Error("AI_ORCHESTRATION_EMPTY_OUTPUT");
        return { output, provider: "self_hosted", model: configuration.model };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function createAnthropicGenerator(): OrchestrationGenerator | null {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.LYFEOS_ORCHESTRATION_MODEL?.trim() || "claude-haiku-4-5";
  const client = new Anthropic({ apiKey, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
  return {
    async generate(input) {
      const prompt = buildOrchestrationPrompt(input);
      const response = await client.messages.create({ model, max_tokens: 800, system: prompt.system, messages: [{ role: "user", content: prompt.user }] });
      const output = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
      if (!output) throw new Error("AI_ORCHESTRATION_EMPTY_OUTPUT");
      return { output, provider: "anthropic", model };
    },
  };
}

export function resolveOrchestrationGenerator(policy: AIExecutionPolicy): {
  generator: OrchestrationGenerator | null;
  resolution: { requestedMode: AIExecutionMode; selectedProvider: AIProviderId | null; usedCloudFallback: boolean; failureCode: string | null };
} {
  if (policy.executionMode === "local") {
    const generator = createSelfHostedGenerator();
    return { generator, resolution: { requestedMode: "local", selectedProvider: generator ? "self_hosted" : null, usedCloudFallback: false, failureCode: generator ? null : "self_hosted_not_configured" } };
  }
  if (policy.executionMode === "cloud") {
    const generator = createAnthropicGenerator();
    return { generator, resolution: { requestedMode: "cloud", selectedProvider: generator ? "anthropic" : null, usedCloudFallback: false, failureCode: generator ? null : "cloud_not_configured" } };
  }
  const local = createSelfHostedGenerator();
  if (local) return { generator: local, resolution: { requestedMode: "hybrid", selectedProvider: "self_hosted", usedCloudFallback: false, failureCode: null } };
  if (policy.cloudFallbackEnabled) {
    const cloud = createAnthropicGenerator();
    return { generator: cloud, resolution: { requestedMode: "hybrid", selectedProvider: cloud ? "anthropic" : null, usedCloudFallback: Boolean(cloud), failureCode: cloud ? null : "no_configured_provider" } };
  }
  return { generator: null, resolution: { requestedMode: "hybrid", selectedProvider: null, usedCloudFallback: false, failureCode: "self_hosted_not_configured_fallback_disabled" } };
}
