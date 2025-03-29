const $ = (...args) =>
  (args.length == 2 ? args[0] : document).querySelector(args.at(-1));
const $$ = (...args) =>
  (args.length == 2 ? args[0] : document).querySelectorAll(args.at(-1));

// Initialize the page
document.addEventListener("DOMContentLoaded", () => {
  const movieCards = $$(".movie-card");

  for (const card of movieCards) {
    const collapseButton = $(card, ".js-toggle-collapsed");
    const seenLink = $(card, ".js-mark-seen");

    // Add click handler
    collapseButton.addEventListener("click", () => {
      card.classList.toggle("is-collapsed");
    });

    // Add keyboard handler for accessibility
    collapseButton.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        collapseButton.click();
      }
    });

    seenLink.addEventListener("click", (e) => {
      // Mark the movie as seen using api instead
      e.preventDefault();
      fetch(seenLink.href);

      const isSeen = card.classList.contains("is-seen");

      // Toggle the collapsed state
      if (isSeen) {
        card.classList.remove("is-seen");
        card.classList.remove("is-collapsed");
      } else {
        card.classList.add("is-seen");
        card.classList.add("is-collapsed");
      }

      if (!isSeen) {
        // Move the card to the bottom of the parent list
        const lastCard = Array.from(card.parentElement.children).at(-1);
        if (card !== lastCard) {
          card.parentElement.appendChild(card);
        }
      } else {
        // Move the card to the top of the parent list
        const firstCard = Array.from(card.parentElement.children).at(1);
        if (card !== firstCard) {
          card.parentElement.insertBefore(card, firstCard);
        }
      }
    });
  }
});
