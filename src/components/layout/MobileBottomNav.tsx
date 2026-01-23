import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    { path: "/groups", icon: "group", label: "Groups" },
    { path: "/", icon: "home", label: "Home" },
    { path: "/tracking", icon: "account_balance_wallet", label: "Tracking" },
  ];

  const activeTab = tabs.find(tab => {
    if (tab.path === "/" && location.pathname === "/") return true;
    if (tab.path === "/groups" && (location.pathname === "/groups" || location.pathname.startsWith("/groups/"))) return true;
    if (tab.path === "/tracking" && (location.pathname === "/tracking" || location.pathname === "/insights" || location.pathname === "/tracking/history")) return true;
    return false;
  }) || tabs[1]; // Default to Home if none match

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-md h-20 z-50 pointer-events-none">
      <nav className="h-full w-full bg-[#1A1C1F] border border-white/5 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-around px-2 pointer-events-auto relative overflow-hidden">
        {tabs.map((tab) => {
          const isActive = activeTab.path === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="relative flex-1 flex items-center justify-center h-full transition-all duration-300 z-10"
            >
              <span
                className={cn(
                  "material-symbols-outlined text-2xl relative z-20 transition-colors duration-300",
                  isActive ? "text-white font-bold" : "text-white/40"
                )}
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {tab.icon}
              </span>

              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute size-14 bg-[#E8552C] rounded-full z-10"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
