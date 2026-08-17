import { PermissionFlagsBits, type Guild } from "discord.js";

export interface RoleConfig {
  moderatorRoleId: string;
  adminRoleId: string;
}

export function hasModeratorRole(
  roleIds: Iterable<string>,
  roles: RoleConfig,
  hasAdministratorPermission = false,
): boolean {
  if (hasAdministratorPermission) return true;

  const allowed = new Set([roles.moderatorRoleId, roles.adminRoleId].filter(Boolean));

  return [...roleIds].some((roleId) => allowed.has(roleId));
}

export async function isOrganizerOrModerator(
  guild: Guild | null,
  userId: string,
  organizerId: string,
  roles: RoleConfig,
): Promise<boolean> {
  if (userId === organizerId) return true;

  if (!guild) return false;

  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => undefined));

  return member
    ? hasModeratorRole(member.roles.cache.keys(), roles, member.permissions.has(PermissionFlagsBits.Administrator))
    : false;
}
