import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  return <AuthForm modo="login" destino={(await searchParams).next} />;
}
