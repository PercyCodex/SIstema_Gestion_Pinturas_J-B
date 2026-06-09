"use strict";

/**
 * App Initialization and Session Management
 * Handles global app state, session validation, and initialization
 */

import { isAuthenticated, getUserInfo, clearSession } from "./permisos.js";

/**
 * Check if user is authenticated, redirect to login if not
 */
function checkSession() {
    if (!isAuthenticated()) {
        // If not on login page, redirect to login
        if (!window.location.pathname.endsWith("index.html") && 
            !window.location.pathname.endsWith("/")) {
            window.location.href = "/index.html";
            return false;
        }
    }
    return true;
}

/**
 * Initialize app when DOM is ready
 */
function initApp() {
    // Check session
    if (!checkSession()) {
        return;
    }

    // Set global user info
    const userInfo = getUserInfo();
    window.currentUser = userInfo;
    window.rolActual = userInfo.rol;
    window.idUsuarioActual = parseInt(userInfo.id, 10) || null;

    // Initialize sidebar
    initSidebar();

    // Handle 401 errors globally
    setupGlobalErrorHandling();
}

/**
 * Initialize sidebar with current user permissions
 */
function initSidebar() {
    const navLinks = document.querySelectorAll("#navegador a");
    const userInfo = getUserInfo();
    const role = userInfo.rol.trim().toUpperCase();

    navLinks.forEach(link => {
        const href = link.getAttribute("href") || "";
        if (!href) return;

        // Extract module name from href
        const moduleName = href.replace(".html", "").replace("/", "").split("/").pop();

        // Check if user can access this module
        const { canAccessModule } = require("./permisos.js");
        if (!canAccessModule(moduleName)) {
            const li = link.closest("li");
            if (li) li.style.display = "none";
        }

        // Mark active link based on current path
        const currentPath = window.location.pathname;
        if (currentPath.includes(moduleName) || 
            (moduleName === "dashboard" && currentPath === "/")) {
            link.classList.add("nav-active");
        }
    });
}

/**
 * Setup global error handling for API calls
 */
function setupGlobalErrorHandling() {
    window.addEventListener("unhandledrejection", (event) => {
        if (event.reason && event.reason.message === "Sesión expirada") {
            clearSession();
            window.location.href = "/index.html";
        }
    });
}

/**
 * Logout function
 */
function logout() {
    clearSession();
    window.location.href = "/index.html";
}

/**
 * Show toast notification
 */
function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 24px;
        background: ${type === "error" ? "#dc2626" : type === "success" ? "#16a34a" : "#3b82f6"};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease-out";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add toast animation styles
const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Export functions
export {
    initApp,
    checkSession,
    logout,
    showToast
};

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}
