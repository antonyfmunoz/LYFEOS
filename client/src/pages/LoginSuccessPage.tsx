import { useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function LoginSuccessPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const username = sessionStorage.getItem("login_success_username");
    sessionStorage.removeItem("login_success_username");
    sessionStorage.removeItem("login_success_new_user");

    toast({
      title: "Login Successful",
      description: username ? `Welcome back, ${username}!` : "Welcome back!",
      variant: "default",
      duration: 1500,
    });

    const loginToastDoneTimer = setTimeout(() => {
      sessionStorage.setItem("lyfeos_login_toast_done", "true");
    }, 1600);

    const navTimer = setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, 600);

    return () => {
      clearTimeout(loginToastDoneTimer);
      clearTimeout(navTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background" />
  );
}
