import { useEffect } from "react";
import { useLocation } from "wouter";

export default function LoginSuccessPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    sessionStorage.removeItem("login_success_username");
    sessionStorage.removeItem("login_success_new_user");
    const today = new Date().toDateString();
    const lastCeremonyDate = localStorage.getItem("lyfeos_ceremony_date");

    if (lastCeremonyDate === today) {
      sessionStorage.setItem("lyfeos_ceremony_complete", "true");
      navigate("/dashboard", { replace: true });
    } else {
      localStorage.setItem("lyfeos_ceremony_date", today);
      localStorage.setItem("lyfeos-ceremony-mode", "login");
      navigate("/ceremony", { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen bg-background" />
  );
}
