import { useState } from "react";
import { CheckCircle2, Copy, Check, Share2, Rocket } from "lucide-react";

export default function WaitlistThankYouPage() {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/waitlist`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "LYFEOS - Your Life. Gamified.",
          text: "Check out LYFEOS — an AI-powered life operating system that turns your goals into quests!",
          url: shareUrl,
        });
      } catch {}
    } else {
      handleCopy();
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-6">
            <Rocket className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-orbitron font-bold text-foreground">
              LYFE<span className="text-primary">OS</span>
            </h1>
          </div>
        </div>

        <div className="glassmorphic rounded-xl p-8 text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>

          <h2 className="text-xl font-orbitron font-bold text-foreground mb-3">
            You're <span className="text-primary">In</span>
          </h2>

          <p className="text-muted-foreground mb-2">
            Thank you for joining the LYFEOS waitlist!
          </p>
          <p className="text-sm text-muted-foreground/70">
            We'll notify you as soon as we're ready to launch. Stay tuned for something special.
          </p>
        </div>

        <div className="glassmorphic rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4 justify-center">
            <Share2 className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-orbitron text-foreground">Share with a Friend</h3>
          </div>

          <p className="text-sm text-muted-foreground text-center mb-4">
            Know someone who'd love to level up their life? Share the link below.
          </p>

          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-muted-foreground truncate">
              {shareUrl}
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              title="Copy link"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {typeof navigator.share === "function" && (
            <button
              onClick={handleShare}
              className="w-full mt-3 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground/40 text-center mt-8">
          We respect your privacy. No spam, ever.
        </p>
      </div>
    </div>
  );
}
