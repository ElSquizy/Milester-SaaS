import { NextResponse } from "next/server";
import { findCustomerMatches } from "@/lib/localOrders";

/**
 * POST { name?, email?, phone? } → candidate existing customers.
 * Used while typing a manual ticket so the sale attaches to the real person
 * instead of creating a near-duplicate account.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const matches = await findCustomerMatches({ name: body.name, email: body.email, phone: body.phone });
  return NextResponse.json(matches);
}
