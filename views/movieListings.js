// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  const movieCards = document.querySelectorAll(".movie-card");

  for (const card of movieCards) {
    const toggleButton = card.querySelector(".toggle-button");

    // Add click handler
    toggleButton.addEventListener("click", () => {
      card.classList.toggle("collapsed");
    });

    // Add keyboard handler for accessibility
    toggleButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleButton.click();
      }
    });
  }
});
