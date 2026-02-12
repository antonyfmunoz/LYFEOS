import { useEffect } from "react";
import { useLocation } from "wouter";

export default function LoginSuccessPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    sessionStorage.removeItem("login_success_username");
    sessionStorage.removeItem("login_success_new_user");
    sessionStorage.setItem("lyfeos_login_toast_done", "true");

    localStorage.setItem("lyfeos-ceremony-mode", "login");
    navigate("/ceremony", { replace: true });
  }, []);

  return (
    <div className="min-h-screen bg-background" />
  );
}
