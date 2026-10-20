"use strict";
document.addEventListener("DOMContentLoaded", function () {
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

    if (reviewForm && roomTitleElement) {
        reviewForm.addEventListener("submit", function (event) {
            event.preventDefault();
            
            const currentRoom = roomTitleElement.textContent ? roomTitleElement.textContent.trim() : "";
            if (!currentRoom) return;

            const vibeInput = document.getElementById("review-vibe");
            const textInput = document.getElementById("review-text");
            
            const newReview = {
                vibe: vibeInput.value,
                comment: textInput.value,
                author: "Current Student"
            };
            
            const savedReviews = JSON.parse(localStorage.getItem("reviews_" + currentRoom) || "[]");
            savedReviews.unshift(newReview);
            localStorage.setItem("reviews_" + currentRoom, JSON.stringify(savedReviews));
            
            loadReviews(currentRoom);
            
            reviewForm.reset();
            const detailsPanel = document.querySelector(".fp-add-review");
            if (detailsPanel) detailsPanel.open = false;
        });
    }
});