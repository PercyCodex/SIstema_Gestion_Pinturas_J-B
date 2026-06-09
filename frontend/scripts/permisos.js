"use strict";

/**
 * Centralized Permission Management
 * Handles role-based access control for frontend
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
 * Get current user role from localStorage
 */
function getCurrentRole() {
    return localStorage.getItem("rolUsuario") || "";
}

/**
 * Get current user permissions from localStorage
 */
function getCurrentPermissions() {
    try {
        return JSON.parse(localStorage.getItem("permisosUsuario") || "[]");
    } catch (e) {
        return [];
    }
}

/**
 * Check if current user has full access
 */
function hasFullAccess() {
    const role = getCurrentRole().trim().toUpperCase();
    return FULL_ACCESS_ROLES.includes(role);
}

/**
 * Check if user can access a specific module
 */
function canAccessModule(moduleName) {
    if (hasFullAccess()) return true;

    const role = getCurrentRole().trim().toUpperCase();
    const blockedModules = ROLE_RESTRICTIONS[role] || [];
    
    // Check if module is in blocked list
    if (blockedModules.includes(moduleName)) {
        return false;
    }

    // Check permissions from database if available
    const permissions = getCurrentPermissions();
    const modulePermission = permissions.find(p => p.modulo === moduleName);
    
    if (modulePermission) {
        return modulePermission.ver === true;
    }

    // Default: allow if not explicitly blocked
    return true;
}

/**
 * Check if user can perform a specific action on a module
 */
function canPerformAction(moduleName, action) {
    if (hasFullAccess()) return true;

    const role = getCurrentRole().trim().toUpperCase();

    // USUARIO role (level 1) can only view, not modify
    if (role === "USUARIO" && action !== "ver") {
        return false;
    }

    // Check permissions from database
    const permissions = getCurrentPermissions();
    const modulePermission = permissions.find(p => p.modulo === moduleName);
    
    if (modulePermission) {
        return modulePermission[action] === true;
    }

    // Default: allow for non-USUARIO roles if not restricted
    return role !== "USUARIO";
}

/**
 * Check if user can create items in a module
 */
function canCreate(moduleName) {
    return canPerformAction(moduleName, "crear");
}

/**
 * Check if user can edit items in a module
 */
function canEdit(moduleName) {
    return canPerformAction(moduleName, "editar");
}

/**
 * Check if user can delete items in a module
 */
function canDelete(moduleName) {
    return canPerformAction(moduleName, "eliminar");
}

/**
 * Get list of accessible modules for current user
 */
function getAccessibleModules() {
    const allModules = [
        "dashboard", "usuarios", "perfiles", "categoria", "marcas",
        "inventario", "productos", "ventas", "clientes", "presentaciones",
        "proveedores", "mezclas", "reportes", "configuraciones"
    ];

    return allModules.filter(module => canAccessModule(module));
}

/**
 * Hide/show elements based on permissions
 * Call this after loading a module to hide/show buttons based on user permissions
 */
function applyModulePermissions(moduleName) {
    // Hide/show "Crear" button
    const crearBtns = document.querySelectorAll(".btn-crear, [data-action='crear']");
    crearBtns.forEach(btn => {
        btn.style.display = canCreate(moduleName) ? "" : "none";
    });

    // Hide/show "Editar" buttons
    const editarBtns = document.querySelectorAll(".btn-editar, [data-action='editar']");
    editarBtns.forEach(btn => {
        btn.style.display = canEdit(moduleName) ? "" : "none";
    });

    // Hide/show "Eliminar" buttons
    const eliminarBtns = document.querySelectorAll(".btn-eliminar, [data-action='eliminar']");
    eliminarBtns.forEach(btn => {
        btn.style.display = canDelete(moduleName) ? "" : "none";
    });
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    return !!localStorage.getItem("token");
}

/**
 * Get user info
 */
function getUserInfo() {
    return {
        nombre: localStorage.getItem("nombreUsuario"),
        rol: getCurrentRole(),
        id: localStorage.getItem("idUsuario"),
        permisos: getCurrentPermissions()
    };
}

/**
 * Clear session (logout)
 */
function clearSession() {
    localStorage.clear();
}

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        ROLE_HIERARCHY,
        FULL_ACCESS_ROLES,
        ROLE_RESTRICTIONS,
        getCurrentRole,
        getCurrentPermissions,
        hasFullAccess,
        canAccessModule,
        canPerformAction,
        canCreate,
        canEdit,
        canDelete,
        getAccessibleModules,
        applyModulePermissions,
        isAuthenticated,
        getUserInfo,
        clearSession
    };
}
