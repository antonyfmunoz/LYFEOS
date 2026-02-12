import { useEffect } from "react";
import { useLocation } from "wouter";
import { useCelebration } from "@/lib/celebrationContext";

export default function LoginSuccessPage() {
  const [, navigate] = useLocation();
  const { triggerCelebration } = useCelebration();

  useEffect(() => {
    const username = sessionStorage.getItem("login_success_username");
    sessionStorage.removeItem("login_success_username");
    sessionStorage.removeItem("login_success_new_user");

    triggerCelebration({
      type: "mission_complete",
      title: username ? `Welcome back, ${username}!` : "Welcome back!",
      xp: 0,
    });

    sessionStorage.setItem("lyfeos_login_toast_done", "true");

    const navTimer = setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, 600);

    return () => clearTimeout(navTimer);
  }, []);

  return (
    <div className="min-h-screen bg-background" />
  );
}
