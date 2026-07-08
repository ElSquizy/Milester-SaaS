"use client";
import { useEffect } from "react";

export default function PromotionChecker() {
  useEffect(() => {
    // Check on app load
    fetch("/api/check-promotions", { method: "POST" });
  }, []);

  return null;
}
