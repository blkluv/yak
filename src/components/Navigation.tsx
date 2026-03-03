import { Link } from "react-router-dom";
import { LoginArea } from "@/components/auth/LoginArea";

export function Navigation() {
  return (
    <nav className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">

        {/* Top Row */}
        <div className="flex items-center justify-between">
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

          <LoginArea />
        </div>

        {/* Mobile Ecosystem Row */}
        <div className="flex md:hidden mt-3 gap-2 overflow-x-auto">

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

      </div>
    </nav>
  );
}