"use strict";

/**
 * Role-based Access Control Middleware
 * Checks if the authenticated user has the required role or permission level
 */

// Role hierarchy (higher number = more privileges)
const ROLE_HIERARCHY = {
    "SUPER ADMINISTRADOR": 5,
    "SUPERADMIN": 5,
    "ADMINISTRADOR": 4,
    "SUPERVISOR": 3,
    "ALMACENERO": 2,
    "CAJERO": 2,
    "VENDEDOR": 2,
    "USUARIO": 1
};

// Roles with full access (bypass permission checks)
const FULL_ACCESS_ROLES = ["SUPER ADMINISTRADOR", "SUPERADMIN", "ADMINISTRADOR"];

// Modules blocked by role (default restrictions)
const ROLE_RESTRICTIONS = {
    "SUPERVISOR": ["usuarios", "configuraciones", "perfiles"],
    "CAJERO": ["usuarios", "perfiles", "configuraciones", "proveedores", "inventario"],
    "ALMACENERO": ["usuarios", "perfiles", "configuraciones", "ventas"],
    "VENDEDOR": ["usuarios", "perfiles", "configuraciones", "proveedores", "inventario"],
    "USUARIO": ["usuarios", "perfiles", "configuraciones", "proveedores"]
};

/**
 * Check if user has minimum required role level
 */
const requireRoleLevel = (minLevel) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Usuario no autenticado" });
        }

        const userRole = (req.user.rol || "").trim().toUpperCase();
        const userLevel = ROLE_HIERARCHY[userRole] || 0;

        if (userLevel < minLevel) {
            return res.status(403).json({ message: "No tienes el nivel de rol requerido para esta acción" });
        }

        next();
    };
};

/**
 * Check if user has specific role
 */
const requireRole = (allowedRoles) => {
    const allowedUpper = allowedRoles.map(r => r.trim().toUpperCase());
    
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Usuario no autenticado" });
        }

        const userRole = (req.user.rol || "").trim().toUpperCase();

        if (!allowedUpper.includes(userRole)) {
            return res.status(403).json({ message: "No tienes el rol requerido para esta acción" });
        }

        next();
    };
};

/**
 * Check if user can access a specific module
 */
const requireModuleAccess = (moduleName) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Usuario no autenticado" });
        }

        const userRole = (req.user.rol || "").trim().toUpperCase();

        // Full access roles can access everything
        if (FULL_ACCESS_ROLES.includes(userRole)) {
            return next();
        }

        // Check if module is blocked for this role
        const blockedModules = ROLE_RESTRICTIONS[userRole] || [];
        if (blockedModules.includes(moduleName)) {
            return res.status(403).json({ message: `No tienes permiso para acceder al módulo ${moduleName}` });
        }

        next();
    };
};

/**
 * Check if user can perform a specific action (create, edit, delete)
 * This would typically check the permisos_perfil table, but for now uses role hierarchy
 */
const requirePermission = (action) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Usuario no autenticado" });
        }

        const userRole = (req.user.rol || "").trim().toUpperCase();

        // Full access roles can do everything
        if (FULL_ACCESS_ROLES.includes(userRole)) {
            return next();
        }

        // USUARIO role (level 1) can only view, not modify
        if (userRole === "USUARIO" && action !== "ver") {
            return res.status(403).json({ message: "Tu rol solo permite lectura, no puedes realizar esta acción" });
        }

        next();
    };
};

/**
 * Check if user can manage other users (only Super Admin and Admin)
 */
const requireUserManagement = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const userRole = (req.user.rol || "").trim().toUpperCase();

    if (!FULL_ACCESS_ROLES.includes(userRole)) {
        return res.status(403).json({ message: "Solo administradores pueden gestionar usuarios" });
    }

    next();
};

/**
 * Check hierarchy - prevent lower level users from managing higher level users
 */
const requireHigherOrEqualLevel = (targetUserId) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Usuario no autenticado" });
        }

        const userRole = (req.user.rol || "").trim().toUpperCase();
        const userLevel = ROLE_HIERARCHY[userRole] || 0;

        // Super Admin can manage everyone
        if (userLevel >= 5) {
            return next();
        }

        // Admin cannot manage other Admins or Super Admins
        if (userLevel === 4) {
            try {
                const pool = require("../src/database/postgres");
                const result = await pool.query(
                    `SELECT p.nombre FROM usuarios u 
                     JOIN perfiles p ON u.id_perfil = p.id_perfil 
                     WHERE u.id_usuario = $1`,
                    [targetUserId]
                );
                
                if (result.rows.length > 0) {
                    const targetRole = (result.rows[0].nombre || "").toUpperCase();
                    const targetLevel = ROLE_HIERARCHY[targetRole] || 0;
                    
                    if (targetLevel >= 4) {
                        return res.status(403).json({ message: "No puedes gestionar usuarios de este nivel" });
                    }
                }
            } catch (error) {
                console.error("Error checking user hierarchy:", error);
            }
        }

        next();
    };
};

module.exports = {
    ROLE_HIERARCHY,
    FULL_ACCESS_ROLES,
    ROLE_RESTRICTIONS,
    requireRoleLevel,
    requireRole,
    requireModuleAccess,
    requirePermission,
    requireUserManagement,
    requireHigherOrEqualLevel
};
