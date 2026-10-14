import { AuthForm } from "@/components/auth-form";

export default async function RegistroPage({
  searchParams,
}: { searchParams: Promise<{ next?: string }> }) {
  return <AuthForm modo="registro" destino={(await searchParams).next} />;
}
