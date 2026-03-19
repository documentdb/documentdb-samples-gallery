export interface HotelAddress {
  StreetAddress?: string;
  City?: string;
  StateProvince?: string;
  PostalCode?: string;
  Country?: string;
}

export interface Hotel {
  HotelId: string;
  HotelName: string;
  Description: string;
  Category: string;
  Tags: string[];
  ParkingIncluded: boolean;
  Rating: number;
  Address?: HotelAddress;
}

export interface HotelDocument extends Hotel {
  embedding?: number[];
}

export interface SearchResult {
  hotel: Hotel;
  score: number;
}
