export interface IRideEventPublisher {
  publishRideRequested(data: {
    rideId: string;
    passengerId: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    originName: string;
    destinationName: string;
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
