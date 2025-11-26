"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, increment, deleteDoc, setDoc, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Place, Review } from "@/lib/types";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";

const libraries: ("places")[] = ["places"];

export default function PlaceDetailsPage() {
    const { id } = useParams();
    const { user } = useAuth();
    const [place, setPlace] = useState<Place | null>(null);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [newRating, setNewRating] = useState(5);
    const [newComment, setNewComment] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Review Editing/Limiting State
    const [userReview, setUserReview] = useState<Review | null>(null);
    const [editingReview, setEditingReview] = useState<Review | null>(null);
    const [editRating, setEditRating] = useState(5);
    const [editComment, setEditComment] = useState("");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        libraries,
    });

    const fetchPlaceAndReviews = async () => {
        if (!id) return;
        try {
            const placeDoc = await getDoc(doc(db, "places", id as string));
            if (placeDoc.exists()) {
                setPlace(placeDoc.data() as Place);
            }

            const q = query(collection(db, "places", id as string, "reviews"));
            const querySnapshot = await getDocs(q);
            const reviewsData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Review));
            // Sort locally by createdAt desc if needed, or use orderBy in query (requires index)
            reviewsData.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
            setReviews(reviewsData);

            // Check if current user has reviewed
            if (user) {
                const myReview = reviewsData.find(r => r.userId === user.uid);
                setUserReview(myReview || null);
            }
        } catch (error) {
            console.error("Error fetching place:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlaceAndReviews();
    }, [id]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setEditingReview(null);
                setShowDeleteConfirm(null);
            }
        };

        if (editingReview || showDeleteConfirm) {
            window.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [editingReview, showDeleteConfirm]);

    const recalculatePlaceRating = async (placeId: string) => {
        try {
            const q = query(collection(db, "places", placeId, "reviews"));
            const querySnapshot = await getDocs(q);
            const reviews = querySnapshot.docs.map(doc => doc.data() as Review);

            const totalReviews = reviews.length;
            const averageRating = totalReviews > 0
                ? reviews.reduce((acc, review) => acc + review.rating, 0) / totalReviews
                : 0;

            await updateDoc(doc(db, "places", placeId), {
                avgRating: averageRating,
                ratingCount: totalReviews
            });
        } catch (error) {
            console.error("Error recalculating rating:", error);
        }
    };

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !place) return;

        // Prevent duplicate reviews
        if (userReview) {
            alert("You have already reviewed this place.");
            return;
        }

        setSubmitting(true);
        try {
            await addDoc(collection(db, "places", place.id, "reviews"), {
                placeId: place.id,
                userId: user.uid,
                username: user.displayName || "Anonymous",
                rating: newRating,
                comment: newComment,
                createdAt: serverTimestamp(),
            });

            // Recalculate rating from source of truth
            await recalculatePlaceRating(place.id);

            // Sync with user's addedPlaces
            // Ensure the place is in the user's profile with the new rating
            await setDoc(doc(db, "users", user.uid, "addedPlaces", place.id), {
                rating: newRating,
                addedAt: serverTimestamp() // Update timestamp to show recent activity or ensure field exists
            }, { merge: true });

            setNewComment("");
            setNewRating(5);
            fetchPlaceAndReviews(); // Refresh data
        } catch (error) {
            console.error("Error submitting review:", error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditClick = (review: Review) => {
        setEditingReview(review);
        setEditRating(review.rating);
        setEditComment(review.comment);
    };

    const handleSaveEdit = async () => {
        if (!editingReview || !place || !user) return;

        try {
            await updateDoc(doc(db, "places", place.id, "reviews", editingReview.id), {
                rating: editRating,
                comment: editComment,
                updatedAt: serverTimestamp()
            });

            // Sync with user's addedPlaces
            await setDoc(doc(db, "users", user.uid, "addedPlaces", place.id), {
                rating: editRating
            }, { merge: true });

            // Recalculate rating from source of truth
            await recalculatePlaceRating(place.id);

            setEditingReview(null);
            fetchPlaceAndReviews();
        } catch (error) {
            console.error("Error updating review:", error);
        }
    };

    const handleDeleteClick = (reviewId: string) => {
        setShowDeleteConfirm(reviewId);
    };

    const handleConfirmDelete = async () => {
        if (!showDeleteConfirm || !place || !user) return;

        try {
            await deleteDoc(doc(db, "places", place.id, "reviews", showDeleteConfirm));

            // Sync with user's addedPlaces - remove rating
            // We use setDoc with merge and deleteField to be safe if doc doesn't exist (though it should)
            await setDoc(doc(db, "users", user.uid, "addedPlaces", place.id), {
                rating: deleteField()
            }, { merge: true });

            // Recalculate rating from source of truth
            await recalculatePlaceRating(place.id);

            setShowDeleteConfirm(null);
            fetchPlaceAndReviews();
        } catch (error) {
            console.error("Error deleting review:", error);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
    if (!place) return <div className="flex h-screen items-center justify-center">Place not found</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <div className="mx-auto max-w-6xl">
                {/* Place Header & Map */}
                <div className="mb-8 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-900/5">
                    <div className="grid grid-cols-1 lg:grid-cols-2">
                        <div className="h-64 lg:h-auto w-full relative">
                            {isLoaded && (
                                <GoogleMap
                                    mapContainerStyle={{ width: "100%", height: "100%" }}
                                    center={place.location}
                                    zoom={15}
                                    options={{
                                        disableDefaultUI: true,
                                        zoomControl: true,
                                    }}
                                >
                                    <Marker position={place.location} />
                                </GoogleMap>
                            )}
                        </div>
                        <div className="p-8 lg:p-12 flex flex-col justify-center">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h1 className="text-4xl font-bold text-gray-900 mb-2">{place.name}</h1>
                                    <p className="text-lg text-gray-500 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        {place.city}, {place.district}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-1 bg-yellow-50 px-3 py-1.5 rounded-full ring-1 ring-yellow-600/20">
                                        <span className="text-yellow-500 text-xl">★</span>
                                        <span className="text-xl font-bold text-yellow-700">{place.avgRating.toFixed(1)}</span>
                                    </div>
                                    <span className="text-sm text-gray-500 mt-1">{place.ratingCount} reviews</span>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-4">
                                {place.categories.map((cat) => (
                                    <span key={cat} className="rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                        {cat}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                    {/* Reviews List */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-gray-900">Reviews</h2>
                            <div className="text-sm text-gray-500">
                                Showing {reviews.length} reviews
                            </div>
                        </div>

                        <div className="space-y-4">
                            {reviews.length === 0 ? (
                                <div className="rounded-xl bg-white p-8 text-center text-gray-500 shadow-sm">
                                    No reviews yet. Be the first to review!
                                </div>
                            ) : (
                                reviews.map((review) => (
                                    <div key={review.id} className="group relative rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 transition-all hover:shadow-md">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                                    {review.username?.[0]?.toUpperCase() || "A"}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900">{review.username}</p>
                                                    <div className="flex items-center gap-1">
                                                        {[...Array(5)].map((_, i) => (
                                                            <svg
                                                                key={i}
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                className={`h-4 w-4 ${i < review.rating ? "text-yellow-400" : "text-gray-200"}`}
                                                                viewBox="0 0 20 20"
                                                                fill="currentColor"
                                                            >
                                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                            </svg>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {user && user.uid === review.userId && (
                                                <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                                    <button
                                                        onClick={() => handleEditClick(review)}
                                                        className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                                        title="Edit Review"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClick(review.id)}
                                                        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                        title="Delete Review"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-gray-600 leading-relaxed">{review.comment}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Add Review Form */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24">
                            {user && !userReview ? (
                                <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-gray-900/5">
                                    <h2 className="mb-6 text-xl font-bold text-gray-900">Write a Review</h2>
                                    <form onSubmit={handleSubmitReview} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
                                            <div className="flex justify-between px-2">
                                                {[1, 2, 3, 4, 5].map((r) => (
                                                    <button
                                                        key={r}
                                                        type="button"
                                                        onClick={() => setNewRating(r)}
                                                        className="focus:outline-none transition-transform hover:scale-110"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            className={`h-8 w-8 ${newRating >= r ? "text-yellow-400" : "text-gray-200"}`}
                                                            viewBox="0 0 20 20"
                                                            fill="currentColor"
                                                        >
                                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                        </svg>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Comment</label>
                                            <textarea
                                                value={newComment}
                                                onChange={(e) => setNewComment(e.target.value)}
                                                className="block w-full rounded-lg border-gray-300 bg-gray-50 p-3 text-sm focus:border-blue-500 focus:bg-white focus:ring-blue-500"
                                                rows={4}
                                                placeholder="Share your experience..."
                                                required
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {submitting ? "Submitting..." : "Post Review"}
                                        </button>
                                    </form>
                                </div>
                            ) : user && userReview ? (
                                <div className="rounded-2xl bg-blue-50 p-6 text-center ring-1 ring-blue-100">
                                    <div className="mb-3 flex justify-center">
                                        <div className="rounded-full bg-blue-100 p-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-bold text-blue-900">Thanks for reviewing!</h3>
                                    <p className="text-sm text-blue-700 mt-1">You've already shared your experience for this place.</p>
                                </div>
                            ) : (
                                <div className="rounded-2xl bg-gray-50 p-6 text-center ring-1 ring-gray-200">
                                    <p className="text-gray-600">Please <a href="/login" className="text-blue-600 font-bold hover:underline">log in</a> to leave a review.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Review Modal */}
            {editingReview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setEditingReview(null)}>
                    <div className="w-full max-w-md transform rounded-2xl bg-white p-6 shadow-2xl transition-all" onClick={(e) => e.stopPropagation()}>
                        <h2 className="mb-6 text-xl font-bold text-gray-900">Edit Review</h2>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
                            <div className="flex justify-between px-4">
                                {[1, 2, 3, 4, 5].map((r) => (
                                    <button
                                        key={r}
                                        onClick={() => setEditRating(r)}
                                        className="focus:outline-none transition-transform hover:scale-110"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className={`h-8 w-8 ${editRating >= r ? "text-yellow-400" : "text-gray-200"}`}
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Comment</label>
                            <textarea
                                value={editComment}
                                onChange={(e) => setEditComment(e.target.value)}
                                className="block w-full rounded-lg border-gray-300 bg-gray-50 p-3 text-sm focus:border-blue-500 focus:bg-white focus:ring-blue-500"
                                rows={4}
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setEditingReview(null)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 shadow-sm"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setShowDeleteConfirm(null)}>
                    <div className="w-full max-w-sm transform rounded-2xl bg-white p-6 shadow-2xl transition-all" onClick={(e) => e.stopPropagation()}>
                        <h2 className="mb-2 text-xl font-bold text-gray-900">Delete Review</h2>
                        <p className="mb-6 text-gray-500">Are you sure you want to delete your review? This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 shadow-sm"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
