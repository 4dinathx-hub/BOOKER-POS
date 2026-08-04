import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { DEFAULT_ROLE_PERMISSIONS, Permission, isImplicitFullAccess } from '../lib/permissions';

// The single place every route consults to decide "can this caller do this?"
// Usage: router.post('/menu', requireAuth, requirePermission('menu:write'), handler)
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) return res.status(401).json({ error: 'Unauthenticated' });

    if (isImplicitFullAccess(auth.role)) return next();

    // Restaurant-specific override takes precedence over the default matrix.
    if (auth.restaurantId) {
      const override = await prisma.rolePermission.findUnique({
        where: {
          restaurantId_role_permission: {
            restaurantId: auth.restaurantId,
            role: auth.role as any,
            permission,
          },
        },
      }).catch(() => null);
      if (override) {
        return override.granted ? next() : res.status(403).json({ error: `Missing permission: ${permission}` });
      }
    }

    const defaults = DEFAULT_ROLE_PERMISSIONS[auth.role as keyof typeof DEFAULT_ROLE_PERMISSIONS] ?? [];
    if (defaults.includes(permission)) return next();

    return res.status(403).json({ error: `Missing permission: ${permission}` });
  };
}
