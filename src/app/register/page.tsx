"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import { doc, setDoc, getDocs, collection, query, where, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";

export default function RegisterPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const router = useRouter();
    const { user, loading } = useAuth();

    useEffect(() => {
        if (!loading && user) {
            router.push("/map");
        }
    }, [user, loading, router]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        // Basic validation
        if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
            setError("Password must be at least 8 characters long and contain at least one letter and one number.");
            return;
        }

        const lowerUsername = username.toLowerCase().replace(/\s/g, "");
        if (lowerUsername !== username) {
            setError("Username must be lowercase and contain no spaces.");
            return;
        }

        try {
            // Check if username exists
            const q = query(collection(db, "users"), where("username", "==", lowerUsername));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                setError("Username already taken.");
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await updateProfile(user, { displayName: lowerUsername });

            await setDoc(doc(db, "users", user.uid), {
                id: user.uid,
                username: lowerUsername,
                displayName: lowerUsername,
                email: email,
                friends: [],
                createdAt: serverTimestamp(),
            });

            // await signOut(auth); // Do not sign out

            setSuccess("Account created successfully! You are now logged in.");
            setTimeout(() => {
                router.push("/map");
            }, 1500);
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
            <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
                <h2 className="mb-6 text-center text-2xl font-bold text-gray-800">Register for Pinify</h2>
                {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
                {success && <p className="mb-4 text-sm text-green-500">{success}</p>}
                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full rounded-md bg-blue-600 py-2 text-white hover:bg-blue-700 focus:outline-none"
                    >
                        Register
                    </button>
                </form>
                <p className="mt-4 text-center text-sm text-gray-600">
                    Already have an account?{" "}
                    <Link href="/login" className="text-blue-600 hover:underline">
                        Login
                    </Link>
                </p>
            </div>
        </div>
    );
}
