"use strict";
document.addEventListener("DOMContentLoaded", function () {
    
    // ============ USER FEEDBACK & RATING LOGIC ============
    const reviewForm = document.getElementById("fp-review-form");
    const reviewList = document.getElementById("fp-reviews-list");
    const roomTitleElement = document.getElementById("fp-details-title");

    const loadReviews = function (roomName) {
        if (!reviewList) return;
        reviewList.innerHTML = ""; 
        
        const savedReviews = JSON.parse(localStorage.getItem("reviews_" + roomName) || "[]");
        
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
            savedReviews.forEach(function (rev) {
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
        const observer = new MutationObserver(function () {
            const currentRoom = roomTitleElement.textContent ? roomTitleElement.textContent.trim() : "";
            if (currentRoom) loadReviews(currentRoom);
        });
        observer.observe(roomTitleElement, { childList: true, characterData: true, subtree: true });
    }

    // ============ LIVE ACTIVITY MAP PULSE (ULTIMATE) ============

    const highlightActiveRooms = function () {
        const activeRooms = [];
        // Find every room number that has saved reviews
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("reviews_")) {
                const savedReviews = JSON.parse(localStorage.getItem(key) || "[]");
                if (savedReviews.length > 0) {
                    const match = key.match(/\d+/); // Extracts exact numbers
                    if (match) activeRooms.push(match[0]);
                }
            }
        }

        if (activeRooms.length === 0) return;

        // 1. Highlight Map Rooms

        const svgElements = document.querySelectorAll("#fp-svg [id]");
        svgElements.forEach(el => {
            if (activeRooms.some(roomNum => el.id.includes(roomNum))) {
                el.classList.add("has-active-reviews");
            }
        });

        // 2. Highlight Sidebar Items (Matches "6107" to "07")

        const listItems = document.querySelectorAll("#fp-list li");
        listItems.forEach(li => {
            const liText = li.textContent.trim();
            if (activeRooms.some(roomNum => roomNum.endsWith(liText) && liText.length >= 2)) {
                li.classList.add("list-has-reviews");
            }
        });
    };

    // Watch the entire body. If floor.js redraws the map, re-apply the pulse instantly!
    const globalObserver = new MutationObserver(() => {
        clearTimeout(window.pulseTimer);
        window.pulseTimer = setTimeout(highlightActiveRooms, 150);
    });
    globalObserver.observe(document.body, { childList: true, subtree: true });
    
    // Initial run
    setTimeout(highlightActiveRooms, 500);

    // ============ FORM SUBMISSION ============

    if (reviewForm && roomTitleElement) {
        reviewForm.addEventListener("submit", function (event) {
            event.preventDefault();
            
            const currentRoom = roomTitleElement.textContent ? roomTitleElement.textContent.trim() : "";
            if (!currentRoom) return;

            const ratingInput = document.querySelector('input[name="rating"]:checked');
            const textInput = document.getElementById("review-text");
            
            const newReview = {
                vibe: ratingInput ? ratingInput.value + " ★" : "No rating",
                comment: textInput.value,
                author: "Current Student"
            };
            
            const savedReviews = JSON.parse(localStorage.getItem("reviews_" + currentRoom) || "[]");
            savedReviews.unshift(newReview);
            localStorage.setItem("reviews_" + currentRoom, JSON.stringify(savedReviews));
            
            loadReviews(currentRoom);
            highlightActiveRooms(); 
            
            reviewForm.reset();
            const detailsPanel = document.querySelector(".fp-add-review");
            if (detailsPanel) detailsPanel.open = false;
        });
    }
});
