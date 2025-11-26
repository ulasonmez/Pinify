import { Timestamp } from "firebase/firestore";

export interface User {
    id: string;
    username: string;
    displayName: string;
    email: string;
    friends: string[];
    createdAt: Timestamp;
}

export interface Place {
    id: string;
    ownerId: string;
    name: string;
    city: string;
    district: string;
    categories: string[];
    googlePlaceId?: string;
    location: {
        lat: number;
        lng: number;
    };
    avgRating: number;
    ratingCount: number;
    createdAt: Timestamp;
    userRating?: number; // Rating given by the specific user (for profile view)
}

export interface Review {
    id: string;
    placeId: string;
    userId: string;
    username: string;
    rating: number;
    comment: string;
    createdAt: Timestamp;
}

export interface FriendRequest {
    id: string;
    senderId: string;
    receiverId: string;
    status: "pending" | "accepted" | "rejected";
    createdAt: Timestamp;
}
