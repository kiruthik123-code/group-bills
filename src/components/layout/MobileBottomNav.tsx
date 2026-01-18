import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export const MobileBottomNav = () => {
  const location = useLocation();

  const getIsActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path === "/groups" && (location.pathname === "/groups" || location.pathname.startsWith("/groups/"))) return true;
    if (path === "/profile" && location.pathname === "/profile") return true;
    return false;
  };

  const navItems = [
    { path: "/groups", icon: "groups", label: "Groups" },
    { path: "/", icon: "home", label: "Home" },
    { path: "/profile", icon: "person", label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 px-6 pb-6 pt-2 pointer-events-none flex justify-center">
      <div className="w-full bg-[#1F1F1F]/90 backdrop-blur-xl rounded-[2.5rem] p-2 border border-white/5 flex items-center justify-around pointer-events-auto shadow-2xl relative overflow-hidden">
        {navItems.map((item) => {
          const isActive = getIsActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className="relative flex items-center justify-center w-12 h-12 transition-colors duration-300"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-brand rounded-full shadow-[0_0_20px_rgba(255,77,45,0.4)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <motion.span
                animate={{
                  scale: isActive ? 1.1 : 1,
                  color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.4)",
                }}
                className={cn(
                  "material-symbols-outlined text-2xl relative z-10",
                  isActive && "font-bold"
                )}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </motion.span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

