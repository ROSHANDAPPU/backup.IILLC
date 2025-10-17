document.addEventListener("DOMContentLoaded", () => {
    const track = document.querySelector(".hero-desktop .track");
    const taglines = document.querySelectorAll(".hero-desktop .tagline");

    if (!track || taglines.length === 0) {
        return;
    }

    const slides = track.querySelectorAll(".slide");
    const slideCount = slides.length;
    let currentIndex = 0;

    function showSlide(index) {
        // Update track class
        track.className = "track slide-" + index;

        // Update active tagline
        taglines.forEach((tagline, i) => {
            tagline.classList.remove("active");
        });
        setTimeout(() => {
            taglines[index].classList.add("active");
        }, 600);
    }

    function nextSlide() {
        currentIndex = (currentIndex + 1) % slideCount;
        showSlide(currentIndex);
    }

    // Start the slideshow
    setInterval(nextSlide, 4000);

    // Show the first slide initially
    showSlide(0);
});