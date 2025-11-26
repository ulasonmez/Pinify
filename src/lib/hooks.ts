import useSWR from 'swr';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { User, Place, FriendRequest } from './types';

// Fetcher for getting a single user by username
const profileFetcher = async (username: string) => {
    const q = query(collection(db, "users"), where("username", "==", username));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    return querySnapshot.docs[0].data() as User;
};

export function useProfile(username: string | null) {
    const { data, error, isLoading, mutate } = useSWR(
        username ? `profile/${username}` : null,
        () => profileFetcher(username!)
    );

    return {
        profileUser: data,
        isLoading,
        isError: error,
        mutate
    };
}

// Fetcher for getting current user data by UID
const currentUserFetcher = async (uid: string) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
        return userDoc.data() as User;
    }
    return null;
};

export function useCurrentUser(uid: string | undefined) {
    const { data, error, isLoading, mutate } = useSWR(
        uid ? `currentUser/${uid}` : null,
        () => currentUserFetcher(uid!)
    );

    return {
        currentUserData: data,
        isLoading,
        isError: error,
        mutate
    };
}

// Fetcher for getting places by user's addedPlaces subcollection
const placesFetcher = async (userId: string) => {
    // 1. Get list of place IDs and user ratings from users/{userId}/addedPlaces
    const addedPlacesSnapshot = await getDocs(collection(db, "users", userId, "addedPlaces"));
    if (addedPlacesSnapshot.empty) return [];

    // Map placeId to user's rating
    const userRatings: Record<string, number> = {};
    const placeIds = addedPlacesSnapshot.docs.map(doc => {
        const data = doc.data();
        if (data.rating) {
            userRatings[doc.id] = data.rating;
        }
        return doc.id;
    });

    // 2. Fetch the actual place documents
    // Using Promise.all for simplicity and to avoid 'in' query limits
    const placesData = await Promise.all(placeIds.map(async (placeId) => {
        const placeDoc = await getDoc(doc(db, "places", placeId));
        if (placeDoc.exists()) {
            const placeData = placeDoc.data() as Place;
            // Merge user's specific rating if available
            return {
                ...placeData,
                id: placeDoc.id,
                userRating: userRatings[placeId]
            } as Place;
        }
        return null;
    }));

    return placesData.filter((p): p is Place => p !== null);
};

export function useUserPlaces(userId: string | undefined) {
    const { data, error, isLoading, mutate } = useSWR(
        userId ? `places/${userId}` : null,
        () => placesFetcher(userId!)
    );

    return {
        places: data || [],
        isLoading,
        isError: error,
        mutate // Expose mutate to allow manual revalidation (e.g., after delete)
    };
}

// Fetcher for getting friends list
const friendsFetcher = async (friendIds: string[]) => {
    if (friendIds.length === 0) return [];
    // Note: For large lists, this should be batched or paginated.
    // Firestore 'in' query supports up to 10 items. For now, we'll fetch individually in parallel
    // as per the previous implementation, but SWR will cache the result.
    const friendsData = await Promise.all(friendIds.map(async (friendId) => {
        const friendDoc = await getDoc(doc(db, "users", friendId));
        if (friendDoc.exists()) {
            return friendDoc.data() as User;
        }
        return null;
    }));
    return friendsData.filter((f): f is User => f !== null);
};

export function useUserFriends(friendIds: string[] | undefined, shouldFetch: boolean) {
    const { data, error, isLoading } = useSWR(
        shouldFetch && friendIds ? `friends/${friendIds.join(',')}` : null,
        () => friendsFetcher(friendIds!)
    );

    return {
        friendsList: data || [],
        isLoading,
        isError: error
    };
}

// Fetcher for incoming friend requests
const incomingRequestsFetcher = async (userId: string) => {
    const q = query(
        collection(db, "friend_requests"),
        where("receiverId", "==", userId),
        where("status", "==", "pending")
    );
    const querySnapshot = await getDocs(q);

    const requestsWithSenders = await Promise.all(querySnapshot.docs.map(async (reqDoc) => {
        const reqData = reqDoc.data() as FriendRequest;
        const senderDoc = await getDoc(doc(db, "users", reqData.senderId));
        const senderData = senderDoc.data() as User;
        return { ...reqData, id: reqDoc.id, sender: senderData };
    }));
    return requestsWithSenders;
};

export function useIncomingRequests(userId: string | undefined) {
    const { data, error, isLoading, mutate } = useSWR(
        userId ? `incomingRequests/${userId}` : null,
        () => incomingRequestsFetcher(userId!)
    );

    return {
        incomingRequests: data || [],
        isLoading,
        isError: error,
        mutate
    };
}
