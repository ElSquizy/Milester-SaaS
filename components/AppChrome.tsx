"use client";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// Renders the app sidebar everywhere except the standalone auth screens.
export default function AppChrome() {
  const path = usePathname();
  if (path === "/login" || path === "/maintenance") return null;
  return <Sidebar />;
}
