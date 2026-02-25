(function () {
  const modal = document.getElementById("welcomeModal");
  const yesBtn = document.getElementById("welcomeYes");
  const noBtn = document.getElementById("welcomeNo");

  if (!modal || !yesBtn || !noBtn) return;

  // Verificar si el modal está activado en configuración
  if (!window.INVITACION_CONFIG?.audio?.welcomeModal) {
    console.log('🎵 Modal de bienvenida desactivado');
    return;
  }

  const closeModal = () => {
    modal.classList.add("welcome--hidden");
    setTimeout(() => {
      modal.style.display = "none";
    }, 280);
  };

  const getPlayer = () => window.__audioPlayer;

  // Always show modal on page load if enabled
  modal.style.display = "grid";
  modal.classList.remove("welcome--hidden");

  yesBtn.addEventListener("click", async () => {
    closeModal();
    const p = getPlayer();
    // This click counts as user gesture, so play should succeed.
    if (p && typeof p.togglePlay === "function") {
      try {
        await p.togglePlay();
      } catch {
        // ignore
      }
    }
  });

  noBtn.addEventListener("click", () => {
    closeModal();
  });
})();
