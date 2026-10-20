interface Review {
    vibe: string;
    comment: string;
    author: string;
}

document.addEventListener("DOMContentLoaded", () => {
    
    // ============ USER FEEDBACK & RATING LOGIC ============
    const reviewForm = document.getElementById("fp-review-form") as HTMLFormElement | null;
    const reviewList = document.getElementById("fp-reviews-list") as HTMLUListElement | null;
    const roomTitleElement = document.getElementById("fp-details-title") as HTMLHeadingElement | null;

    const loadReviews = (roomName: string) => {
        if (!reviewList) return;
        reviewList.innerHTML = ""; 
        
        const savedReviews: Review[] = JSON.parse(localStorage.getItem(`reviews_${roomName}`) || "[]");
        
        if (savedReviews.length === 0) {
            reviewList.innerHTML = `
                <li class="review-card">
                    <div class="review-header">
                        <span class="review-author">Anonymous Student</span> 
                        <span class="review-rating">Quiet & Focused</span>
                    </div>
                    <p class="review-text">Great spot to study. The outlets actually work and it is usually empty before 10 AM.</p>
                </li>
            `;
        } else {
            savedReviews.forEach(rev => {
                const newLi = document.createElement("li");
                newLi.className = "review-card";
                newLi.innerHTML = `
                    <div class="review-header">
                        <span class="review-author">${rev.author}</span> 
                        <span class="review-rating">${rev.vibe}</span>
                    </div>
                    <p class="review-text">${rev.comment}</p>
                `;
                reviewList.appendChild(newLi);
            });
        }
    };

    if (roomTitleElement) {
        const observer = new MutationObserver(() => {
            const currentRoom = roomTitleElement.textContent?.trim() || "";
            if (currentRoom) loadReviews(currentRoom);
        });
        observer.observe(roomTitleElement, { childList: true, characterData: true, subtree: true });
    }

    // ============ LIVE ACTIVITY MAP PULSE (ULTIMATE) ============

    const highlightActiveRooms = () => {
        const activeRooms: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("reviews_")) {
                const savedReviews: Review[] = JSON.parse(localStorage.getItem(key) || "[]");
                if (savedReviews.length > 0) {
                    const match = key.match(/\d+/); 
                    if (match) activeRooms.push(match[0]);
                }
            }
        }

        if (activeRooms.length === 0) return;

        // 1. Highlight Map Rooms 
        const svgElements = document.querySelectorAll("#fp-svg [id]");
        svgElements.forEach(el => {
            if (activeRooms.some(roomNum => el.id.includes(roomNum))) {
                if (el.tagName.toLowerCase() === 'g') {
                    const shapes = el.querySelectorAll('path, rect, polygon');
                    shapes.forEach(shape => shape.classList.add("has-active-reviews"));
                } else if (['path', 'rect', 'polygon'].includes(el.tagName.toLowerCase())) {
                    el.classList.add("has-active-reviews");
                }
            }
        });

        // 2. Highlight Sidebar Items 
        const listItems = document.querySelectorAll("#fp-list li");
        listItems.forEach(li => {
            const liText = li.textContent?.trim() || "";
            if (activeRooms.some(roomNum => roomNum.endsWith(liText) && liText.length >= 2)) {
                li.classList.add("list-has-reviews");
            }
        });
    };

    const globalObserver = new MutationObserver(() => {
        clearTimeout((window as any).pulseTimer);
        (window as any).pulseTimer = setTimeout(highlightActiveRooms, 150);
    });
    globalObserver.observe(document.body, { childList: true, subtree: true });
    
    setTimeout(highlightActiveRooms, 500);

    // ============ FORM SUBMISSION ============

    if (reviewForm && roomTitleElement) {
        reviewForm.addEventListener("submit", (event: Event) => {
            event.preventDefault();
            
            const currentRoom = roomTitleElement.textContent?.trim() || "";
            if (!currentRoom) return;

            const ratingInput = document.querySelector('input[name="rating"]:checked') as HTMLInputElement | null;
            const textInput = document.getElementById("review-text") as HTMLTextAreaElement | null;
            
            const newReview: Review = {
                vibe: ratingInput ? ratingInput.value + " ★" : "No rating",
                comment: textInput ? textInput.value : "",
                author: "Current Student"
            };
            
            const savedReviews: Review[] = JSON.parse(localStorage.getItem(`reviews_${currentRoom}`) || "[]");
            savedReviews.unshift(newReview);
            localStorage.setItem(`reviews_${currentRoom}`, JSON.stringify(savedReviews));
            
            loadReviews(currentRoom);
            highlightActiveRooms(); 
            
            reviewForm.reset();
            const detailsPanel = document.querySelector(".fp-add-review") as HTMLDetailsElement | null;
            if (detailsPanel) detailsPanel.open = false;
        });
    }

    // ============ DARK MODE TOGGLE LOGIC ============

    const header = document.getElementById("site-header");
    let themeToggleBtn = document.getElementById("theme-toggle");
    
    if (header && !themeToggleBtn) {
        themeToggleBtn = document.createElement("button");
        themeToggleBtn.id = "theme-toggle";
        themeToggleBtn.setAttribute("aria-label", "Toggle Dark Mode");
        themeToggleBtn.style.cssText = "background: none; border: none; font-size: 1.5rem; cursor: pointer; margin-left: auto; padding-right: 1rem;";
        themeToggleBtn.textContent = "🌙";
        
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.appendChild(themeToggleBtn);
    }

    const currentTheme = localStorage.getItem("beaverspot_theme");
    if (currentTheme === "dark") {
        document.body.setAttribute("data-theme", "dark");
        if (themeToggleBtn) themeToggleBtn.textContent = "☀️";
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", () => {
            const isDark = document.body.getAttribute("data-theme") === "dark";
            
            if (isDark) {
                document.body.removeAttribute("data-theme");
                localStorage.setItem("beaverspot_theme", "light");
                if (themeToggleBtn) themeToggleBtn.textContent = "🌙"; 
            } else {
                document.body.setAttribute("data-theme", "dark");
                localStorage.setItem("beaverspot_theme", "dark");
                if (themeToggleBtn) themeToggleBtn.textContent = "☀️"; 
            }
        });
    }
});