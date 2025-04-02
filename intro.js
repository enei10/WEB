document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("explorarBtn").addEventListener("click", function() {
        let intro = document.getElementById("intro");
        intro.classList.add("fade-out");

        setTimeout(() => {
            window.location.href = "index.html"; // Redirige a la página principal
        }, 1000);
    });
});