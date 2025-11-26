"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
    const { user, userProfile } = useAuth();
    const router = useRouter();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push("/login");
            setIsMobileMenuOpen(false);
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    if (!user) return null;

    return (
        <nav className="sticky top-0 z-50 w-full bg-white/80 shadow-sm backdrop-blur-md transition-all">
            <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 sm:h-20 items-center justify-between">
                    <div className="flex items-center gap-12">
                        <div className="flex flex-shrink-0 items-center">
                            <Link href="/map" className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-600 hover:opacity-80 transition-opacity">
                                Pinify
                            </Link>
                        </div>
                        <div className="hidden sm:flex sm:space-x-8">
                            <Link
                                href="/map"
                                className="inline-flex items-center px-1 pt-1 text-lg font-medium text-gray-600 transition-colors duration-200 hover:text-blue-600"
                            >
                                Map
                            </Link>
                            <Link
                                href="/add-place"
                                className="inline-flex items-center px-1 pt-1 text-lg font-medium text-gray-600 transition-colors duration-200 hover:text-blue-600"
                            >
                                Add Place
                            </Link>
                            {userProfile ? (
                                <Link
                                    href={`/profile/${userProfile.username}`}
                                    className="inline-flex items-center px-1 pt-1 text-lg font-medium text-gray-600 transition-colors duration-200 hover:text-blue-600"
                                >
                                    Profile
                                </Link>
                            ) : (
                                <span className="inline-flex items-center px-1 pt-1 text-lg font-medium text-gray-400 cursor-not-allowed">
                                    Profile
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Desktop Logout */}
                    <div className="hidden sm:flex items-center">
                        <button
                            onClick={handleLogout}
                            className="rounded-full bg-gray-100 px-6 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200 hover:shadow-sm active:scale-95"
                        >
                            Logout
                        </button>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="flex items-center sm:hidden">
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                        >
                            <span className="sr-only">Open main menu</span>
                            {isMobileMenuOpen ? (
                                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            ) : (
                                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="sm:hidden border-t border-gray-200 bg-white">
                    <div className="space-y-1 px-2 pb-3 pt-2">
                        <Link
                            href="/map"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                        >
                            Map
                        </Link>
                        <Link
                            href="/add-place"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                        >
                            Add Place
                        </Link>
                        {userProfile ? (
                            <Link
                                href={`/profile/${userProfile.username}`}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block rounded-md px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                            >
                                Profile
                            </Link>
                        ) : (
                            <span className="block rounded-md px-3 py-2 text-base font-medium text-gray-400 cursor-not-allowed">
                                Profile
                            </span>
                        )}
                        <button
                            onClick={handleLogout}
                            className="block w-full text-left rounded-md px-3 py-2 text-base font-medium text-red-600 hover:bg-red-50"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
}
