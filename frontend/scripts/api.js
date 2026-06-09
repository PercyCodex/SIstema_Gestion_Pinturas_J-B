"use strict";

/**
 * Centralized API helper for all frontend fetch calls
 * Automatically includes JWT token and handles /api/ prefix
 */

const API_BASE_URL = "http://localhost:3000/api";

/**
 * Get JWT token from localStorage
 */
function getToken() {
    return localStorage.getItem("token");
}

/**
 * Create headers with Authorization token
 */
function getHeaders(contentType = "application/json") {
    const headers = {};
    
    if (contentType) {
        headers["Content-Type"] = contentType;
    }
    
    const token = getToken();
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    
    return headers;
}

/**
 * Handle API response errors
 */
async function handleResponse(response) {
    if (response.status === 401) {
        // Token expired or invalid - redirect to login
        localStorage.clear();
        window.location.href = "/index.html";
        throw new Error("Sesión expirada");
    }
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Error en la petición" }));
        throw new Error(error.message || `Error ${response.status}`);
    }
    
    return response.json();
}

/**
 * GET request
 */
export async function apiGet(endpoint) {
    const url = endpoint.startsWith("/") ? `${API_BASE_URL}${endpoint}` : `${API_BASE_URL}/${endpoint}`;
    const response = await fetch(url, {
        method: "GET",
        headers: getHeaders()
    });
    return handleResponse(response);
}

/**
 * POST request
 */
export async function apiPost(endpoint, data) {
    const url = endpoint.startsWith("/") ? `${API_BASE_URL}${endpoint}` : `${API_BASE_URL}/${endpoint}`;
    const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(response);
}

/**
 * PUT request
 */
export async function apiPut(endpoint, data) {
    const url = endpoint.startsWith("/") ? `${API_BASE_URL}${endpoint}` : `${API_BASE_URL}/${endpoint}`;
    const response = await fetch(url, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(data)
    });
    return handleResponse(response);
}

/**
 * DELETE request
 */
export async function apiDelete(endpoint) {
    const url = endpoint.startsWith("/") ? `${API_BASE_URL}${endpoint}` : `${API_BASE_URL}/${endpoint}`;
    const response = await fetch(url, {
        method: "DELETE",
        headers: getHeaders()
    });
    return handleResponse(response);
}

/**
 * Login request (doesn't require JWT)
 */
export async function apiLogin(username, password) {
    const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    });
    return handleResponse(response);
}

/**
 * Public catalog request (optional JWT)
 */
export async function apiPublicCatalog(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE_URL}/public/catalogo${queryString ? `?${queryString}` : ""}`;
    
    const token = getToken();
    const headers = {};
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    
    const response = await fetch(url, {
        method: "GET",
        headers
    });
    return handleResponse(response);
}

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        apiGet,
        apiPost,
        apiPut,
        apiDelete,
        apiLogin,
        apiPublicCatalog,
        getToken,
        getHeaders
    };
}
