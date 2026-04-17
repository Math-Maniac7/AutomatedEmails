import { NavLink, useNavigate } from "react-router-dom";
import { Inbox, FileText, Zap, Settings, LogOut, Mail } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

const navItems = [
  { to: "/inbox", icon: Inbox, label: "Inbox" },
  { to: "/templates", icon: FileText, label: "Templates" },
  { to: "/auto-replies", icon: Zap, label: "Auto-Replies" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  function handleLogout() {
    clear();
    navigate("/login");
  }

  return (
    <aside className="w-56 flex flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <Mail className="h-5 w-5 text-primary" />
        <span className="font-semibold text-foreground">Email Manager</span>
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-4 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </aside>
  );
}
