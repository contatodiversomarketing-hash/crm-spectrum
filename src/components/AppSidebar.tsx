import { Brain, Eye, BarChart3, GraduationCap, LogOut, Users, CalendarDays, UserPlus, ShieldCheck, MessagesSquare } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo-amelia.png";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

type AppRole = "admin" | "supervisao" | "analista" | "auxiliar";

const menuItems: { title: string; url: string; icon: typeof Brain; roles?: AppRole[] }[] = [
  { title: "Painel Principal", url: "/", icon: Brain, roles: ["admin", "supervisao", "analista"] },
  { title: "Agenda", url: "/agenda", icon: CalendarDays },
  { title: "Pacientes", url: "/pacientes", icon: UserPlus },
  { title: "CRM / Leads", url: "/crm", icon: Users },
  { title: "Conversas", url: "/conversas", icon: MessagesSquare, roles: ["admin", "supervisao", "analista", "auxiliar"] },
  { title: "Supervisão IA e Atendente", url: "/supervisao", icon: Eye, roles: ["admin", "supervisao"] },
  { title: "Dashboard IA", url: "/dashboard-ia", icon: BarChart3, roles: ["admin", "supervisao", "analista"] },
  { title: "Treinamento IA", url: "/treinamento-ia", icon: GraduationCap, roles: ["admin"] },
  { title: "Usuários", url: "/usuarios", icon: ShieldCheck, roles: ["admin"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, profile, hasAnyRole } = useAuth();
  const visibleItems = menuItems.filter((item) => !item.roles || hasAnyRole(...item.roles));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Dra. Amélia Carvalho" className="h-8 w-8 rounded-md object-contain" />
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-sidebar-primary-foreground">Ana</p>
              <p className="text-[10px] text-sidebar-foreground/60">Dra. Amélia Carvalho</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    tooltip={item.title}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && profile && (
          <p className="text-[11px] text-sidebar-foreground/60 truncate mb-1 px-2">
            {profile.nome || profile.email}
          </p>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sair">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}