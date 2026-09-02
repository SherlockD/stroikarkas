(() => {
  const sources = {
    projects: "content/projects.json",
    currentBuilds: "content/current-builds.json",
    reviews: "content/reviews.json",
    completedProjects: "content/completed-projects.json",
    constructionUpdates: "content/construction-updates.json",
  };

  const escapeHtml = (value = "") =>
    String(value).replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );

  const safeUrl = (value = "") => {
    const url = String(value).trim();
    return /^(?:assets\/|https:\/\/)/i.test(url) ? escapeHtml(url) : "";
  };

  const safeEmbedUrl = (value = "") => {
    try {
      const url = new URL(String(value));
      const allowedEmbeds = [
        ["rutube.ru", "/play/embed/"],
        ["www.youtube.com", "/embed/"],
        ["www.youtube-nocookie.com", "/embed/"],
        ["player.vimeo.com", "/video/"],
      ];
      const allowed =
        url.protocol === "https:" &&
        allowedEmbeds.some(([hostname, path]) => url.hostname === hostname && url.pathname.startsWith(path));

      return allowed ? escapeHtml(url.href) : "";
    } catch {
      return "";
    }
  };

  const safeId = (value = "item") =>
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";

  const formatArea = (value) =>
    Number.isFinite(Number(value)) && Number(value) > 0
      ? new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value))
      : "—";

  const formatPrice = (value) =>
    `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value) || 0)} ₽`;

  const visibleItems = (data) =>
    Array.isArray(data?.items)
      ? data.items
          .filter((item) => item && typeof item === "object" && item.published !== false)
          .sort((first, second) => (Number(first.order) || 0) - (Number(second.order) || 0))
      : [];

  const ensureUniqueIds = (items, collectionName) => {
    const seen = new Set();
    const normalizedIds = new Map();

    items.forEach((item) => {
      const id = String(item.id || "").trim();

      if (!id) {
        throw new Error(`В коллекции «${collectionName}» найдена запись без id.`);
      }

      if (seen.has(id)) {
        throw new Error(`В коллекции «${collectionName}» повторяется id «${id}».`);
      }

      const normalizedId = safeId(id);
      const conflictingId = normalizedIds.get(normalizedId);

      if (conflictingId) {
        throw new Error(
          `В коллекции «${collectionName}» id «${id}» конфликтует с id «${conflictingId}». Используйте разные id латиницей.`,
        );
      }

      seen.add(id);
      normalizedIds.set(normalizedId, id);
    });
  };

  const renderEmptyCarousel = (stage, message) => {
    stage.innerHTML = `<p class="content-empty">${escapeHtml(message)}</p>`;
    stage.setAttribute("aria-busy", "false");
    stage.closest("[data-carousel]")?.querySelector("[data-carousel-controls]")?.setAttribute("hidden", "");
    stage.closest("[data-carousel]")?.querySelector("[data-carousel-progress]")?.setAttribute("hidden", "");
  };

  const imageMarkup = (image, attributes = "") => {
    const src = safeUrl(image?.src) || "assets/image-placeholder.png";
    const alt = escapeHtml(image?.alt || "");
    const fit = image?.fit === "contain" ? ' data-image-fit="contain"' : "";

    return `<img src="${src}" alt="${alt}" width="1448" height="1086"${fit} ${attributes} />`;
  };

  const renderProjects = (data) => {
    const tabList = document.querySelector("[data-project-tabs]");
    const panelHost = document.querySelector("[data-project-panels]");
    const categories = Array.isArray(data?.categories) ? data.categories : [];
    const projects = visibleItems(data);

    if (!tabList || !panelHost || categories.length === 0) {
      throw new Error("В projects.json не найдены категории каталога.");
    }

    ensureUniqueIds(categories, "projects.categories");
    ensureUniqueIds(projects, "projects");

    const categoryIds = new Set(categories.map((category) => String(category.id)));
    const projectWithUnknownCategory = projects.find(
      (project) => !categoryIds.has(String(project.category)),
    );

    if (projectWithUnknownCategory) {
      throw new Error(
        `У проекта «${projectWithUnknownCategory.id}» указана неизвестная категория «${projectWithUnknownCategory.category}».`,
      );
    }

    window.stroikarkasContent = {
      ...(window.stroikarkasContent || {}),
      projectsById: new Map(projects.map((project) => [String(project.id), project])),
    };

    tabList.innerHTML = categories
      .map((category, index) => {
        const id = safeId(category.id);
        const selected = index === 0;

        return `
          <button
            class="project-category-tab"
            id="projects-tab-${id}"
            type="button"
            role="tab"
            aria-selected="${selected}"
            aria-controls="projects-panel-${id}"
            ${selected ? "" : 'tabindex="-1"'}
            data-project-tab="${escapeHtml(category.id)}"
          >
            <span class="project-category-label">${escapeHtml(category.label)}</span>
          </button>`;
      })
      .join("");

    panelHost.innerHTML = categories
      .map((category, categoryIndex) => {
        const id = safeId(category.id);
        const categoryProjects = projects.filter((project) => project.category === category.id);
        const cards = categoryProjects
          .map((project, projectIndex) => {
            const parameters = project.parameters || {};
            const images = Array.isArray(project.images) ? project.images.filter((image) => image?.src) : [];
            const primaryImage = images[0] || {};
            const extraImages = images.slice(1);
            const dataAttributes = [
              `data-project-id="${escapeHtml(project.id)}"`,
              `data-building-type="${escapeHtml(project.category)}"`,
              parameters.length ? `data-project-length="${escapeHtml(parameters.length)}"` : "",
              parameters.width ? `data-project-width="${escapeHtml(parameters.width)}"` : "",
              parameters.bathRooms ? `data-bath-rooms="${escapeHtml(parameters.bathRooms)}"` : "",
              parameters.gazeboType ? `data-gazebo-type="${escapeHtml(parameters.gazeboType)}"` : "",
            ]
              .filter(Boolean)
              .join(" ");

            const gallery = extraImages.length
              ? `<template data-project-gallery>${extraImages
                  .map((image) => imageMarkup(image))
                  .join("")}</template>`
              : "";

            return `
              <article class="project-card${project.example ? " is-example" : ""}" ${dataAttributes}>
                <div class="project-topline">
                  <span>${String(projectIndex + 1).padStart(2, "0")}</span><span>${formatArea(project.area)} м²</span>
                </div>
                ${imageMarkup(primaryImage, 'loading="lazy"')}
                ${gallery}
                <div class="project-name">
                  <h3>${escapeHtml(project.code)}</h3>
                  <span>${escapeHtml(project.package)}</span>
                </div>
                <p class="project-price" aria-describedby="catalog-price-note">${formatPrice(project.price)}</p>
                <button class="project-card-open" type="button" data-project-open aria-haspopup="dialog" aria-controls="project-dialog" aria-label="Открыть проект ${escapeHtml(project.code)}">
                  <span>Подробнее</span>
                  <span class="project-card-open-icon" aria-hidden="true">
                    <svg class="ui-icon" viewBox="0 0 24 24" focusable="false">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </span>
                </button>
              </article>`;
          })
          .join("");

        return `
          <div
            class="shell project-grid project-category-panel"
            id="projects-panel-${id}"
            role="tabpanel"
            aria-labelledby="projects-tab-${id}"
            data-project-panel="${escapeHtml(category.id)}"
            data-building-type="${escapeHtml(category.id)}"
            ${categoryIndex === 0 ? "" : "hidden"}
          >
            ${cards || '<p class="content-empty">В этой категории пока нет опубликованных проектов.</p>'}
          </div>`;
      })
      .join("");

    tabList.setAttribute("aria-busy", "false");
  };

  const renderCurrentBuilds = (data) => {
    const stage = document.querySelector("[data-current-builds]");
    const items = visibleItems(data);

    if (!stage) {
      return;
    }

    ensureUniqueIds(items, "current-builds");

    if (items.length === 0) {
      renderEmptyCarousel(stage, "Опубликованных проектов в работе пока нет.");
      return;
    }

    stage.innerHTML = items
      .map(
        (item, index) => `
          <figure class="hero-project${index === 0 ? " is-active" : ""}${item.example ? " is-example" : ""}" data-carousel-slide ${index === 0 ? "" : "hidden"}>
            <div class="hero-media">
              ${imageMarkup(item.image, index === 0 ? 'fetchpriority="high"' : 'loading="lazy"')}
            </div>
            <figcaption class="hero-project-info">
              <p class="hero-project-heading">
                <strong>${escapeHtml(item.projectCode)}</strong>
                <span class="hero-project-dot" aria-hidden="true">·</span>
                <span>${escapeHtml(item.status)}</span>
              </p>
              <p class="hero-project-stage">
                <span>Этап: ${escapeHtml(item.stage)}</span>
                <span class="hero-project-dot" aria-hidden="true">·</span>
                <strong>${formatArea(item.area)} м²</strong>
              </p>
            </figcaption>
          </figure>`,
      )
      .join("");

    stage.setAttribute("aria-busy", "false");
  };

  const renderReviews = (data) => {
    const stage = document.querySelector("[data-reviews]");
    const items = visibleItems(data);

    if (!stage) {
      return;
    }

    ensureUniqueIds(items, "reviews");

    if (items.length === 0) {
      renderEmptyCarousel(stage, "Опубликованных отзывов пока нет.");
      return;
    }

    stage.innerHTML = items
      .map(
        (item, index) => `
          <article class="review-feature${index === 0 ? " is-active" : ""}${item.example ? " is-example" : ""}" data-carousel-slide ${index === 0 ? "" : "hidden"}>
            <div class="review-quote">
              <span class="review-label">${escapeHtml(item.label)}</span>
              <span class="review-mark" aria-hidden="true">“</span>
              <blockquote>${escapeHtml(item.text)}</blockquote>
              <footer class="review-author">
                <strong>${escapeHtml(item.author)}</strong>
                <span>${escapeHtml(item.role)}</span>
              </footer>
            </div>
            <figure class="review-media">
              ${imageMarkup(item.image, 'loading="lazy"')}
              <figcaption>${escapeHtml(item.caption)}</figcaption>
            </figure>
          </article>`,
      )
      .join("");

    stage.setAttribute("aria-busy", "false");
  };

  const renderCompletedProjects = (data) => {
    const ledger = document.querySelector("[data-completed-projects]");
    const items = visibleItems(data);

    if (!ledger) {
      return;
    }

    ensureUniqueIds(items, "completed-projects");

    if (items.length === 0) {
      ledger.innerHTML = '<p class="content-empty">Опубликованных реализованных проектов пока нет.</p>';
      ledger.setAttribute("aria-busy", "false");
      return;
    }

    let photoIndex = 0;

    ledger.innerHTML = items
      .map((item, index) => {
        if (item.type === "video") {
          const frameId = `project-video-${safeId(item.id)}`;
          const url = safeUrl(item.url);
          const embedUrl = safeEmbedUrl(item.embedUrl);

          if (!embedUrl) {
            throw new Error(`Для видео «${item.id}» указан неподдерживаемый embedUrl.`);
          }

          return `
            <article class="project-video-card">
              <div class="project-video-player" data-video-player>
                <a class="project-video-link" href="${url}" target="_blank" rel="noopener noreferrer" data-video-open aria-controls="${frameId}" aria-label="Запустить видеообзор ${escapeHtml(item.title)}, длительность ${escapeHtml(item.duration)}">
                  <img src="${safeUrl(item.cover)}" alt="${escapeHtml(item.coverAlt || "")}" width="1280" height="720" loading="lazy" />
                  <span class="project-video-play" aria-hidden="true">
                    <span class="video-play-mark">
                      <svg class="video-play-icon" viewBox="0 0 24 24" focusable="false"><path d="m9 7 8 5-8 5z" /></svg>
                    </span>
                  </span>
                  <span class="project-video-duration" aria-hidden="true">${escapeHtml(item.duration)}</span>
                </a>
                <iframe class="project-video-embed" id="${frameId}" title="Видеообзор ${escapeHtml(item.title)}" data-video-frame data-src="${embedUrl}" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" hidden></iframe>
              </div>
              <span>${escapeHtml(item.label || "Видеообзор")}</span>
              <p>${escapeHtml(item.title)}</p>
              <small>${escapeHtml(item.status)}</small>
            </article>`;
        }

        photoIndex += 1;

        return `
          <article class="${item.example ? "is-example" : ""}">
            ${imageMarkup(item.image, 'loading="lazy"')}
            <span>${String(photoIndex).padStart(2, "0")}</span>
            <p>${escapeHtml(item.title)}</p>
            <small>${escapeHtml(item.status)}</small>
          </article>`;
      })
      .join("");

    ledger.setAttribute("aria-busy", "false");
  };

  const renderConstructionUpdates = (data) => {
    const stage = document.querySelector("[data-construction-updates]");
    const items = visibleItems(data);

    if (!stage) {
      return;
    }

    ensureUniqueIds(items, "construction-updates");

    if (items.length === 0) {
      renderEmptyCarousel(stage, "Опубликованных фотоотчётов пока нет.");
      return;
    }

    stage.innerHTML = items
      .map(
        (item, index) => `
          <figure class="placeholder-frame${index === 0 ? " is-active" : ""}${item.example ? " is-example" : ""}" data-carousel-slide ${index === 0 ? "" : "hidden"}>
            ${imageMarkup(item.image, 'loading="lazy"')}
            <figcaption><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.stage)}</small></figcaption>
          </figure>`,
      )
      .join("");

    stage.setAttribute("aria-busy", "false");
  };

  const showLoadError = (selector, title) => {
    const container = document.querySelector(selector);

    if (container) {
      container.innerHTML = `<p class="content-load-error">Не удалось загрузить раздел «${escapeHtml(title)}». Проверьте JSON-файл и откройте сайт через веб-сервер.</p>`;
      container.setAttribute("aria-busy", "false");
      container.closest("[data-carousel]")?.querySelector("[data-carousel-controls]")?.setAttribute("hidden", "");
      container.closest("[data-carousel]")?.querySelector("[data-carousel-progress]")?.setAttribute("hidden", "");
    }
  };

  const loadJson = async ([name, path]) => {
    try {
      const response = await fetch(path, { cache: "no-cache" });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return [name, await response.json(), null];
    } catch (error) {
      console.error(`Не удалось загрузить ${path}:`, error);
      return [name, null, error];
    }
  };

  const start = async () => {
    const entries = await Promise.all(Object.entries(sources).map(loadJson));
    const content = Object.fromEntries(entries.map(([name, data]) => [name, data]));
    const errors = Object.fromEntries(entries.map(([name, , error]) => [name, error]));

    const renderSection = (name, renderer, selector, title) => {
      if (!content[name]) {
        showLoadError(selector, title);
        return;
      }

      try {
        renderer(content[name]);
      } catch (error) {
        errors[name] = error;
        console.error(`Не удалось отрисовать раздел «${title}»:`, error);
        showLoadError(selector, title);
      }
    };

    renderSection("projects", renderProjects, "[data-project-panels]", "Каталог проектов");
    document.querySelector("[data-project-tabs]")?.setAttribute("aria-busy", "false");
    renderSection("currentBuilds", renderCurrentBuilds, "[data-current-builds]", "Проекты в работе");
    renderSection("reviews", renderReviews, "[data-reviews]", "Отзывы");
    renderSection(
      "completedProjects",
      renderCompletedProjects,
      "[data-completed-projects]",
      "Реализованные проекты",
    );
    renderSection(
      "constructionUpdates",
      renderConstructionUpdates,
      "[data-construction-updates]",
      "Со стройплощадки",
    );

    document.documentElement.classList.toggle(
      "has-content-load-error",
      Object.values(errors).some(Boolean),
    );

  };

  start()
    .catch((error) => {
      console.error("Не удалось подготовить контент сайта:", error);
      document.documentElement.classList.add("has-content-load-error");
    })
    .finally(() => window.initializeStroikarkas?.());
})();
