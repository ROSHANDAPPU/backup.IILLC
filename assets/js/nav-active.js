(function () {
  try {
    var path = window.location.pathname || "";
    // Normalize: remove trailing slash
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

    // Helper: resolve an element's absolute pathname from its href
    function resolvedPath(href) {
      var a = document.createElement("a");
      a.href = href;
      return a.pathname.replace(/\/index\.html$/, "/").replace(/\/+/g, "/");
    }

    // Mark matching desktop links active
    var navLinks = document.querySelectorAll(".nav .links a");
    navLinks.forEach(function (link) {
      var linkPath = resolvedPath(link.getAttribute("href"));
      if (!linkPath) return;
      // For top-level anchors with hashes (index), skip
      if (linkPath === "#") return;
      // If pathname ends with linkPath or matches exactly
      if (path.endsWith(linkPath) || path === linkPath) {
        link.classList.add("active");
      }
    });

    // Dropdown logic
    var dropdownToggle = document.querySelector(".dropdown .dropdown-toggle");
    var dropdownLinks = document.querySelectorAll(".dropdown-menu a");
    var isPortfolio = /\/portfolio\//.test(path);

    var residentialLink = Array.from(dropdownLinks).find(function (l) {
      return /residential-projects\.html$/.test(
        resolvedPath(l.getAttribute("href")),
      );
    });
    var commercialLink = Array.from(dropdownLinks).find(function (l) {
      return /commercial-projects\.html$/.test(
        resolvedPath(l.getAttribute("href")),
      );
    });

    if (/residential-projects\.html$/.test(path) && residentialLink) {
      residentialLink.classList.add("active");
      if (dropdownToggle) dropdownToggle.classList.add("active");
    } else if (/commercial-projects\.html$/.test(path) && commercialLink) {
      commercialLink.classList.add("active");
      if (dropdownToggle) dropdownToggle.classList.add("active");
    } else if (isPortfolio && dropdownToggle) {
      // For individual project detail pages under portfolio, highlight the Our Projects button
      dropdownToggle.classList.add("active");
    }
  } catch (e) {
    // Fail silently to avoid breaking pages
  }
})();

/* Lightbox footnote helper (site-wide)
   - Captures clicks on gallery tiles to remember the last clicked element
   - Injects a #lightboxFootnote into existing lightbox modals if missing
   - Wraps openLightbox/closeLightbox so the footnote is populated from data-footnote
*/
(function () {
  try {
    var lastClickedTile = null;
    document.addEventListener(
      "click",
      function (e) {
        var tile = e.target.closest(
          ".tile, .gallery-item, .gallery-image, .featured-image",
        );
        if (tile) lastClickedTile = tile;
      },
      true,
    );

    function ensureFootnoteInModal(modal) {
      if (!modal) return;
      var content = modal.querySelector(".lightbox-content") || modal;
      if (!content) return;
      if (!content.querySelector("#lightboxFootnote")) {
        var div = document.createElement("div");
        div.id = "lightboxFootnote";
        div.className = "lightbox-footnote";
        div.setAttribute("aria-live", "polite");
        div.setAttribute("tabindex", "0");
        div.setAttribute("role", "complementary");
        div.setAttribute("aria-label", "Image details");
        // Prevent clicks inside the footnote from bubbling to the overlay which closes the modal
        div.addEventListener("click", function (e) {
          e.stopPropagation();
        });
        content.appendChild(div);
      }
    }

    ["#lightboxModal", "#lightbox", ".lightbox-modal", ".lightbox"].forEach(
      function (sel) {
        document.querySelectorAll(sel).forEach(ensureFootnoteInModal);
      },
    );

    // Wrap openLightbox if present
    var origOpen = window.openLightbox;
    if (typeof origOpen === "function") {
      window.openLightbox = function () {
        try {
          origOpen.apply(this, arguments);
        } catch (e) {
          try {
            origOpen(arguments[0]);
          } catch (e) {}
        }
        var modal =
          document.getElementById("lightboxModal") ||
          document.getElementById("lightbox") ||
          document.querySelector(".lightbox-modal") ||
          document.querySelector(".lightbox");
        if (!modal) return;
        ensureFootnoteInModal(modal);
        var footnote = modal.querySelector("#lightboxFootnote");
        var clicked = arguments[1] || lastClickedTile;
        if (footnote) {
          if (clicked && clicked.dataset && clicked.dataset.footnote) {
            footnote.innerHTML =
              '<span class="footnote-desc">' +
              clicked.dataset.footnote +
              "</span>";
            try {
              footnote.focus();
            } catch (e) {}
          } else {
            footnote.innerHTML = "";
          }
        }
      };
    }

    // Wrap closeLightbox if present
    var origClose = window.closeLightbox;
    if (typeof origClose === "function") {
      window.closeLightbox = function () {
        try {
          origClose.apply(this, arguments);
        } catch (e) {
          try {
            origClose(arguments[0]);
          } catch (e) {}
        }
        var modal =
          document.getElementById("lightboxModal") ||
          document.getElementById("lightbox") ||
          document.querySelector(".lightbox-modal") ||
          document.querySelector(".lightbox");
        if (!modal) return;
        var footnote = modal.querySelector("#lightboxFootnote");
        if (footnote) footnote.innerHTML = "";
      };
    }
  } catch (e) {
    /* fail silently */
  }
})();
