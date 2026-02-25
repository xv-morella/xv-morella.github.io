(function () {
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const targets = Array.from(document.querySelectorAll(".hero, .section, .footer"));
  if (!targets.length) return;

  // Mark all as revealable
  targets.forEach((el) => {
    el.classList.add("reveal");
    if (reduceMotion) el.classList.add("is-visible");
  });

  if (reduceMotion) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -10% 0px",
    }
  );

  targets.forEach((el) => io.observe(el));
})();
