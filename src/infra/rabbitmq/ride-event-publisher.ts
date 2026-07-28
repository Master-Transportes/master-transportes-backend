import { publishRideRequested, publishRideCancelled, publishOfferAccepted } from "@/infra/rabbitmq/ride-publisher";
import type { IRideEventPublisher } from "@/contracts/IRideEventPublisher";

export class RabbitRideEventPublisher implements IRideEventPublisher {
  async publishRideRequested(data: {
    rideId: string;
    passengerId: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    originName: string;
    destinationName: string;
    timestamp: string;
  }): Promise<boolean> {
    return publishRideRequested(data);
  }

  async publishRideCancelled(data: {
    rideId: string;
    passengerId: string;
    timestamp: string;
  }): Promise<boolean> {
    return publishRideCancelled(data);
  }

  async publishOfferAccepted(data: {
    rideId: string;
    offerId: string;
    driverId: string;
    timestamp: string;
  }): Promise<boolean> {
    return publishOfferAccepted(data);
  }
}

export const rideEventPublisher = new RabbitRideEventPublisher();
