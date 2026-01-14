import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

export const MobileBottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-card/95 shadow-[0_-4px_12px_rgba(0,0,0,0.12)] backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-around px-8 py-3 text-[11px] font-medium">
        <NavItem to="/" label="Home" />
        <NavItem to="/groups" label="Groups" />
        <NavItem to="/profile" label="Profile" />
      </div>
    </nav>
  );
};

interface NavItemProps {
  to: string;
  label: string;
}

const NavItem = ({ to, label }: NavItemProps) => {
  return (
    <NavLink
      to={to}
      className="flex flex-col items-center gap-0.5 text-muted-foreground transition-all duration-200 hover:scale-105 relative"
      activeClassName="text-primary"
    >
      <span>{label}</span>
      <span
        className={cn(
          "absolute -bottom-1 h-0.5 w-0 rounded-full bg-primary/30 transition-all duration-200",
          "data-[active=true]:w-4 data-[active=true]:bg-primary data-[active=true]:animate-[pulse_1.5s_ease-in-out_infinite]",
        )}
        aria-hidden="true"
      />
    </NavLink>
  );
};
