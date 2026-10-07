(() => {
    const menuButton = document.querySelector(".mobile-menu-toggle");
    const navigation = document.querySelector("#site-navigation");
    const categoryButton = document.querySelector(".nav-category-toggle");
    const categoryDropdown = document.querySelector(".scholarships-dropdown");

    if (!menuButton || !navigation) return;

    function setCategoriesOpen(open) {
        if (!categoryButton || !categoryDropdown) return;
        categoryDropdown.classList.toggle("is-open", open);
        categoryButton.setAttribute("aria-expanded", String(open));
        categoryButton.setAttribute("aria-label", open ? "Hide scholarship categories" : "Show scholarship categories");
    }

    function setMenuOpen(open) {
        navigation.classList.toggle("is-open", open);
        menuButton.setAttribute("aria-expanded", String(open));
        menuButton.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
        if (!open) setCategoriesOpen(false);
    }

    menuButton.addEventListener("click", () => {
        setMenuOpen(menuButton.getAttribute("aria-expanded") !== "true");
    });

    categoryButton?.addEventListener("click", () => {
        setCategoriesOpen(categoryButton.getAttribute("aria-expanded") !== "true");
    });

    navigation.addEventListener("click", (event) => {
        if (event.target.closest("a")) setMenuOpen(false);
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest("nav") && menuButton.getAttribute("aria-expanded") === "true") {
            setMenuOpen(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (categoryButton?.getAttribute("aria-expanded") === "true") {
            setCategoriesOpen(false);
            categoryButton.focus();
        } else if (menuButton.getAttribute("aria-expanded") === "true") {
            setMenuOpen(false);
            menuButton.focus();
        }
    });

    window.addEventListener("resize", () => {
        if (window.matchMedia("(min-width: 769px)").matches) setMenuOpen(false);
    });
})();
