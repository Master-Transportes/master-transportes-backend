export interface IRideEventPublisher {
  publishRideRequested(data: {
    rideId: string;
    passengerId: string;
    origin: { name: string; lat: number; lng: number };
    destination: { name: string; lat: number; lng: number };
    timestamp: string;
  }): Promise<boolean>;

  publishRideCancelled(data: {
    rideId: string;
    passengerId: string;
    timestamp: string;
  }): Promise<boolean>;

  publishOfferAccepted(data: {
    rideId: string;
    offerId: string;
    driverId: string;
    timestamp: string;
  }): Promise<boolean>;
}
