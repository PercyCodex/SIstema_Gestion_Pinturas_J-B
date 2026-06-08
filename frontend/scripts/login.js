"use strict";

// ─── Login adaptado a la nueva BD (pinturas.usuarios + pinturas.roles) ────────
// El endpoint POST /login devuelve: { message, user, rol, id }

const form    = document.querySelector("form");
const boton   = document.querySelector("button[type='submit']");
const mensaje = document.querySelector("#Mensaje");

let intentos = 0;

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (boton.disabled) return;

    const username = document.querySelector("#username").value.trim();
    const password = document.querySelector("#password").value;

    if (!username || !password) {
        mostrarMensaje("Completa todos los campos.", true);
        return;
    }

    boton.disabled    = true;
    boton.textContent = "Verificando…";

    try {
        const response = await fetch("http://localhost:3000/login", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ username, password }),
        });

        const data = await response.json();

        // El backend devuelve { message, user, rol, id } cuando hay acceso
        if (data.user && data.id) {
            intentos = 0;

            // Guardar datos de sesión en localStorage
            localStorage.setItem("nombreUsuario", data.user);
            localStorage.setItem("rolUsuario",    data.rol   || "");
            localStorage.setItem("idUsuario",      String(data.id));

            // Mostrar modal de bienvenida
            const modalMsg = document.getElementById("mensajeModal");
            const modal    = document.getElementById("modal");
            if (modalMsg) modalMsg.textContent = data.message || "¡Bienvenido!";
            if (modal)    modal.style.display  = "flex";

        } else {
            // Credenciales incorrectas
            intentos++;
            const txt = intentos < 3
                ? `${data.message} (Intento ${intentos}/3)`
                : data.message;
            mostrarMensaje(txt, true);

            if (intentos >= 3) {
                bloquear(5);
            } else {
                setTimeout(() => ocultarMensaje(), 3500);
            }
        }

    } catch (err) {
        console.error("Error de red:", err);
        mostrarMensaje("Error de conexión con el servidor.", true);
    } finally {
        if (!boton.disabled || intentos >= 3) {
            // no restaurar si está bloqueado
        }
        boton.disabled    = false;
        boton.textContent = "Iniciar sesión";
    }
});

// ─── Bloqueo temporal ────────────────────────────────────────────────────────
function bloquear(minutos) {
    let segundos = minutos * 60;

    boton.disabled          = true;
    boton.style.opacity     = "0.5";
    boton.textContent       = "Bloqueado";

    const usernameInput = document.querySelector("#username");
    const passwordInput = document.querySelector("#password");
    if (usernameInput) usernameInput.disabled = true;
    if (passwordInput) passwordInput.disabled = true;

    const intervalo = setInterval(() => {
        const m = Math.floor(segundos / 60);
        const s = segundos % 60;
        mostrarMensaje(`Cuenta bloqueada. Espere ${m}:${s < 10 ? "0" + s : s}`, true);
        segundos--;

        if (segundos < 0) {
            clearInterval(intervalo);
            intentos = 0;

            boton.disabled      = false;
            boton.style.opacity = "1";
            boton.textContent   = "Iniciar sesión";

            if (usernameInput) usernameInput.disabled = false;
            if (passwordInput) passwordInput.disabled = false;

            ocultarMensaje();
        }
    }, 1000);
}

// ─── Helpers UI ──────────────────────────────────────────────────────────────
function mostrarMensaje(texto, esError = false) {
    if (!mensaje) return;
    mensaje.textContent    = texto;
    mensaje.style.display  = "block";
    mensaje.style.color    = esError ? "#dc2626" : "#16a34a";
}

function ocultarMensaje() {
    if (!mensaje) return;
    mensaje.style.display = "none";         
}