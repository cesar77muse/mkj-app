import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import mkjLogo from "@/assets/mkj-logo.jpg";
import { PasswordRequirements } from "@/components/password-requirements";
import { PASSWORD_MIN_LENGTH, isPasswordValid } from "@/lib/password-policy";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — MKJ Ops" },
      { name: "description", content: "Sign in to MKJ Ops." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/dashboard", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordValid(password)) return toast.error("Password does not meet the requirements.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      toast.success("Account created. Welcome!");
      navigate({ to: "/dashboard", replace: true });
      return;
    }
    toast.success("Account created. Check your email to confirm before signing in.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex flex-col items-center justify-center gap-3">
          <div className="flex h-12 items-center justify-center rounded-lg bg-white px-3">
            <img src={mkjLogo} alt="MKJ Communications" className="h-9 w-auto object-contain" />
          </div>
          <span className="text-2xl font-semibold tracking-tight">MKJ Ops</span>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Access the operations dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form className="space-y-4" onSubmit={signIn}>
                  <div className="space-y-2">
                    <Label htmlFor="email-in">Email</Label>
                    <Input id="email-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-in">Password</Label>
                    <Input id="pw-in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form className="space-y-4" onSubmit={signUp}>
                  <div className="space-y-2">
                    <Label htmlFor="name-up">Full name</Label>
                    <Input id="name-up" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-up">Email</Label>
                    <Input id="email-up" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-up">Password</Label>
                    <Input id="pw-up" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
                    <PasswordRequirements value={password} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
                  <p className="text-xs text-muted-foreground">
                    The first account created becomes the Admin. Ask your admin to assign role and projects for later accounts.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © 2026 JCL Industries. All rights reserved.
        </p>
      </div>
    </div>
  );
}
