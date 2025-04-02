document.addEventListener("DOMContentLoaded", function() {
    const intro = document.getElementById("intro");
    const explorarBtn = document.getElementById("explorarBtn");
    const paginaPrincipal = document.getElementById("paginaPrincipal");

    // Revisar si los elementos existen antes de aplicar los eventos
    if (explorarBtn && intro && paginaPrincipal) {
        explorarBtn.addEventListener("click", function() {
            // Aplica la animación de desvanecimiento
            intro.classList.add("fade-out");

            // Espera 1 segundo antes de mostrar la página principal con transición
            setTimeout(() => {
                // Oculta la intro y muestra la página principal
                intro.style.display = "none"; // Mejor usar display: none para ocultar
                paginaPrincipal.classList.remove("oculto"); // Muestra la página principal
                paginaPrincipal.classList.add("fade-in"); // Añadir transición de entrada
            }, 1000); // Espera 1 segundo antes de la transición
        });
    }
});
