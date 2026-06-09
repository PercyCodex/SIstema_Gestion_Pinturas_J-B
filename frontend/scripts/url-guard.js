"use strict";

/**
 * url-guard.js — DEBE CARGARSE PRIMERO que cualquier otro script.
 * Bloquea toda navegación por URL y mantiene la app en /dashboard.
 * No emite errores ni warnings visibles al usuario.
 */
(function () {

    // ─── 1. Forzar /dashboard al cargar ──────────────────────────────
    (function normalizarRutaInicial() {
        const path = window.location.pathname;
        // Si no estamos en /dashboard, reemplazar sin crear entrada en historial
        if (path !== "/dashboard") {
            history.replaceState({ modulo: "dashboard" }, "", "/dashboard");
        }
    })();

    // ─── 2. Parchear history.pushState ────────────────────────────────
    const _pushState = history.pushState.bind(history);
    history.pushState = function (state, title, url) {
        // Permitir solo si la URL resultante es /dashboard o no tiene ruta de módulo
        const urlStr = String(url || "");
        const esPermitida = urlStr === "/dashboard" ||
                            urlStr === "" ||
                            urlStr.startsWith("?") ||
                            urlStr.startsWith("#");
        if (esPermitida) {
            _pushState({ ...state, _guardado: true }, title, "/dashboard");
        }
        // Si no es permitida, simplemente no navegamos (silencioso)
    };

    // ─── 3. Parchear history.replaceState ─────────────────────────────
    const _replaceState = history.replaceState.bind(history);
    history.replaceState = function (state, title, url) {
        const urlStr = String(url || "");
        const esPermitida = urlStr === "/dashboard" ||
                            urlStr === "" ||
                            urlStr.startsWith("?") ||
                            urlStr.startsWith("#");
        if (esPermitida) {
            _replaceState({ ...state, _guardado: true }, title, "/dashboard");
        }
    };

    // ─── 4. Interceptar popstate (botón Atrás/Adelante) ───────────────
    window.addEventListener("popstate", function (e) {
        // Siempre volver a /dashboard, silenciosamente
        _replaceState({ modulo: "dashboard", _guardado: true }, "", "/dashboard");
        e.stopImmediatePropagation();
    }, true); // capture=true para ejecutar antes que cualquier otro listener

    // ─── 5. Interceptar clics en <a href> con capture ─────────────────
    document.addEventListener("click", function (e) {
        const a = e.target.closest("a[href]");
        if (!a) return;

        const href = a.getAttribute("href") || "";

        // Permitir: anclas internas, javascript:, mailto:, tel:, target="_blank"
        if (
            href.startsWith("#") ||
            href.startsWith("javascript:") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:") ||
            a.target === "_blank" ||
            a.rel === "noopener" ||
            a.hasAttribute("data-modulo") // el router ya los maneja
        ) {
            return;
        }

        // Permitir enlaces externos (http/https a otro dominio)
        if (href.startsWith("http://") || href.startsWith("https://")) {
            const url = new URL(href, window.location.origin);
            if (url.origin !== window.location.origin) return;
        }

        // Todo lo demás: bloquear navegación
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true); // capture=true

    // ─── 6. Bloquear beforeunload solo si no es recarga explícita ─────
    // (No bloqueamos beforeunload para no molestar al usuario con diálogos)

})();