"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteProductButton({ productId }: { productId: number }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("¿Eliminar este producto? Esta acción no eliminará el producto de Tienda Nube.")) return;
    setDeleting(true);
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    router.push("/products");
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      {deleting ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
