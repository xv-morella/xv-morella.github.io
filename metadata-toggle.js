(function () {
  const toggleBtn = document.getElementById("metadataToggle");
  const infoPanel = document.getElementById("audioInfo");
  const label = document.getElementById("metadataLabel");
  const player = window.__audioPlayer;

  if (!toggleBtn || !infoPanel || !label || !player) return;

  let metadataEnabled = false;

  toggleBtn.addEventListener("click", () => {
    metadataEnabled = !metadataEnabled;
    
    if (metadataEnabled) {
      infoPanel.style.display = "flex";
      toggleBtn.classList.add("active");
      label.textContent = "ℹ";
      // Trigger metadata loading
      player.loadMetadata();
    } else {
      infoPanel.style.display = "none";
      toggleBtn.classList.remove("active");
      label.textContent = "ℹ";
    }
  });
})();
