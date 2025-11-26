"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from "@react-google-maps/api";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Place } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";

const libraries: ("places")[] = ["places"];

import { useCurrentUser } from "@/lib/hooks";

export default function MapPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [places, setPlaces] = useState<Place[]>([]);
    const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

    // Filters
    const [cityFilter, setCityFilter] = useState("");
    const [districtFilter, setDistrictFilter] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
    const [ownerFilter, setOwnerFilter] = useState<"all" | "my" | "friends">("all");

    const { currentUserData } = useCurrentUser(user?.uid);

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        libraries,
    });

    useEffect(() => {
        if (!user) {
            router.push("/login");
            return;
        }

        const fetchPlaces = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "places"));
                const placesData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Place));
                setPlaces(placesData);
            } catch (error) {
                console.error("Error fetching places:", error);
            }
        };

        fetchPlaces();
    }, [user, router]);

    // Reset district when city changes
    useEffect(() => {
        setDistrictFilter("");
    }, [cityFilter]);

    const filteredPlaces = useMemo(() => {
        if (!user) return [];

        let result = places;

        // Filter by City
        if (cityFilter) {
            result = result.filter((p) => p.city.toLowerCase().includes(cityFilter.toLowerCase()));
        }

        // Filter by District
        if (districtFilter) {
            result = result.filter((p) => p.district.toLowerCase().includes(districtFilter.toLowerCase()));
        }

        // Filter by Categories
        if (categoryFilter.length > 0) {
            result = result.filter((p) => p.categories.some((c) => categoryFilter.includes(c)));
        }

        // Filter by Owner
        if (ownerFilter === "my") {
            result = result.filter((p) => p.ownerId === user.uid);
        } else if (ownerFilter === "friends") {
            if (currentUserData && currentUserData.friends) {
                // Show places where ownerId is in friends list
                // AND ownerId is NOT the current user (explicit requirement)
                result = result.filter((p) =>
                    currentUserData.friends.includes(p.ownerId) && p.ownerId !== user.uid
                );
            } else {
                // If friends list not loaded or empty, show nothing
                result = [];
            }
        }

        return result;
    }, [places, cityFilter, districtFilter, categoryFilter, ownerFilter, user, currentUserData]);

    const handleCategoryToggle = (cat: string) => {
        if (categoryFilter.includes(cat)) {
            setCategoryFilter(categoryFilter.filter((c) => c !== cat));
        } else {
            setCategoryFilter([...categoryFilter, cat]);
        }
    };

    // Derived unique cities and districts for autocomplete
    const uniqueCities = useMemo(() => {
        const cities = places.map(p => p.city).filter(Boolean);
        return Array.from(new Set(cities)).sort();
    }, [places]);

    const uniqueDistricts = useMemo(() => {
        let placesToConsider = places;
        if (cityFilter) {
            placesToConsider = places.filter(p => p.city.toLowerCase() === cityFilter.toLowerCase());
        }
        const districts = placesToConsider.map(p => p.district).filter(Boolean);
        return Array.from(new Set(districts)).sort();
    }, [places, cityFilter]);

    const mapCenter = useMemo(() => {
        if (filteredPlaces.length > 0) {
            return filteredPlaces[0].location;
        }
        return { lat: 41.0082, lng: 28.9784 }; // Default Istanbul
    }, [filteredPlaces]);

    const getMarkerIcon = (place: Place) => {
        if (user && place.ownerId === user.uid) {
            return "http://maps.google.com/mapfiles/ms/icons/red-dot.png";
        }
        if (currentUserData && currentUserData.friends && currentUserData.friends.includes(place.ownerId)) {
            return "http://maps.google.com/mapfiles/ms/icons/blue-dot.png";
        }
        return undefined; // Default color
    };

    const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

    const onMapLoad = useCallback((map: google.maps.Map) => {
        setMapInstance(map);
    }, []);

    const handleRecenter = () => {
        if (mapInstance) {
            mapInstance.panTo(mapCenter);
            mapInstance.setZoom(12);
        }
    };

    if (!isLoaded) return <div className="flex h-screen items-center justify-center">Loading Map...</div>;

    return (
        <div className="relative h-[calc(100vh-5rem)] w-full">
            {/* Filter Bar */}
            <div className="absolute left-4 top-4 z-10 w-full max-w-4xl">
                <div className="flex flex-col gap-4 rounded-xl bg-white/90 p-4 shadow-lg backdrop-blur-sm transition-all hover:shadow-xl">
                    {/* Top Row: Search Inputs */}
                    <div className="flex flex-wrap gap-4">
                        <div className="relative flex-1 min-w-[200px]">
                            <input
                                type="text"
                                list="cities"
                                placeholder="Filter by City"
                                value={cityFilter}
                                onChange={(e) => setCityFilter(e.target.value)}
                                className="w-full h-9 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            <datalist id="cities">
                                {uniqueCities.map(city => (
                                    <option key={city} value={city} />
                                ))}
                            </datalist>
                        </div>
                        <div className="relative flex-1 min-w-[200px]">
                            <input
                                type="text"
                                list="districts"
                                placeholder="Filter by District"
                                value={districtFilter}
                                onChange={(e) => setDistrictFilter(e.target.value)}
                                className="w-full h-9 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            <datalist id="districts">
                                {uniqueDistricts.map(district => (
                                    <option key={district} value={district} />
                                ))}
                            </datalist>
                        </div>
                    </div>

                    {/* Middle Row: Categories */}
                    <div className="flex flex-wrap gap-2">
                        {["Food", "Dessert", "Shisha", "Historical", "Coffee", "View", "Mall"].map((cat) => (
                            <button
                                key={cat}
                                onClick={() => handleCategoryToggle(cat)}
                                className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-medium transition-all hover:scale-105 active:scale-95 ${categoryFilter.includes(cat)
                                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Bottom Row: Segmented Control */}
                    <div className="flex items-center justify-between">
                        <div className="flex rounded-lg bg-gray-100 p-1">
                            {(["all", "my", "friends"] as const).map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setOwnerFilter(filter)}
                                    className={`cursor-pointer rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-all ${ownerFilter === filter
                                        ? "bg-white text-blue-600 shadow-sm"
                                        : "text-gray-500 hover:text-gray-900"
                                        }`}
                                >
                                    {filter === "all" ? "All Places" : filter === "my" ? "My Places" : "Friends"}
                                </button>
                            ))}
                        </div>
                        <div className="text-xs text-gray-500 font-medium">
                            {filteredPlaces.length} places found
                        </div>
                    </div>
                </div>
            </div>

            {/* Recenter Button */}
            <button
                onClick={handleRecenter}
                className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 transform cursor-pointer rounded-full bg-white px-6 py-3 font-semibold text-gray-700 shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl active:scale-95"
            >
                Recenter Map
            </button>

            <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={mapCenter}
                zoom={12}
                onLoad={onMapLoad}
                options={{
                    disableDefaultUI: true,
                    zoomControl: true,
                    fullscreenControl: false,
                    streetViewControl: false,
                    mapTypeControl: false,
                }}
            >
                {filteredPlaces.map((place) => (
                    <Marker
                        key={place.id}
                        position={place.location}
                        onClick={() => setSelectedPlace(place)}
                        icon={getMarkerIcon(place)}
                    />
                ))}

                {selectedPlace && (
                    <InfoWindow
                        position={selectedPlace.location}
                        onCloseClick={() => setSelectedPlace(null)}
                    >
                        <div className="p-3 min-w-[200px]">
                            <h3 className="font-bold text-gray-900 text-lg">{selectedPlace.name}</h3>
                            <p className="text-xs text-gray-500 mb-2">{selectedPlace.categories.join(", ")}</p>
                            <div className="flex items-center justify-between mb-3">
                                <span className="flex items-center text-yellow-500 font-bold text-sm">
                                    ★ {selectedPlace.avgRating.toFixed(1)}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {selectedPlace.ratingCount} reviews
                                </span>
                            </div>
                            <Link
                                href={`/place/${selectedPlace.id}`}
                                className="block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                            >
                                View Details
                            </Link>
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>
        </div>
    );
}
