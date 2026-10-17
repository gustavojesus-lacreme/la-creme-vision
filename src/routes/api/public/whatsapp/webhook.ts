import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import { z } from "zod";

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("WhatsApp not configured", { status: 503 });
        const deliveryId = request.headers.get("x-lovable-delivery")?.trim();
        const event = request.headers.get("x-lovable-event")?.trim();
        if (!deliveryId || !event || deliveryId.length > 256 || event.length > 128) return new Response("Missing delivery headers", { status: 400 });
        let payload;
        try {
          const verified = await verifyWebhookRequest({ req: request, secret, maxBodyBytes: 4 * 1024 * 1024,
            parser: (body) => z.record(z.unknown()).parse(JSON.parse(body)),
          });
          payload = verified.payload;
        } catch {
          return new Response("Invalid webhook", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const stored = await supabaseAdmin.from("whatsapp_webhook_events").upsert({
          delivery_id: deliveryId, event, payload: payload as import("@/integrations/supabase/types").Json,
        }, { onConflict: "delivery_id", ignoreDuplicates: true });
        if (stored.error) return new Response("Receipt persistence failed", { status: 503 });
        // Invoked on every verified delivery: bounded, fair recovery; unmatched
        // statuses are durable separately and reconciled when provider IDs arrive.
        const recovery = await supabaseAdmin.rpc("recover_whatsapp_events");
        if (recovery.error) return new Response("Processing failed", { status: 503 });
        const receipt = await supabaseAdmin.from("whatsapp_webhook_events")
          .select("processed_at").eq("delivery_id", deliveryId).single();
        if (receipt.error || !receipt.data.processed_at) return new Response("Processing pending", { status: 503 });
        return new Response("ok", { status: 200 });
      },
    },
  },
});