// Progressive enhancement for the by-film view: collapse toggles and marking
// movies as seen without a full page reload.
document.addEventListener("DOMContentLoaded", () => {
  for (const card of document.querySelectorAll(".movie-card")) {
    const collapseButton = card.querySelector(".js-toggle-collapsed");
    const seenLink = card.querySelector(".js-mark-seen");

    collapseButton?.addEventListener("click", () => {
      card.classList.toggle("is-collapsed");
    });

    seenLink?.addEventListener("click", (e) => {
      e.preventDefault();
      fetch(seenLink.href);

      const isSeen = card.classList.contains("is-seen");
      card.classList.toggle("is-seen", !isSeen);
      card.classList.toggle("is-collapsed", !isSeen);

      const cards = Array.from(card.parentElement.children);
      if (!isSeen) {
        // Newly seen: move to the bottom of the theater's list.
        if (card !== cards.at(-1)) card.parentElement.appendChild(card);
      } else {
        // Un-seen: move back to the top (after the theater heading).
        const firstCard = cards.at(1);
        if (card !== firstCard) card.parentElement.insertBefore(card, firstCard);
      }
    });
  }
});
