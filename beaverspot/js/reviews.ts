interface Review {
    vibe: string;
    comment: string;
    author: string;
}

document.addEventListener("DOMContentLoaded", () => {
    const reviewForm = document.getElementById("fp-review-form") as HTMLFormElement;
    const reviewList = document.getElementById("fp-reviews-list") as HTMLUListElement;
    const roomTitleElement = document.getElementById("fp-details-title") as HTMLHeadingElement;

    // Function to load reviews for a specific room
    const loadReviews = (roomName: string) => {
        if (!reviewList) return;
        reviewList.innerHTML = ""; // Clear the feed
        
        // Pull saved reviews from localStorage, or use an empty array if none exist
        const savedReviews: Review[] = JSON.parse(localStorage.getItem(`reviews_${roomName}`) || "[]");
        
        if (savedReviews.length === 0) {
            // Show the default mock review if the room is empty
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
            // Render all saved reviews
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

    // Watch the room title. When it changes, load the correct reviews.
    if (roomTitleElement) {
        const observer = new MutationObserver(() => {
            const currentRoom = roomTitleElement.textContent?.trim();
            if (currentRoom) loadReviews(currentRoom);
        });
        observer.observe(roomTitleElement, { childList: true, characterData: true, subtree: true });
    }

    // Handle new review submissions
    if (reviewForm && roomTitleElement) {
        reviewForm.addEventListener("submit", (event: Event) => {
            event.preventDefault();
            
            const currentRoom = roomTitleElement.textContent?.trim();
            if (!currentRoom) return;

            const vibeInput = document.getElementById("review-vibe") as HTMLSelectElement;
            const textInput = document.getElementById("review-text") as HTMLTextAreaElement;
            
            const newReview: Review = {
                vibe: vibeInput.value,
                comment: textInput.value,
                author: "Current Student"
            };
            
            // Save to localStorage
            const savedReviews: Review[] = JSON.parse(localStorage.getItem(`reviews_${currentRoom}`) || "[]");
            savedReviews.unshift(newReview); // Add to the top of the list
            localStorage.setItem(`reviews_${currentRoom}`, JSON.stringify(savedReviews));
            
            // Instantly update the UI
            loadReviews(currentRoom);
            
            reviewForm.reset();
            const detailsPanel = document.querySelector(".fp-add-review") as HTMLDetailsElement;
            if (detailsPanel) detailsPanel.open = false;
        });
    }
});