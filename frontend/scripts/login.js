const form = document.querySelector("form");
const boton = document.querySelector("button[type='submit']");
const mensaje = document.querySelector("#Mensaje");
let intentos = 0;

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (boton.disabled) return;

    const username = document.querySelector("#username").value;
    const password = document.querySelector("#password").value;

    try {
        const response = await fetch("http://localhost:3000/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.user) {
            intentos = 0;

            localStorage.setItem("nombreUsuario", data.user);
            localStorage.setItem("rolUsuario", data.rol);
            localStorage.setItem("idUsuario", data.id); /* agregador recintemente*/

            document.getElementById("mensajeModal").textContent = data.message;
            document.getElementById("modal").style.display = "flex";

        } else {
            intentos++;

            mensaje.textContent = intentos < 3
                ? `${data.message} (Intento ${intentos}/3)`
                : data.message;

            mensaje.style.display = "block";

            if (intentos >= 3) {
                bloquear(5);
            } else {
                setTimeout(() => {
                    mensaje.style.display = "none";
                }, 3000);
            }
        }

    } catch (error) {
        console.error("Error:", error);
        mensaje.textContent = "Error de conexión con el servidor";
        mensaje.style.display = "block";
    }
});

function bloquear(minutos) {
    let segundos = minutos * 60;

    boton.disabled = true;
    boton.style.opacity = "0.5";

    document.querySelector("#username").disabled = true;
    document.querySelector("#password").disabled = true;

    const intervalo = setInterval(() => {
        const m = Math.floor(segundos / 60);
        const s = segundos % 60;

        mensaje.textContent = `Bloqueado. Espere ${m}:${s < 10 ? "0" + s : s}`;

        segundos--;

        if (segundos <= 0) {
            clearInterval(intervalo);

            intentos = 0;

            boton.disabled = false;
            boton.style.opacity = "1";

            document.querySelector("#username").disabled = false;
            document.querySelector("#password").disabled = false;

            mensaje.style.display = "none";
        }
    }, 1000);
}