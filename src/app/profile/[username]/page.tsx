"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useProfile, useUserPlaces, useUserFriends, useIncomingRequests } from "@/lib/hooks";
import Link from "next/link";

export default function ProfilePage() {
    const { username } = useParams();
    // Ensure username is a string
    const usernameStr = Array.isArray(username) ? username[0] : username;

    const { user: currentUser } = useAuth();

    // Data Fetching Hooks
    const { profileUser, isLoading: loadingProfile, mutate: mutateProfile } = useProfile(usernameStr || null);
    const { places, mutate: mutatePlaces } = useUserPlaces(profileUser?.id);
    const { incomingRequests, mutate: mutateRequests } = useIncomingRequests(currentUser?.uid === profileUser?.id ? currentUser?.uid : undefined);

    const [isFriend, setIsFriend] = useState(false);
    const [requestStatus, setRequestStatus] = useState<"none" | "pending" | "received">("none");

    // Add Friend Modal State
    const [showAddFriendModal, setShowAddFriendModal] = useState(false);
    const [targetUsername, setTargetUsername] = useState("");
    const [addFriendError, setAddFriendError] = useState("");
    const [addFriendSuccess, setAddFriendSuccess] = useState("");

    // Friends List Modal State
    const [showFriendsModal, setShowFriendsModal] = useState(false);
    // Lazy fetch friends only when modal is open
    const { friendsList, isLoading: loadingFriends } = useUserFriends(profileUser?.friends, showFriendsModal);

    // Places List Modal State
    const [showPlacesModal, setShowPlacesModal] = useState(false);

    // Delete Place State
    const [placeToDelete, setPlaceToDelete] = useState<string | null>(null);

    // Delete Friend State
    const [friendToDelete, setFriendToDelete] = useState<string | null>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setShowFriendsModal(false);
                setShowPlacesModal(false);
                setShowAddFriendModal(false);
                setPlaceToDelete(null);
                setFriendToDelete(null);
            }
        };

        if (showFriendsModal || showPlacesModal || showAddFriendModal || placeToDelete || friendToDelete) {
            window.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [showFriendsModal, showPlacesModal, showAddFriendModal, placeToDelete, friendToDelete]);

    // Check friendship status
    useEffect(() => {
        const checkFriendship = async () => {
            if (!currentUser || !profileUser) return;

            if (profileUser.friends.includes(currentUser.uid)) {
                setIsFriend(true);
            } else {
                // Check for pending requests sent by current user
                const sentQ = query(
                    collection(db, "friend_requests"),
                    where("senderId", "==", currentUser.uid),
                    where("receiverId", "==", profileUser.id),
                    where("status", "==", "pending")
                );
                const sentSnapshot = await getDocs(sentQ);
                if (!sentSnapshot.empty) {
                    setRequestStatus("pending");
                }
            }
        };
        checkFriendship();
    }, [currentUser, profileUser]);

    const handleSendRequest = async () => {
        if (!currentUser || !profileUser) return;

        try {
            await addDoc(collection(db, "friend_requests"), {
                senderId: currentUser.uid,
                receiverId: profileUser.id,
                status: "pending",
                createdAt: serverTimestamp(),
            });

            setRequestStatus("pending");
        } catch (error) {
            console.error("Error sending friend request:", error);
        }
    };

    const handleSendRequestByUsername = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        setAddFriendError("");
        setAddFriendSuccess("");

        const lowerTargetUsername = targetUsername.toLowerCase().replace(/\s/g, "");

        if (lowerTargetUsername === currentUser.displayName?.toLowerCase()) {
            setAddFriendError("You cannot add yourself.");
            return;
        }

        try {
            // 1. Find user by username
            const q = query(collection(db, "users"), where("username", "==", lowerTargetUsername));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setAddFriendError("User not found.");
                return;
            }

            const targetUserDoc = querySnapshot.docs[0];
            const targetUser = targetUserDoc.data();

            // 2. Check if already friends
            if (targetUser.friends.includes(currentUser.uid)) {
                setAddFriendError("You are already friends.");
                return;
            }

            // 3. Check for existing request
            const sentQ = query(
                collection(db, "friend_requests"),
                where("senderId", "==", currentUser.uid),
                where("receiverId", "==", targetUser.id),
                where("status", "==", "pending")
            );
            const sentSnapshot = await getDocs(sentQ);
            if (!sentSnapshot.empty) {
                setAddFriendError("Friend request already sent.");
                return;
            }

            // Check if they sent us a request
            const receivedQ = query(
                collection(db, "friend_requests"),
                where("senderId", "==", targetUser.id),
                where("receiverId", "==", currentUser.uid),
                where("status", "==", "pending")
            );
            const receivedSnapshot = await getDocs(receivedQ);
            if (!receivedSnapshot.empty) {
                setAddFriendError("This user has already sent you a request.");
                return;
            }

            // 4. Send Request
            await addDoc(collection(db, "friend_requests"), {
                senderId: currentUser.uid,
                receiverId: targetUser.id,
                status: "pending",
                createdAt: serverTimestamp(),
            });

            setAddFriendSuccess(`Friend request sent to ${targetUser.username}!`);
            setTargetUsername("");
            setTimeout(() => {
                setShowAddFriendModal(false);
                setAddFriendSuccess("");
            }, 2000);

        } catch (error) {
            console.error("Error sending request:", error);
            setAddFriendError("Failed to send request.");
        }
    };

    const handleAcceptRequest = async (requestId: string, senderId: string) => {
        if (!currentUser) return;
        try {
            const batch = writeBatch(db);

            // 1. Update request status
            const requestRef = doc(db, "friend_requests", requestId);
            batch.update(requestRef, { status: "accepted" });

            // 2. Add to friends lists
            const currentUserRef = doc(db, "users", currentUser.uid);
            batch.update(currentUserRef, { friends: arrayUnion(senderId) });

            const senderRef = doc(db, "users", senderId);
            batch.update(senderRef, { friends: arrayUnion(currentUser.uid) });

            await batch.commit();

            // 3. Update UI
            mutateRequests();
            mutateProfile();
        } catch (error) {
            console.error("Error accepting request:", error);
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        try {
            await updateDoc(doc(db, "friend_requests", requestId), {
                status: "rejected"
            });
            mutateRequests();
        } catch (error) {
            console.error("Error rejecting request:", error);
        }
    };

    const handleDeletePlace = async () => {
        if (!placeToDelete) return;

        try {
            // Remove reference from user's addedPlaces
            if (currentUser) {
                await deleteDoc(doc(db, "users", currentUser.uid, "addedPlaces", placeToDelete));
            }
            // Note: We do NOT delete the actual place document from 'places' collection
            // because other users might have added it.

            mutatePlaces();
            setPlaceToDelete(null);
        } catch (error) {
            console.error("Error deleting place:", error);
        }
    };

    const handleDeleteFriend = async () => {
        if (!friendToDelete || !currentUser || !profileUser) return;

        try {
            const batch = writeBatch(db);

            // 1. Remove friend from current user's friends list
            const currentUserRef = doc(db, "users", currentUser.uid);
            batch.update(currentUserRef, { friends: arrayRemove(friendToDelete) });

            // 2. Remove current user from friend's friends list
            const friendRef = doc(db, "users", friendToDelete);
            batch.update(friendRef, { friends: arrayRemove(currentUser.uid) });

            await batch.commit();

            // 3. Update UI
            mutateProfile();
            setFriendToDelete(null);
        } catch (error) {
            console.error("Error deleting friend:", error);
        }
    };

    // Filter State
    const [filterCity, setFilterCity] = useState("");
    const [filterDistrict, setFilterDistrict] = useState("");
    const [filterCategory, setFilterCategory] = useState("");
    const [filterRating, setFilterRating] = useState<number | "">("");

    // Derived State for Unique Filter Options
    const uniqueCities = Array.from(new Set(places.map(p => p.city))).sort();
    const uniqueDistricts = Array.from(new Set(places.map(p => p.district))).sort();
    const uniqueCategories = Array.from(new Set(places.flatMap(p => p.categories))).sort();

    // Filtered Places
    const filteredPlaces = places.filter(place => {
        const matchesCity = filterCity ? place.city === filterCity : true;
        const matchesDistrict = filterDistrict ? place.district === filterDistrict : true;
        const matchesCategory = filterCategory ? place.categories.includes(filterCategory) : true;
        const matchesRating = filterRating ? (place.userRating || place.avgRating) >= Number(filterRating) : true;
        return matchesCity && matchesDistrict && matchesCategory && matchesRating;
    });

    if (loadingProfile) return <div className="flex h-screen items-center justify-center">Loading...</div>;
    if (!profileUser) return <div className="flex h-screen items-center justify-center">User not found</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="mx-auto max-w-5xl">
                {/* Profile Header Card */}
                <div className="mb-8 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/5">
                    {/* Banner */}
                    <div className="h-28 bg-gradient-to-r from-blue-500 to-blue-600"></div>

                    {/* Profile Content */}
                    <div className="px-8 pb-8">
                        {/* Avatar & User Info */}
                        <div className="relative -mt-14 mb-6">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    {/* Avatar */}
                                    <div className="h-24 w-24 rounded-full border-4 border-white bg-white shadow-lg flex items-center justify-center text-3xl font-bold text-blue-600">
                                        {profileUser.displayName?.[0]?.toUpperCase() || "?"}
                                    </div>

                                    {/* User Info */}
                                    <div className="mt-12">
                                        <h1 className="text-3xl font-bold text-gray-900">{profileUser.displayName}</h1>
                                        <p className="text-gray-500 font-medium mt-0.5">@{profileUser.username}</p>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="mt-12">
                                    {currentUser && currentUser.uid !== profileUser.id && !isFriend && requestStatus === "none" && (
                                        <button
                                            onClick={handleSendRequest}
                                            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-95"
                                        >
                                            Send Friend Request
                                        </button>
                                    )}
                                    {currentUser && currentUser.uid !== profileUser.id && !isFriend && requestStatus === "pending" && (
                                        <button
                                            disabled
                                            className="cursor-not-allowed rounded-full bg-gray-100 px-6 py-2.5 text-sm font-semibold text-gray-500"
                                        >
                                            Request Sent
                                        </button>
                                    )}
                                    {currentUser && currentUser.uid !== profileUser.id && isFriend && (
                                        <span className="inline-flex items-center rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                            <span className="mr-1.5 h-2 w-2 rounded-full bg-green-600"></span>
                                            Friends
                                        </span>
                                    )}
                                    {currentUser && currentUser.uid === profileUser.id && (
                                        <button
                                            onClick={() => setShowAddFriendModal(true)}
                                            className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-95"
                                        >
                                            Add Friend
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-6">
                            <button
                                onClick={() => setShowPlacesModal(true)}
                                className="group flex flex-col items-center justify-center rounded-xl bg-gray-50 p-4 transition-all hover:bg-blue-50 hover:shadow-sm"
                            >
                                <span className="text-3xl font-bold text-gray-900 group-hover:text-blue-600">{places.length}</span>
                                <span className="text-sm font-medium text-gray-500 group-hover:text-blue-600">Places Added</span>
                            </button>
                            <button
                                onClick={() => setShowFriendsModal(true)}
                                className="group flex flex-col items-center justify-center rounded-xl bg-gray-50 p-4 transition-all hover:bg-blue-50 hover:shadow-sm"
                            >
                                <span className="text-3xl font-bold text-gray-900 group-hover:text-blue-600">{profileUser.friends.length}</span>
                                <span className="text-sm font-medium text-gray-500 group-hover:text-blue-600">Friends</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Incoming Friend Requests Section */}
                {currentUser && currentUser.uid === profileUser.id && incomingRequests.length > 0 && (
                    <div className="mb-8 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gray-900/5">
                        <h2 className="mb-4 text-lg font-bold text-gray-900">Friend Requests</h2>
                        <div className="space-y-3">
                            {incomingRequests.map((req) => (
                                <div key={req.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4 transition-colors hover:bg-white hover:shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                                            {req.sender.displayName?.[0]?.toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900">{req.sender.displayName}</p>
                                            <p className="text-xs text-gray-500">@{req.sender.username}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAcceptRequest(req.id, req.senderId)}
                                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() => handleRejectRequest(req.id)}
                                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 transition-colors hover:bg-gray-50"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <h2 className="text-2xl font-bold text-gray-900">Added Places</h2>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={filterCity}
                            onChange={(e) => setFilterCity(e.target.value)}
                            className="rounded-lg border-gray-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="">All Cities</option>
                            {uniqueCities.map(city => <option key={city} value={city}>{city}</option>)}
                        </select>
                        <select
                            value={filterDistrict}
                            onChange={(e) => setFilterDistrict(e.target.value)}
                            className="rounded-lg border-gray-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="">All Districts</option>
                            {uniqueDistricts.map(district => <option key={district} value={district}>{district}</option>)}
                        </select>
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="rounded-lg border-gray-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="">All Categories</option>
                            {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <select
                            value={filterRating}
                            onChange={(e) => setFilterRating(e.target.value ? Number(e.target.value) : "")}
                            className="rounded-lg border-gray-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            <option value="">All Ratings</option>
                            <option value="4">4+ Stars</option>
                            <option value="3">3+ Stars</option>
                            <option value="2">2+ Stars</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredPlaces.length === 0 ? (
                        <div className="col-span-full rounded-xl bg-white p-8 text-center text-gray-500 shadow-sm">
                            No places found matching your filters.
                        </div>
                    ) : (
                        filteredPlaces.map((place) => (
                            <div key={place.id} className="group relative h-full">
                                <Link href={`/place/${place.id}`} className="block h-full">
                                    <div className="h-full cursor-pointer rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                                        <div className="flex items-start justify-between gap-3 mb-4">
                                            <h3 className="text-lg font-bold text-gray-900 line-clamp-1 flex-1">{place.name}</h3>
                                            <div className="flex items-center rounded-full bg-yellow-50 px-2.5 py-1 ring-1 ring-inset ring-yellow-600/20 flex-shrink-0">
                                                <span className="text-yellow-600 text-xs font-bold whitespace-nowrap">★ {place.userRating ? place.userRating : place.avgRating.toFixed(1)}</span>
                                            </div>
                                        </div>

                                        <p className="text-sm text-gray-500 mb-4 flex items-center gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            {place.city}, {place.district}
                                        </p>

                                        <div className="flex flex-wrap gap-2 mt-auto">
                                            {place.categories.slice(0, 3).map((cat) => (
                                                <span key={cat} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                                    {cat}
                                                </span>
                                            ))}
                                            {place.categories.length > 3 && (
                                                <span className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                                                    +{place.categories.length - 3}
                                                </span>
                                            )}
                                        </div>

                                        {place.userRating && (
                                            <div className="mt-4 border-t border-gray-100 pt-3">
                                                <span className="text-xs font-medium text-blue-600">Rated by me</span>
                                            </div>
                                        )}
                                    </div>
                                </Link>
                                {currentUser && currentUser.uid === profileUser.id && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPlaceToDelete(place.id);
                                        }}
                                        className="absolute -right-2 -top-2 hidden h-8 w-8 items-center justify-center rounded-full bg-white text-red-500 shadow-md ring-1 ring-gray-200 transition-all hover:bg-red-50 hover:scale-110 group-hover:flex"
                                        title="Delete Place"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Add Friend Modal */}
            {showAddFriendModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setShowAddFriendModal(false)}>
                    <div className="w-full max-w-md transform rounded-2xl bg-white p-6 shadow-2xl transition-all" onClick={(e) => e.stopPropagation()}>
                        <h2 className="mb-4 text-xl font-bold text-gray-900">Add Friend</h2>
                        {addFriendError && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{addFriendError}</div>}
                        {addFriendSuccess && <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">{addFriendSuccess}</div>}
                        <form onSubmit={handleSendRequestByUsername}>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                                <input
                                    type="text"
                                    value={targetUsername}
                                    onChange={(e) => setTargetUsername(e.target.value)}
                                    className="block w-full rounded-lg border-gray-300 bg-gray-50 p-2.5 text-sm focus:border-blue-500 focus:bg-white focus:ring-blue-500"
                                    placeholder="Enter username"
                                    required
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddFriendModal(false)}
                                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm"
                                >
                                    Send Request
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Friends List Modal */}
            {showFriendsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setShowFriendsModal(false)}>
                    <div className="w-full max-w-md transform rounded-2xl bg-white p-6 shadow-2xl transition-all max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-900">Friends</h2>
                            <button onClick={() => setShowFriendsModal(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-2">
                            {loadingFriends ? (
                                <p className="text-center text-gray-500 py-4">Loading friends...</p>
                            ) : friendsList.length === 0 ? (
                                <p className="text-center text-gray-500 py-4">No friends found.</p>
                            ) : (
                                <div className="space-y-3">
                                    {friendsList.map((friend) => (
                                        <div key={friend.id} className="group relative flex items-center justify-between rounded-xl border border-gray-100 p-3 transition-colors hover:bg-gray-50">
                                            <Link href={`/profile/${friend.username}`} className="flex flex-1 items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                                                    {friend.displayName?.[0]?.toUpperCase() || "?"}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-900">{friend.displayName}</p>
                                                    <p className="text-xs text-gray-500">@{friend.username}</p>
                                                </div>
                                            </Link>
                                            {currentUser && currentUser.uid === profileUser.id && (
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setFriendToDelete(friend.id);
                                                    }}
                                                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-600 transition-all"
                                                    title="Remove Friend"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Places List Modal */}
            {showPlacesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setShowPlacesModal(false)}>
                    <div className="w-full max-w-md transform rounded-2xl bg-white p-6 shadow-2xl transition-all max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-900">Places</h2>
                            <button onClick={() => setShowPlacesModal(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-2">
                            {places.length === 0 ? (
                                <p className="text-center text-gray-500 py-4">No places added yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {[...places].sort((a, b) => b.avgRating - a.avgRating).map((place) => (
                                        <Link key={place.id} href={`/place/${place.id}`}>
                                            <div className="flex items-center justify-between rounded-xl border border-gray-100 p-3 transition-colors hover:bg-gray-50 cursor-pointer">
                                                <div>
                                                    <p className="font-semibold text-gray-900">{place.name}</p>
                                                    <p className="text-xs text-gray-500">{place.city}</p>
                                                </div>
                                                <div className="flex items-center rounded-full bg-yellow-50 px-2 py-1 ring-1 ring-inset ring-yellow-600/20">
                                                    <span className="text-yellow-600 text-xs font-bold">★ {place.userRating ? place.userRating : place.avgRating.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {placeToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setPlaceToDelete(null)}>
                    <div className="w-full max-w-sm transform rounded-2xl bg-white p-6 shadow-2xl transition-all" onClick={(e) => e.stopPropagation()}>
                        <h2 className="mb-2 text-xl font-bold text-gray-900">Delete Place</h2>
                        <p className="mb-6 text-gray-500">Are you sure you want to delete this place from your profile?</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setPlaceToDelete(null)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeletePlace}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 shadow-sm"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Friend Confirmation Modal */}
            {friendToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setFriendToDelete(null)}>
                    <div className="w-full max-w-sm transform rounded-2xl bg-white p-6 shadow-2xl transition-all" onClick={(e) => e.stopPropagation()}>
                        <h2 className="mb-2 text-xl font-bold text-gray-900">Remove Friend</h2>
                        <p className="mb-6 text-gray-500">Are you sure you want to remove this friend?</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setFriendToDelete(null)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteFriend}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 shadow-sm"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
