import { useState } from "react";
import { Loader2, Phone, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type BridgeDevice = {
  id: string;
  displayName: string;
  status: "pairing" | "active" | "revoked" | "error";
  permissions: { read: boolean; send: boolean };
  lastSeenAt: string | null;
};

export default function IMessageBridgeConnection({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const [pairing, setPairing] = useState<{ pairingCode: string; expiresAt: string } | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const { data, isLoading } = useQuery<{ devices: BridgeDevice[] }>({ queryKey: ["/api/message-bridge/status"], enabled });

  const pairMac = async () => {
    setIsPairing(true);
    try {
      const result = await apiRequest<{ pairingCode: string; expiresAt: string }>("/api/message-bridge/pairings", {
        method: "POST",
        body: JSON.stringify({ displayName: "My Mac", permissions: { read: true, send: true } }),
      });
      setPairing(result);
      await queryClient.invalidateQueries({ queryKey: ["/api/message-bridge/status"] });
      toast({ title: "Mac pairing code ready", description: "It expires in ten minutes and is only for your user-owned Mac companion." });
    } catch (error: any) {
      toast({ title: "Could not create Mac pairing", description: error?.message || "Your Messages connection was not changed.", variant: "destructive" });
    } finally { setIsPairing(false); }
  };

  const revoke = async (id: string) => {
    setRevokingId(id);
    try {
      await apiRequest(`/api/message-bridge/devices/${id}/revoke`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["/api/message-bridge/status"] });
      toast({ title: "Mac bridge disconnected", description: "It can no longer read from or send through LyfeOS." });
    } catch (error: any) {
      toast({ title: "Could not disconnect Mac bridge", description: error?.message || "The connection was not changed.", variant: "destructive" });
    } finally { setRevokingId(null); }
  };

  const devices = (data?.devices || []).filter((device) => device.status !== "revoked");
  return <div className="rounded-lg bg-card/50 p-3 transition-colors hover:bg-card/70">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start"><Phone className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><span className="text-sm">iMessage</span><p className="text-xs text-muted-foreground">A private Mac bridge places personal iMessage threads in the unified Messages inbox. Your Apple Account password never enters LyfeOS.</p></div></div>
      <button type="button" onClick={() => void pairMac()} disabled={isPairing} className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-mono text-primary transition-colors hover:bg-primary/20 disabled:opacity-50">{isPairing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />}Pair Mac</button>
    </div>
    {pairing ? <div className="mt-3 rounded border border-primary/20 bg-background/35 p-3"><p className="text-[11px] text-muted-foreground">Enter this one-time code into LyfeOS Messages Bridge on your Mac. It expires {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p><code className="mt-2 block break-all rounded border border-primary/15 bg-background px-2 py-2 text-xs text-primary">{pairing.pairingCode}</code><p className="mt-2 text-[10px] text-muted-foreground">The Mac requests Full Disk Access for Messages history and Automation permission before it can send. Revoke it here at any time.</p></div> : null}
    {isLoading ? <p className="mt-3 text-xs text-muted-foreground">Checking private Mac bridges…</p> : devices.map((device) => <div key={device.id} className="mt-3 flex items-center justify-between gap-3 border-t border-primary/10 pt-3"><div><p className="text-xs text-foreground">{device.displayName}</p><p className="text-[10px] text-muted-foreground">{device.status === "active" ? `Connected · ${device.permissions.read ? "read" : "no read"} · ${device.permissions.send ? "send" : "no send"}` : "Waiting for this Mac to pair"}{device.lastSeenAt ? ` · active ${new Date(device.lastSeenAt).toLocaleString()}` : ""}</p></div><button type="button" onClick={() => void revoke(device.id)} disabled={revokingId !== null} className="inline-flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-mono text-destructive hover:bg-destructive/20 disabled:opacity-50">{revokingId === device.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}Disconnect</button></div>)}
  </div>;
}
