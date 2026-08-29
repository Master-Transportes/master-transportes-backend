import type { IRideEventPublisher } from "./contracts/IRideEventPublisher";
import { ensureChannel } from "@/infra/messaging/connection";

const EXCHANGE = "ride.exchange";

export const rideEventPublisher: IRideEventPublisher = {
  async publishRideRequested(data) {
    const ch = await ensureChannel(EXCHANGE);
    return ch.publish(EXCHANGE, "ride.requested", Buffer.from(JSON.stringify(data)), { persistent: true });
  },

  async publishOfferAccepted(data) {
    const ch = await ensureChannel(EXCHANGE);
    return ch.publish(EXCHANGE, "ride.offer.accepted", Buffer.from(JSON.stringify(data)), { persistent: true });
  },

  async publishOfferRejected(data) {
    const ch = await ensureChannel(EXCHANGE);
    return ch.publish(EXCHANGE, "ride.offer.rejected", Buffer.from(JSON.stringify(data)), { persistent: true });
  },

  async publishRideCancelled(data) {
    const ch = await ensureChannel(EXCHANGE);
    return ch.publish(EXCHANGE, "ride.cancelled", Buffer.from(JSON.stringify(data)), { persistent: true });
  },
};
