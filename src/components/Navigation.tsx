import { Link } from "react-router-dom";
import { LoginArea } from "@/components/auth/LoginArea";

export function Navigation() {
  return (
    <nav className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto px-4">

        {/* TOP BAR */}
        <div className="h-16 flex items-center justify-between">

          {/* Logo + Tagline */}
          <Link to="/" className="flex items-center space-x-3">
            <img
              src="/yakbak-logo.png"
              alt="ATL5D Logo"
              className="h-8 w-auto"
            />
            <div className="leading-tight">
              <div className="text-lg font-bold">ATL5D</div>
              <div className="text-xs text-gray-500 hidden sm:block">
                The audio reality show you monetize.
              </div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">

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

            <LoginArea />
          </div>

          {/* Mobile Login Only */}
          <div className="md:hidden">
            <LoginArea />
          </div>

        </div>

      </div>
    </nav>
  );
}