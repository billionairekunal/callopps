import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ idle?: string }> }) {
  const { idle } = await searchParams;
  return <LoginForm notice={idle ? "You were signed out after being idle." : undefined} />;
}
