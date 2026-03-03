import { Link } from "react-router-dom";
import { LoginArea } from "@/components/auth/LoginArea";

export function Navigation() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-white">
      <div className="w-full max-w-7xl mx-auto px-4">

        {/* Top Row */}
        <div className="h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 min-w-0">
            <img
              src="/yakbak-logo.png"
              alt="ATL5D Logo"
              className="h-8 w-auto flex-shrink-0"
            />
            <div className="leading-tight truncate">
              <div className="text-lg font-bold">ATL5D</div>
              <div className="text-xs text-gray-500 hidden sm:block">
                "South got something to say"
              </div>
            </div>
          </Link>

          <div className="flex items-center">
            <LoginArea />
          </div>
        </div>

        {/* Mobile Ecosystem Row */}
        <div className="flex md:hidden py-3 gap-2 overflow-x-auto no-scrollbar">

          <a
            href="https://t.atl5d.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-xs rounded-full bg-blue-500 text-white whitespace-nowrap"
          >
            💬 Telegram
          </a>

          <a
            href="https://market.atl5d.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-xs rounded-full bg-black text-white whitespace-nowrap"
          >
            🛒 Market
          </a>

          <a
            href="https://tiktok.com/@atl5d"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-xs rounded-full border border-gray-300 whitespace-nowrap"
          >
            @atl5d
          </a>

          <a
            href="https://tiktok.com/@atlrent"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-xs rounded-full border border-gray-300 whitespace-nowrap"
          >
            @atlrent
          </a>

        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6 h-12 text-sm font-medium">
          <a
            href="https://t.atl5d.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black text-gray-600 transition"
          >
            Telegram
          </a>

          <a
            href="https://market.atl5d.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black text-gray-600 transition"
          >
            Market
          </a>

          <a
            href="https://tiktok.com/@atl5d"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black text-gray-600 transition"
          >
            @atl5d
          </a>

          <a
            href="https://tiktok.com/@atlrent"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black text-gray-600 transition"
          >
            @atlrent
          </a>
        </div>

      </div>
    </nav>
  );
}