"use client";

import { RecuperarCarrito } from "@/components/recuperar-carrito";
import { useParams } from "next/navigation";

export default function RecoveryPage() {
  const { codigo } = useParams<{ codigo: string }>();
  return <RecuperarCarrito key={codigo} codigo={codigo} />;
}
