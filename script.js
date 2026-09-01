(() => {
  const dialog = document.querySelector("[data-project-dialog]");
  const cards = Array.from(document.querySelectorAll(".project-card"));

  if (!dialog || cards.length === 0 || typeof dialog.showModal !== "function") {
    return;
  }

  const closeButton = dialog.querySelector("[data-project-dialog-close]");
  const dialogImage = dialog.querySelector("[data-project-dialog-image]");
  const dialogIndex = dialog.querySelector("[data-project-dialog-index]");
  const dialogTitle = dialog.querySelector("[data-project-dialog-title]");
  const dialogPackage = dialog.querySelector("[data-project-dialog-package]");
  const dialogArea = dialog.querySelector("[data-project-dialog-area]");
  const dialogPrice = dialog.querySelector("[data-project-dialog-price]");
  const selectButton = dialog.querySelector("[data-project-select]");
  const gallery = dialog.querySelector("[data-project-dialog-gallery]");
  const galleryControls = dialog.querySelector("[data-project-dialog-gallery-controls]");
  const galleryPrevious = dialog.querySelector("[data-project-dialog-gallery-prev]");
  const galleryNext = dialog.querySelector("[data-project-dialog-gallery-next]");
  const galleryCounter = dialog.querySelector("[data-project-dialog-gallery-counter]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeTrigger = null;
  let activeCard = null;
  let projectWasSelected = false;
  let projectImages = [];
  let activeImageIndex = 0;
  let galleryAnimation = null;

  const readProjectImages = (card) => {
    const primaryImage = card.querySelector(":scope > img");
    const imageTemplate = card.querySelector("template[data-project-gallery]");
    const extraImages =
      imageTemplate instanceof HTMLTemplateElement
        ? Array.from(imageTemplate.content.querySelectorAll("img"))
        : [];

    return [primaryImage, ...extraImages]
      .filter(Boolean)
      .map((image) => ({
        src: image.currentSrc || image.src || image.getAttribute("src") || "",
        alt: image.alt || "",
        fit: image.dataset.imageFit === "contain" ? "contain" : "cover",
      }))
      .filter((image) => image.src);
  };

  const updateGalleryControls = () => {
    const hasMultipleImages = projectImages.length > 1;

    galleryControls.hidden = !hasMultipleImages;
    galleryCounter.textContent = `${activeImageIndex + 1} / ${Math.max(projectImages.length, 1)}`;
    galleryPrevious.disabled = !hasMultipleImages;
    galleryNext.disabled = !hasMultipleImages;
  };

  const renderProjectImage = ({ direction = 1, animate = false } = {}) => {
    const image = projectImages[activeImageIndex];

    if (!image) {
      return;
    }

    galleryAnimation?.cancel();
    dialogImage.src = image.src;
    dialogImage.alt = image.alt;
    dialogImage.dataset.imageFit = image.fit;
    updateGalleryControls();

    if (animate && !reducedMotion.matches && typeof dialogImage.animate === "function") {
      galleryAnimation = dialogImage.animate(
        [
          {
            opacity: 0.25,
            transform: `translateX(${direction > 0 ? 18 : -18}px) scale(0.99)`,
          },
          { opacity: 1, transform: "translateX(0) scale(1)" },
        ],
        {
          duration: 360,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }
  };

  const moveProjectImage = (direction) => {
    if (projectImages.length < 2) {
      return;
    }

    activeImageIndex =
      (activeImageIndex + direction + projectImages.length) % projectImages.length;
    renderProjectImage({ direction, animate: true });
  };

  const openProject = (card, trigger) => {
    const topline = card.querySelectorAll(".project-topline span");

    dialogIndex.textContent = topline[0]?.textContent.trim() ?? "";
    dialogArea.textContent = topline[1]?.textContent.trim() ?? "";
    dialogTitle.textContent = card.querySelector(".project-name h3")?.textContent.trim() ?? "";
    dialogPackage.textContent = card.querySelector(".project-name span")?.textContent.trim() ?? "";
    dialogPrice.textContent = card.querySelector(".project-price")?.textContent.trim() ?? "";
    selectButton.setAttribute(
      "aria-label",
      `Хочу такой же проект, как ${dialogTitle.textContent}, и продолжить расчёт`,
    );
    galleryPrevious.setAttribute(
      "aria-label",
      `Предыдущее изображение проекта ${dialogTitle.textContent}`,
    );
    galleryNext.setAttribute(
      "aria-label",
      `Следующее изображение проекта ${dialogTitle.textContent}`,
    );

    projectImages = readProjectImages(card);
    activeImageIndex = 0;
    renderProjectImage();
    projectImages.slice(1).forEach(({ src }) => {
      const preload = new Image();
      preload.src = src;
    });

    activeTrigger = trigger;
    activeCard = card;
    document.body.classList.add("project-dialog-open");
    dialog.showModal();
  };

  cards.forEach((card) => {
    const trigger = card.querySelector("[data-project-open]");

    if (!trigger) {
      return;
    }

    card.addEventListener("click", (event) => {
      const clickedControl =
        event.target instanceof Element
          ? event.target.closest("a, button, input, select, textarea")
          : null;

      if (clickedControl && clickedControl !== trigger) {
        return;
      }

      openProject(card, trigger);
    });
  });

  closeButton.addEventListener("click", () => dialog.close());
  galleryPrevious.addEventListener("click", () => moveProjectImage(-1));
  galleryNext.addEventListener("click", () => moveProjectImage(1));

  gallery.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || projectImages.length < 2) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveProjectImage(-1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveProjectImage(1);
    }
  });

  selectButton.addEventListener("click", () => {
    if (!activeCard) {
      return;
    }

    const topline = activeCard.querySelectorAll(".project-topline span");
    const areaLabel = topline[1]?.textContent.trim() ?? "";
    const project = {
      code: activeCard.querySelector(".project-name h3")?.textContent.trim() ?? "",
      area: areaLabel.replace(/[^\d.,]/g, ""),
      areaLabel,
      buildingType:
        activeCard.dataset.buildingType ||
        activeCard.closest("[data-building-type]")?.dataset.buildingType ||
        "house",
    };

    projectWasSelected = true;
    dialog.close();
    document.dispatchEvent(new CustomEvent("catalog-project-select", { detail: project }));
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  dialog.addEventListener("close", () => {
    document.body.classList.remove("project-dialog-open");

    if (!projectWasSelected) {
      activeTrigger?.focus();
    }

    activeTrigger = null;
    activeCard = null;
    projectWasSelected = false;
    projectImages = [];
    activeImageIndex = 0;
    galleryAnimation?.cancel();
    galleryAnimation = null;
  });
})();

(() => {
  const player = document.querySelector("[data-video-player]");
  const trigger = document.querySelector("[data-video-open]");
  const frame = player?.querySelector("[data-video-frame]");

  if (!player || !trigger || !frame) {
    return;
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    frame.src = frame.dataset.src;
    frame.hidden = false;
    trigger.hidden = true;
    player.classList.add("is-playing");
    frame.focus();
  });
})();

(() => {
  const carousels = Array.from(document.querySelectorAll("[data-carousel]"));

  if (carousels.length === 0) {
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  carousels.forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll("[data-carousel-slide]"));
    const stage = carousel.querySelector("[data-carousel-stage]");
    const controls = carousel.querySelector("[data-carousel-controls]");
    const previousButton = carousel.querySelector("[data-carousel-prev]");
    const nextButton = carousel.querySelector("[data-carousel-next]");
    const counter = carousel.querySelector("[data-carousel-counter]");
    const progress = carousel.querySelector("[data-carousel-progress]");
    const progressBar = progress?.querySelector("span");
    const interval = Number.parseInt(carousel.dataset.carouselInterval ?? "0", 10);
    const canAutoplay = interval > 0 && slides.length > 1;
    let activeIndex = Math.max(
      0,
      slides.findIndex((slide) => slide.classList.contains("is-active")),
    );
    let rotationTimer = null;
    let rotationFrame = null;
    let progressAnimation = null;
    let transitionTimer = null;
    let liveRegionTimer = null;
    let transitionActive = false;
    let queuedTransition = null;
    let hoverPaused = false;
    let inViewport = !("IntersectionObserver" in window);

    if (!stage || slides.length === 0) {
      return;
    }

    carousel.style.setProperty("--carousel-interval", `${Math.max(interval, 1)}ms`);
    carousel.dataset.carouselDirection = "next";

    slides.forEach((slide, index) => {
      const active = index === activeIndex;

      slide.hidden = false;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "слайд");
      slide.setAttribute("aria-label", `${index + 1} из ${slides.length}`);
      slide.setAttribute("aria-hidden", String(!active));
      slide.inert = !active;
    });

    carousel.classList.add("is-carousel-ready");

    const motionDurationValue = window
      .getComputedStyle(carousel)
      .getPropertyValue("--carousel-motion-duration")
      .trim();
    const motionDuration = motionDurationValue.endsWith("ms")
      ? Number.parseFloat(motionDurationValue)
      : Number.parseFloat(motionDurationValue) * 1000;
    const transitionFallbackDuration = Number.isFinite(motionDuration)
      ? motionDuration + 150
      : 850;

    const updateCounter = (announce = false) => {
      if (!counter) {
        return;
      }

      window.clearTimeout(liveRegionTimer);
      counter.setAttribute("aria-live", announce ? "polite" : "off");
      counter.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(
        slides.length,
      ).padStart(2, "0")}`;

      if (announce) {
        liveRegionTimer = window.setTimeout(() => counter.setAttribute("aria-live", "off"), 1000);
      }
    };

    const clearRotationTimer = () => {
      window.clearTimeout(rotationTimer);
      window.cancelAnimationFrame(rotationFrame);
      progressAnimation?.cancel();
      rotationTimer = null;
      rotationFrame = null;
      progressAnimation = null;
      carousel.classList.remove("is-carousel-timing");
    };

    const shouldRotate = () =>
      canAutoplay &&
      !document.hidden &&
      inViewport &&
      !hoverPaused &&
      !reducedMotion.matches;

    const restartRotationTimer = () => {
      clearRotationTimer();

      if (!shouldRotate()) {
        return;
      }

      const scheduleNextSlide = () => {
        rotationTimer = window.setTimeout(() => {
          showSlide(activeIndex + 1, "next", false);
        }, interval);
      };

      if (progressBar && typeof progressBar.animate === "function") {
        progressAnimation = progressBar.animate(
          [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
          { duration: interval, easing: "linear", fill: "both" },
        );
        scheduleNextSlide();
        return;
      }

      if (!progressBar) {
        scheduleNextSlide();
        return;
      }

      // Two frames guarantee that the fallback CSS animation sees the class removal.
      rotationFrame = window.requestAnimationFrame(() => {
        rotationFrame = window.requestAnimationFrame(() => {
          rotationFrame = null;

          if (!shouldRotate()) {
            return;
          }

          carousel.classList.add("is-carousel-timing");
          scheduleNextSlide();
        });
      });
    };

    const preloadFollowingSlide = () => {
      const followingSlide = slides[(activeIndex + 1) % slides.length];

      followingSlide?.querySelectorAll("img").forEach((image) => {
        const preload = new Image();
        preload.src = image.currentSrc || image.src;
      });
    };

    const completeTransition = () => {
      if (!transitionActive) {
        return;
      }

      window.clearTimeout(transitionTimer);
      transitionTimer = null;
      transitionActive = false;
      slides.forEach((slide) => slide.classList.remove("is-entering", "is-leaving"));

      const nextTransition = queuedTransition;
      queuedTransition = null;

      if (nextTransition) {
        window.requestAnimationFrame(() => {
          showSlide(
            nextTransition.requestedIndex,
            nextTransition.direction,
            nextTransition.manual,
          );
        });
      }
    };

    function showSlide(requestedIndex, direction = "next", manual = true) {
      const nextIndex = (requestedIndex + slides.length) % slides.length;

      if (transitionActive && !reducedMotion.matches) {
        queuedTransition = { requestedIndex: nextIndex, direction, manual };
        return;
      }

      if (nextIndex === activeIndex) {
        restartRotationTimer();
        return;
      }

      const previousSlide = slides[activeIndex];
      const nextSlide = slides[nextIndex];

      window.clearTimeout(transitionTimer);
      slides.forEach((slide) => slide.classList.remove("is-entering", "is-leaving"));
      carousel.dataset.carouselDirection = direction;

      previousSlide.classList.remove("is-active");
      previousSlide.classList.add("is-leaving");
      previousSlide.setAttribute("aria-hidden", "true");
      previousSlide.inert = true;

      nextSlide.setAttribute("aria-hidden", "false");
      nextSlide.inert = false;
      nextSlide.classList.add("is-active", "is-entering");

      activeIndex = nextIndex;
      updateCounter(manual);
      preloadFollowingSlide();

      if (reducedMotion.matches) {
        slides.forEach((slide) => slide.classList.remove("is-entering", "is-leaving"));
      } else {
        transitionActive = true;
        transitionTimer = window.setTimeout(
          completeTransition,
          transitionFallbackDuration,
        );
      }

      restartRotationTimer();
    }

    stage.addEventListener("animationend", (event) => {
      if (
        transitionActive &&
        event.target === slides[activeIndex] &&
        event.animationName === "carousel-slide-enter"
      ) {
        completeTransition();
      }
    });

    if (controls) {
      controls.hidden = slides.length < 2;
    }

    if (progress) {
      progress.hidden = !canAutoplay;
    }

    updateCounter();
    preloadFollowingSlide();

    previousButton?.addEventListener("click", () => showSlide(activeIndex - 1, "prev"));
    nextButton?.addEventListener("click", () => showSlide(activeIndex + 1, "next"));

    carousel.addEventListener("pointerenter", () => {
      hoverPaused = true;
      restartRotationTimer();
    });

    carousel.addEventListener("pointerleave", () => {
      hoverPaused = false;
      restartRotationTimer();
    });

    document.addEventListener("visibilitychange", restartRotationTimer);

    if ("IntersectionObserver" in window) {
      const carouselObserver = new IntersectionObserver(
        ([entry]) => {
          inViewport = entry.isIntersecting && entry.intersectionRatio >= 0.15;
          restartRotationTimer();
        },
        { threshold: 0.15 },
      );

      carouselObserver.observe(carousel);
    } else {
      restartRotationTimer();
    }

    const handleMotionPreference = () => {
      if (reducedMotion.matches) {
        completeTransition();
      }

      restartRotationTimer();
    };

    if (typeof reducedMotion.addEventListener === "function") {
      reducedMotion.addEventListener("change", handleMotionPreference);
    } else {
      reducedMotion.addListener(handleMotionPreference);
    }
  });
})();

(() => {
  const form = document.querySelector("#estimate-form");

  if (!form) {
    return;
  }

  const card = document.querySelector("#estimate");
  const steps = Array.from(form.querySelectorAll(".form-step"));
  const totalSteps = steps.length;
  const currentStepLabel = card.querySelector("[data-current-step]");
  const stepNameLabel = card.querySelector("[data-step-name]");
  const progress = card.querySelector(".estimate-progress");
  const progressBar = card.querySelector("[data-progress-bar]");
  const buildingInputs = Array.from(form.querySelectorAll('input[name="building_type"]'));
  const objectFields = Array.from(form.querySelectorAll("[data-object-fields]"));
  const projectInputs = Array.from(form.querySelectorAll('input[name="project_state"]'));
  const projectDetails = form.querySelector("[data-project-details]");
  const projectReference = form.querySelector("[data-project-reference]");
  const projectReferenceLabel = form.querySelector("[data-project-reference-label]");
  const projectReferenceInput = projectReference.querySelector("input");
  const catalogSelection = form.querySelector("[data-catalog-selection]");
  const catalogSelectionCode = catalogSelection.querySelector("[data-catalog-selection-code]");
  const catalogSelectionArea = catalogSelection.querySelector("[data-catalog-selection-area]");
  const commentInput = form.querySelector('textarea[name="comment"]');
  const contactMethod = form.querySelector('select[name="contact_method"]');
  const emailInput = form.querySelector('input[name="email"]');
  const emailLabel = form.querySelector("[data-email-label]");
  const success = card.querySelector("[data-form-success]");
  const resetButton = card.querySelector("[data-form-reset]");
  const questionnaire = card.querySelector("[data-estimate-questionnaire]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const objectTitles = {
    house: "Уточним параметры дома",
    bath: "Уточним параметры бани",
    gazebo: "Уточним параметры беседки",
  };

  const commentPlaceholders = {
    house: "Например, нужен дом с большой террасой и двумя спальнями",
    bath: "Например, нужна терраса и отдельная моечная",
    gazebo: "Например, нужна мангальная зона и остекление",
  };

  let currentStep = 1;
  let selectedCatalogProject = null;

  const getStep = (number) => steps.find((step) => Number(step.dataset.step) === number);

  const getControls = (container) =>
    Array.from(container.querySelectorAll("input, select, textarea"));

  const getSelectedBuilding = () =>
    buildingInputs.find((input) => input.checked)?.value ?? "";

  const getSelectedProjectState = () =>
    projectInputs.find((input) => input.checked)?.value ?? "";

  const clearStepError = (step) => {
    const error = step.querySelector(".form-step-error");

    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
  };

  const clearControlError = (control) => {
    control.setCustomValidity("");
    control.removeAttribute("aria-invalid");

    if (control.type === "radio" && control.name) {
      form.querySelectorAll(`input[name="${control.name}"]`).forEach((radio) => {
        radio.setCustomValidity("");
        radio.removeAttribute("aria-invalid");
      });
    }
  };

  const clearCatalogSelection = () => {
    selectedCatalogProject = null;
    catalogSelection.hidden = true;
    catalogSelectionCode.textContent = "";
    catalogSelectionArea.textContent = "";
  };

  const resetProjectSetup = () => {
    steps
      .filter((step) => Number(step.dataset.step) <= 3)
      .forEach((step) => {
        getControls(step).forEach((control) => {
          if (control.type === "radio" || control.type === "checkbox") {
            control.checked = false;
          } else if (control instanceof HTMLSelectElement) {
            control.selectedIndex = 0;
          } else {
            control.value = "";
          }

          clearControlError(control);
        });

        clearStepError(step);
      });
  };

  const syncObjectFields = () => {
    const selectedBuilding = getSelectedBuilding();
    const parameterStep = getStep(2);
    const parameterLegend = parameterStep.querySelector("legend");

    parameterLegend.textContent = objectTitles[selectedBuilding] ?? "Уточним основные параметры";
    commentInput.placeholder =
      commentPlaceholders[selectedBuilding] ?? "Расскажите о важных пожеланиях";

    objectFields.forEach((group) => {
      const active = group.dataset.objectFields === selectedBuilding;
      group.hidden = !active;

      getControls(group).forEach((control) => {
        control.disabled = currentStep !== 2 || !active;

        if (!active) {
          clearControlError(control);
        }
      });
    });
  };

  const syncProjectReference = () => {
    const state = getSelectedProjectState();
    const isCatalog = state === "catalog";
    const isReference = state === "reference";
    const visible = isCatalog || isReference;

    projectDetails.hidden = !visible;
    projectReference.hidden = !visible;
    projectReferenceInput.disabled = currentStep !== 3 || !visible;
    projectReferenceInput.required = isCatalog;
    projectReferenceLabel.textContent = isCatalog ? "Код проекта *" : "Ссылка на пример";
    projectReferenceInput.placeholder = isCatalog
      ? "Например, СКТ–65"
      : "Вставьте ссылку на понравившийся проект";

    if (!visible) {
      clearControlError(projectReferenceInput);
    }
  };

  const syncContactMethod = () => {
    const emailRequired = contactMethod.value === "Email";

    emailInput.required = emailRequired;
    emailLabel.textContent = emailRequired ? "Email *" : "Email";

    if (!emailRequired) {
      clearControlError(emailInput);
    }
  };

  const updateProgress = (step) => {
    const activeStep = getStep(step);
    const stepName = activeStep.dataset.stepName;

    currentStepLabel.textContent = String(step);
    stepNameLabel.textContent = stepName;
    progress.setAttribute("aria-valuenow", String(step));
    progressBar.style.width = `${(step / totalSteps) * 100}%`;
  };

  const focusActiveStep = (shouldScroll) => {
    const activeStep = getStep(currentStep);
    const legend = activeStep.querySelector("legend");

    legend.tabIndex = -1;
    legend.focus({ preventScroll: true });

    if (shouldScroll) {
      questionnaire.scrollIntoView({
        behavior: reducedMotion.matches ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  const showStep = (nextStep, { focus = true, scroll = true } = {}) => {
    currentStep = Math.min(Math.max(nextStep, 1), totalSteps);

    steps.forEach((step) => {
      const active = Number(step.dataset.step) === currentStep;
      step.hidden = !active;
      step.classList.toggle("is-active", active);
      step.setAttribute("aria-hidden", String(!active));

      getControls(step).forEach((control) => {
        control.disabled = !active;
      });

      if (!active) {
        clearStepError(step);
      }
    });

    if (currentStep === 2) {
      syncObjectFields();
    }

    if (currentStep === 3) {
      syncProjectReference();
    }

    if (currentStep === 5) {
      syncContactMethod();
    }

    updateProgress(currentStep);

    if (focus) {
      focusActiveStep(scroll);
    }
  };

  const validationMessage = (control) => {
    if (control.validity.typeMismatch) {
      return "Проверьте формат введённых данных.";
    }

    if (control.validity.rangeUnderflow || control.validity.rangeOverflow) {
      return "Проверьте указанное значение.";
    }

    if (control.type === "radio") {
      return "Выберите один из вариантов.";
    }

    if (control.type === "checkbox") {
      return "Подтвердите согласие, чтобы продолжить.";
    }

    return "Заполните обязательное поле.";
  };

  const validateStep = (stepNumber) => {
    const step = getStep(stepNumber);
    const controls = getControls(step).filter((control) => !control.disabled);

    controls.forEach((control) => clearControlError(control));
    clearStepError(step);

    const invalidControl = controls.find((control) => !control.checkValidity());

    if (!invalidControl) {
      return true;
    }

    const message = validationMessage(invalidControl);
    const error = step.querySelector(".form-step-error");

    invalidControl.setCustomValidity(message);
    invalidControl.setAttribute("aria-invalid", "true");

    if (invalidControl.type === "radio" && invalidControl.name) {
      form.querySelectorAll(`input[name="${invalidControl.name}"]`).forEach((radio) => {
        radio.setAttribute("aria-invalid", "true");
      });
    }

    if (error) {
      error.textContent = message;
      error.hidden = false;
    }

    invalidControl.focus();
    return false;
  };

  const moveForward = () => {
    if (!validateStep(currentStep)) {
      return;
    }

    showStep(currentStep + 1);
  };

  form.addEventListener("click", (event) => {
    const nextButton = event.target.closest(".form-next");
    const backButton = event.target.closest(".form-back");

    if (nextButton) {
      moveForward();
    }

    if (backButton) {
      showStep(currentStep - 1);
    }
  });

  form.addEventListener("input", (event) => {
    const control = event.target.closest("input, select, textarea");

    if (!control) {
      return;
    }

    clearControlError(control);
    clearStepError(getStep(currentStep));

    if (control === projectReferenceInput && selectedCatalogProject) {
      clearCatalogSelection();
    }
  });

  form.addEventListener("change", (event) => {
    const control = event.target.closest("input, select, textarea");

    if (control) {
      clearControlError(control);
      clearStepError(getStep(currentStep));
    }

    if (event.target.matches('input[name="building_type"]')) {
      if (selectedCatalogProject && event.target.value !== selectedCatalogProject.buildingType) {
        clearCatalogSelection();
      }

      syncObjectFields();
    }

    if (event.target.matches('input[name="project_state"]')) {
      if (selectedCatalogProject && event.target.value !== "catalog") {
        clearCatalogSelection();
      }

      syncProjectReference();
    }

    if (event.target === contactMethod) {
      syncContactMethod();
    }
  });

  document.addEventListener("catalog-project-select", (event) => {
    const project = event.detail;

    if (!project?.code || !project?.buildingType) {
      return;
    }

    resetProjectSetup();

    const buildingInput = buildingInputs.find((input) => input.value === project.buildingType);
    const catalogInput = projectInputs.find((input) => input.value === "catalog");

    if (!buildingInput || !catalogInput) {
      return;
    }

    buildingInput.checked = true;
    catalogInput.checked = true;
    projectReferenceInput.value = project.code;

    if (project.buildingType === "house") {
      form.elements.house_area.value = project.area;
      form.elements.house_floors.value = "По выбранному проекту";
    }

    selectedCatalogProject = project;
    catalogSelectionCode.textContent = project.code;
    catalogSelectionArea.textContent = project.areaLabel;
    catalogSelection.hidden = false;

    form.hidden = false;
    success.hidden = true;
    syncObjectFields();
    syncProjectReference();
    showStep(4);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (currentStep < totalSteps) {
      moveForward();
      return;
    }

    if (!validateStep(currentStep)) {
      return;
    }

    form.hidden = true;
    success.hidden = false;
    currentStepLabel.textContent = "5";
    stepNameLabel.textContent = "Макет заполнен";
    progress.setAttribute("aria-valuenow", "5");
    progressBar.style.width = "100%";
    success.focus({ preventScroll: true });
  });

  resetButton.addEventListener("click", () => {
    form.reset();
    form.hidden = false;
    success.hidden = true;
    clearCatalogSelection();

    form.querySelectorAll("[aria-invalid]").forEach((control) => {
      control.removeAttribute("aria-invalid");
      control.setCustomValidity?.("");
    });

    objectFields.forEach((group) => {
      group.hidden = true;
      getControls(group).forEach((control) => {
        control.disabled = true;
      });
    });

    syncProjectReference();
    syncContactMethod();
    showStep(1);
  });

  showStep(1, { focus: false, scroll: false });
})();

(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (reducedMotion.matches) {
    return;
  }

  const motionItems = new Set();
  let observer = null;
  let heroFactsObserver = null;
  const variantClasses = {
    left: "motion-from-left",
    right: "motion-from-right",
    scale: "motion-scale-in",
  };

  const prepareItem = (item, variants = [], delay = 0) => {
    if (motionItems.has(item)) {
      return;
    }

    const normalizedVariants = Array.isArray(variants) ? variants : [variants];

    item.classList.add("motion-reveal");
    normalizedVariants.forEach((variant) => {
      const className = variantClasses[variant];

      if (className) {
        item.classList.add(className);
      }
    });
    item.dataset.motionState = "pending";
    item.style.setProperty("--motion-delay", `${delay}ms`);
    motionItems.add(item);
  };

  const prepareGroup = ({
    root,
    items = ":scope > *",
    variants = [],
    stagger = 70,
    maxDelay = 240,
    cycle = 0,
    baseDelay = 0,
  }) => {
    document.querySelectorAll(root).forEach((container) => {
      Array.from(container.querySelectorAll(items)).forEach((item, index) => {
        const position = cycle > 0 ? index % cycle : index;
        const itemVariants =
          typeof variants === "function" ? variants(index, item) : variants;
        const delay = baseDelay + Math.min(position * stagger, maxDelay);

        prepareItem(item, itemVariants, delay);
      });
    });
  };

  [
    {
      root: ".hero-copy",
      stagger: 90,
      maxDelay: 360,
    },
    {
      root: ".hero-facts-intro",
      variants: (index) => (index === 0 ? "left" : "right"),
      stagger: 110,
    },
    {
      root: ".hero-facts-grid",
      items: ":scope > article",
      variants: "scale",
      stagger: 75,
      cycle: 4,
      baseDelay: 220,
    },
    {
      root: ".split-heading",
      variants: (index) => (index === 0 ? "left" : "right"),
      stagger: 100,
    },
    {
      root: ".type-list",
      items: ":scope > details",
      stagger: 80,
      cycle: 3,
    },
    {
      root: ".section-heading",
      stagger: 80,
      maxDelay: 160,
    },
    {
      root: ".project-grid",
      items: ":scope > .project-card",
      variants: "scale",
      stagger: 70,
      cycle: 4,
    },
    {
      root: ".completed-copy",
      variants: "left",
      stagger: 70,
      maxDelay: 210,
    },
    {
      root: ".project-ledger",
      items: ":scope > article",
      variants: "scale",
      stagger: 80,
      cycle: 2,
    },
    {
      root: ".review-header",
      items: ":scope > .eyebrow",
    },
    {
      root: ".review-header-row",
      variants: (index) => (index === 0 ? "left" : "right"),
      stagger: 90,
    },
    {
      root: ".process-block",
      items: ":scope > .process-title, :scope > .steps-design > li",
      stagger: 70,
      cycle: 4,
    },
    {
      root: ".steps-build",
      items: ":scope > li",
      variants: (index) => (index % 2 === 0 ? "left" : "right"),
      stagger: 70,
      cycle: 2,
    },
    {
      root: ".company-grid",
      variants: (index) => (index === 0 ? "left" : "right"),
      stagger: 100,
    },
    {
      root: ".team-heading",
      variants: (index) => (index === 0 ? "left" : "right"),
      stagger: 90,
    },
    {
      root: ".team-grid",
      items: ":scope > article",
      variants: "scale",
      stagger: 80,
      cycle: 3,
    },
    {
      root: ".principles-grid",
      items: ":scope > article",
      stagger: 80,
      cycle: 3,
    },
    {
      root: ".placeholder-inner",
      variants: (index) => (index === 0 ? "left" : ["right", "scale"]),
      stagger: 100,
    },
    {
      root: ".contact-copy",
      variants: "left",
      stagger: 75,
      maxDelay: 225,
    },
    {
      root: ".contact-grid",
      items: ":scope > .estimate-card",
      variants: ["right", "scale"],
    },
    {
      root: ".contact-panel",
      variants: (index) => (index === 0 ? "left" : ["right", "scale"]),
      stagger: 110,
    },
    {
      root: ".footer-inner",
      stagger: 70,
      maxDelay: 140,
    },
  ].forEach(prepareGroup);

  document.querySelectorAll(".hero-panel").forEach((item) => {
    prepareItem(item, ["right", "scale"], 120);
  });

  const completeReveal = (item) => {
    if (item.dataset.motionState === "done") {
      return;
    }

    item.dataset.motionState = "done";
    item.style.removeProperty("--motion-delay");
  };

  const revealItem = (item) => {
    if (item.dataset.motionState !== "pending") {
      return;
    }

    const delay = Number.parseFloat(item.style.getPropertyValue("--motion-delay")) || 0;

    item.dataset.motionState = "visible";
    const handleAnimationEnd = (event) => {
      if (event.target !== item || event.animationName !== "block-reveal") {
        return;
      }

      completeReveal(item);
      item.removeEventListener("animationend", handleAnimationEnd);
    };

    item.addEventListener("animationend", handleAnimationEnd);
    window.setTimeout(() => {
      completeReveal(item);
      item.removeEventListener("animationend", handleAnimationEnd);
    }, delay + 1300);
  };

  const revealEverything = () => {
    motionItems.forEach((item) => completeReveal(item));
  };

  if (!("IntersectionObserver" in window)) {
    revealEverything();
    return;
  }

  const heroFacts = document.querySelector(".hero-facts");
  const heroFactsMotionItems = new Set(
    heroFacts ? heroFacts.querySelectorAll(".motion-reveal") : [],
  );

  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        revealItem(entry.target);
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -8% 0px",
    },
  );

  motionItems.forEach((item) => {
    if (!heroFactsMotionItems.has(item)) {
      observer.observe(item);
    }
  });

  if (heroFacts && heroFactsMotionItems.size > 0) {
    heroFactsObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }

        heroFactsMotionItems.forEach((item) => revealItem(item));
        heroFactsObserver.unobserve(heroFacts);
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -20% 0px",
      },
    );

    heroFactsObserver.observe(heroFacts);
  }

  document.addEventListener(
    "focusin",
    (event) => {
      const item =
        event.target instanceof Element
          ? event.target.closest('.motion-reveal[data-motion-state="pending"]')
          : null;

      if (!item || !motionItems.has(item)) {
        return;
      }

      completeReveal(item);
      observer.unobserve(item);
    },
    true,
  );

  const handleMotionPreference = (event) => {
    if (!event.matches) {
      return;
    }

    observer.disconnect();
    heroFactsObserver?.disconnect();
    revealEverything();
  };

  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", handleMotionPreference, { once: true });
  } else {
    reducedMotion.addListener(handleMotionPreference);
  }
})();
