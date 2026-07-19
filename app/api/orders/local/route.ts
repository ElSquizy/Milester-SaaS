import { NextResponse } from "next/server";
import { createTicket, listOpenTickets } from "@/lib/localOrders";

/** GET: the open manual tickets (pending payment or paid, not yet delivered). */
export async function GET() {
  const tickets = await listOpenTickets();
  return NextResponse.json(tickets);
}

/** POST: create a manual ticket. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const order = await createTicket(body);
    return NextResponse.json(order);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
