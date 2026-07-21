export type AppRole = "admin" | "warehouse_manager" | "manager" | "engineer";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  warehouse_manager: "Warehouse Manager",
  manager: "Manager",
  engineer: "Engineer",
};

export function canWrite(roles: AppRole[]): boolean {
  return roles.some((r) => r === "admin" || r === "warehouse_manager" || r === "manager");
}

export function isAdmin(roles: AppRole[]): boolean {
  return roles.includes("admin");
}

export function isWarehouseOrAdmin(roles: AppRole[]): boolean {
  return roles.some((r) => r === "admin" || r === "warehouse_manager");
}

export function highestRole(roles: AppRole[]): AppRole | null {
  const order: AppRole[] = ["admin", "warehouse_manager", "manager", "engineer"];
  for (const r of order) if (roles.includes(r)) return r;
  return null;
}
