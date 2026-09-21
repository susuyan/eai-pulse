export function setupTimeline(root) {
  const search = root.querySelector("[data-timeline-search]");
  const count = root.querySelector("[data-result-count]");
  const filterRow = root.querySelector(".chip-row");
  const dateJumpOffset = 154;
  let activeTrack = new URLSearchParams(location.search).get("track") || "all";
  let filterDragged = false;
  const cards = () => [...root.querySelectorAll("[data-event]")];
  const centerFilter = (button) => {
    const row = button?.closest(".chip-row");
    if (!row || !button) return;
    const left = button.offsetLeft - (row.clientWidth - button.clientWidth) / 2;
    row.scrollTo({
      left: Math.max(0, left),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };
  if (filterRow) {
    let startX = 0;
    let startScrollLeft = 0;

    filterRow.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      startX = event.clientX;
      startScrollLeft = filterRow.scrollLeft;
      filterDragged = false;
    });
    filterRow.addEventListener("pointermove", (event) => {
      if (event.buttons !== 1) return;
      const delta = event.clientX - startX;
      if (!filterDragged && Math.abs(delta) < 5) return;
      if (!filterDragged) filterRow.setPointerCapture(event.pointerId);
      filterDragged = true;
      event.preventDefault();
      filterRow.scrollLeft = startScrollLeft - delta;
    });
    filterRow.addEventListener("pointercancel", () => (filterDragged = false));
  }
  const setMonthExpanded = (month, expanded) => {
    month.classList.toggle("is-expanded", expanded);
    month.dataset.userExpanded = String(expanded);
    const button = month.querySelector("[data-timeline-month-toggle]");
    button?.setAttribute("aria-expanded", String(expanded));
    const label = button?.querySelector("span");
    if (label) {
      label.textContent = expanded
        ? button.dataset.expandedLabel || "Collapse this month"
        : button.dataset.collapsedLabel || "Show more this month";
    }
  };
  const prepareMonth = (month) => {
    if (month.dataset.monthReady === "true") return;
    month.dataset.monthReady = "true";
    month.dataset.userExpanded = "false";
    month.querySelector("[data-timeline-month-toggle]")?.addEventListener("click", () => {
      setMonthExpanded(month, month.dataset.userExpanded !== "true");
    });
  };
  const materializeMonth = (month) => {
    const template = month.querySelector("template[data-timeline-month-template]");
    if (!template) {
      prepareMonth(month);
      return false;
    }
    const placeholder = month.querySelector("[data-timeline-month-placeholder]");
    placeholder?.replaceWith(template.content.cloneNode(true));
    template.remove();
    month.removeAttribute("data-timeline-lazy-month");
    prepareMonth(month);
    return true;
  };
  const materializeAllMonths = () => {
    root.querySelectorAll("[data-timeline-month]").forEach(materializeMonth);
  };
  let dateJumpToken = 0;
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const updateSelectedDate = (month) => {
    const value = month?.dataset.timelineMonth;
    if (!value) return;
    const params = new URLSearchParams(location.search);
    params.set("date", value);
    history.replaceState(null, "", `${location.pathname}?${params}`);
  };
  const jumpToMonth = (month, updateUrl = true) => {
    if (!month) return;
    const token = ++dateJumpToken;
    materializeAllMonths();
    if (updateUrl) updateSelectedDate(month);
    requestAnimationFrame(() => {
      const align = (behavior) => {
        const top = month.getBoundingClientRect().top + scrollY - dateJumpOffset;
        window.scrollTo({ top: Math.max(0, top), behavior });
      };
      align(reducedMotion() ? "auto" : "smooth");
      setTimeout(() => {
        if (
          token !== dateJumpToken ||
          Math.abs(month.getBoundingClientRect().top - dateJumpOffset) < 8
        )
          return;
        align(reducedMotion() ? "auto" : "smooth");
      }, 700);
    });
  };
  const firstVisibleMonth = (year) =>
    [...(year?.querySelectorAll("[data-timeline-month]") || [])].find((month) => !month.hidden);
  const syncDateOptions = () => {
    root.querySelectorAll("[data-timeline-year-select]").forEach((select) => {
      [...select.options].forEach((option) => {
        option.disabled = Boolean(
          root.querySelector(`[data-timeline-year="${CSS.escape(option.value)}"]`)?.hidden,
        );
      });
    });
    root.querySelectorAll("[data-timeline-month-select]").forEach((select) => {
      [...select.options].forEach((option) => {
        option.disabled = Boolean(
          root.querySelector(`[data-timeline-month="${CSS.escape(option.value)}"]`)?.hidden,
        );
      });
    });
  };

  root
    .querySelectorAll("[data-timeline-month]:not([data-timeline-lazy-month])")
    .forEach(prepareMonth);
  root.querySelectorAll("[data-load-timeline-month]").forEach((button) => {
    button.addEventListener("click", () =>
      materializeMonth(button.closest("[data-timeline-month]")),
    );
  });
  root.querySelectorAll("[data-timeline-date-picker]").forEach((picker) => {
    picker.querySelector("[data-timeline-year-select]")?.addEventListener("change", (event) => {
      const year = root.querySelector(
        `[data-timeline-year="${CSS.escape(event.currentTarget.value)}"]`,
      );
      jumpToMonth(firstVisibleMonth(year));
    });
    picker.querySelector("[data-timeline-month-select]")?.addEventListener("change", (event) => {
      jumpToMonth(
        root.querySelector(`[data-timeline-month="${CSS.escape(event.currentTarget.value)}"]`),
      );
    });
  });

  if (root.dataset.timelineLazy === "true") {
    if ("IntersectionObserver" in window) {
      const lazyObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            materializeMonth(entry.target);
            lazyObserver.unobserve(entry.target);
          }
        },
        { rootMargin: "800px 0px", threshold: 0 },
      );
      root.querySelectorAll("[data-timeline-lazy-month]").forEach((month) => {
        lazyObserver.observe(month);
      });
    } else {
      materializeAllMonths();
    }
  }

  if ("IntersectionObserver" in window) {
    const monthObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const year = entry.target.closest("[data-timeline-year]");
          const marker = year?.querySelector("[data-timeline-current-month]");
          if (marker) marker.value = entry.target.dataset.timelineMonth || "";
        }
      },
      { rootMargin: "-142px 0px -62% 0px", threshold: 0 },
    );
    root.querySelectorAll("[data-timeline-month]").forEach((month) => {
      monthObserver.observe(month);
    });
  }

  const apply = () => {
    const query = String(search?.value || "")
      .trim()
      .toLowerCase();
    const filtering = activeTrack !== "all" || Boolean(query);
    if (filtering) materializeAllMonths();
    let visible = 0;
    cards().forEach((card) => {
      const inResearchGroup = Boolean(card.closest("[data-research-group]"));
      const trackMatch = inResearchGroup
        ? activeTrack === "all" || activeTrack === "research"
        : activeTrack === "all" ||
          (activeTrack === "official" && card.dataset.primary === "true") ||
          String(card.dataset.tracks || "")
            .split(" ")
            .includes(activeTrack);
      const queryMatch = !query || String(card.dataset.search || "").includes(query);
      card.hidden = !(trackMatch && queryMatch);
      if (!card.hidden) visible += 1;
    });
    root.querySelectorAll("[data-research-group]").forEach((group) => {
      const hasVisibleCards = [...group.querySelectorAll("[data-event]")].some(
        (card) => !card.hidden,
      );
      const allowed = activeTrack === "all" || activeTrack === "research";
      group.hidden = !allowed || !hasVisibleCards;
      group.open = allowed && hasVisibleCards && (activeTrack === "research" || Boolean(query));
    });
    root.querySelectorAll(".timeline-month").forEach((month) => {
      const pending = Boolean(month.querySelector("template[data-timeline-month-template]"));
      month.classList.toggle("is-filtering", filtering);
      const toggle = month.querySelector("[data-timeline-month-toggle]");
      if (toggle) toggle.hidden = filtering;
      if (pending && !filtering) {
        month.hidden = false;
        return;
      }
      month.hidden = ![...month.querySelectorAll("[data-event]")].some((card) => !card.hidden);
    });
    root.querySelectorAll(".timeline-year").forEach((year) => {
      year.hidden = ![...year.querySelectorAll(".timeline-month")].some((month) => !month.hidden);
    });
    syncDateOptions();
    if (count) {
      const hasPendingMonths = Boolean(
        root.querySelector("template[data-timeline-month-template]"),
      );
      const total =
        !filtering && hasPendingMonths ? Number(root.dataset.timelineTotal || visible) : visible;
      count.textContent =
        document.documentElement.lang === "en" ? `${total} events` : `${total} 个事件`;
    }
  };

  root.querySelectorAll("[data-filter-track]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filterTrack === activeTrack);
    button.addEventListener("click", () => {
      if (filterDragged) {
        filterDragged = false;
        return;
      }
      activeTrack = button.dataset.filterTrack || "all";
      root.querySelectorAll("[data-filter-track]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      const params = new URLSearchParams(location.search);
      activeTrack === "all" ? params.delete("track") : params.set("track", activeTrack);
      history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
      apply();
      centerFilter(button);
    });
  });
  search?.addEventListener("input", apply);
  apply();
  requestAnimationFrame(() => {
    const selectedDate = new URLSearchParams(location.search).get("date");
    if (selectedDate) {
      jumpToMonth(root.querySelector(`[data-timeline-month="${CSS.escape(selectedDate)}"]`), false);
    }
  });
}

export function setupEmbodiedEvolutionTimeline(root) {
  if (!root || root.dataset.evolutionReady === "true") return;
  const filters = root.querySelector("[data-evolution-filters]");
  const buttons = [...root.querySelectorAll("[data-evolution-stage-filter]")];
  const cells = [...root.querySelectorAll("[data-evolution-stage]")];
  if (!filters || !buttons.length) return;
  root.dataset.evolutionReady = "true";
  const select = (stage) => {
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.evolutionStageFilter === stage));
    });
    cells.forEach((cell) => {
      cell.hidden = stage !== "all" && cell.dataset.evolutionStage !== stage;
    });
    root.dataset.evolutionFocus = stage;
  };
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => select(button.dataset.evolutionStageFilter || "all"));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    });
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    select("all");
    buttons[0]?.focus();
  });
  select("all");
  filters.hidden = false;
}
