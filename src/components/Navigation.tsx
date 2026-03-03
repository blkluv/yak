import { Link } from "react-router-dom";
import { LoginArea } from "@/components/auth/LoginArea";

export function Navigation() {
  return (
    <nav className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* Logo + Brand */}
        <Link to="/" className="flex items-center space-x-3">
          <img
            src="/yakbak-logo.png"
            alt="ATL5D Logo"
            className="h-8 w-auto"
          />
          <div className="leading-tight">
            <div className="text-lg font-bold">ATL5D</div>
            <div className="text-xs text-gray-500">
              The audio reality show you monetize.
            </div>
          </div>
        </Link>

        {/* Ecosystem Links */}
        <div className="hidden md:flex items-center gap-4 text-sm font-medium">

          {/* Telegram */}
          <a
            href="https://t.atl5d.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition"
          >
            💬 Telegram
          </a>

          {/* Marketplace */}
          <a
            href="https://market.atl5d.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded-full bg-black text-white hover:bg-gray-800 transition"
          >
            🛒 Market
          </a>

          {/* ATL5D TikTok */}
          <a
            href="https://tiktok.com/@atl5d"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black text-gray-600 transition"
          >
            @atl5d
          </a>

          {/* ATL Rent TikTok */}
          <a
            href="https://tiktok.com/@atlrent"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black text-gray-600 transition"
          >
            @atlrent
          </a>

        </div>

        {/* Login */}
        <div className="flex items-center gap-4">
          <LoginArea />
        </div>

      </div>
    </nav>
  );
}