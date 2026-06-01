import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Map, TrendingUp, Star, Bike } from "lucide-react";

export default async function HomePage() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <Image src="/logo.webp" alt="VéloVoyage" width={36} height={36} className="rounded-lg" unoptimized />
          <span className="text-xl font-bold text-white">VéloVoyage</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10">
              Sign in
            </Button>
          </Link>
          <Link href="/register">
            <Button className="bg-emerald-500 hover:bg-emerald-400">
              Get started
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex flex-col items-center justify-center text-center px-6 py-24 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-4 py-1.5 mb-8">
          <Star className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">
            Your ultimate bike trip companion
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight text-balance mb-6">
          Plan every pedal.
          <br />
          <span className="text-emerald-400">Conquer every trail.</span>
        </h1>

        <p className="text-lg text-slate-300 max-w-2xl mb-10 text-balance">
          Upload GPX files, plan mixed bike-and-train itineraries, track
          elevation profiles, find points of interest, and check weather
          forecasts — all in one place.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/register">
            <Button size="lg" className="bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25 px-8">
              Start planning for free
            </Button>
          </Link>
          <Link href="/login">
            <Button
              size="lg"
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:border-white/30 backdrop-blur-sm"
            >
              Sign in
            </Button>
          </Link>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-24 w-full">
          {[
            {
              icon: Map,
              title: "Interactive Maps",
              description:
                "Visualize your routes on detailed maps with GPX overlay support.",
            },
            {
              icon: TrendingUp,
              title: "Elevation Profiles",
              description:
                "Analyze climbs and descents with detailed elevation charts.",
            },
            {
              icon: Bike,
              title: "Multi-segment Trips",
              description:
                "Combine cycling, train, and walking legs into one seamless itinerary.",
            },
          ].map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl bg-white/5 border border-white/10 p-6 text-left backdrop-blur-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 mb-4">
                <Icon className="h-5 w-5 text-emerald-400" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">
                {title}
              </h3>
              <p className="text-sm text-slate-400">{description}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
