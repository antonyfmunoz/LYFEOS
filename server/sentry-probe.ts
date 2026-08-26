export const sentryProbeMessage = "LyfeOS production observability probe";

export type SentryProbeClient = {
  captureException: (exception: Error, captureContext: {
    level: "error";
    tags: Record<string, string>;
  }) => string;
  flush: (timeout: number) => Promise<boolean>;
};

export type SentryProbeResult = {
  status: "sent" | "transport_unconfirmed";
  eventId: string;
};

export async function sendSentryProbe(client: SentryProbeClient): Promise<SentryProbeResult> {
  const error = new Error(sentryProbeMessage);
  error.name = "LyfeOSObservabilityProbe";
  const eventId = client.captureException(error, {
    level: "error",
    tags: {
      subsystem: "operations",
      probe: "manual",
      contains_user_data: "false",
    },
  });
  const flushed = await client.flush(2_000);
  return {
    status: flushed ? "sent" : "transport_unconfirmed",
    eventId,
  };
}
