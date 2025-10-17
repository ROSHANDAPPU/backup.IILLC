
document.addEventListener("DOMContentLoaded", () => {
    const sliderTrack = document.getElementById("mobileSliderTrack");
    if (!sliderTrack) return;

    const slides = Array.from(sliderTrack.children);
    const slideCount = slides.length;
    if (slideCount === 0) return;

    let currentIndex = 0;

    // Clone the first slide and append it to the end for an infinite loop effect
    const firstSlideClone = slides[0].cloneNode(true);
    sliderTrack.appendChild(firstSlideClone);

    const allSlides = Array.from(sliderTrack.children);
    const totalSlides = allSlides.length;

    // Function to move to the next slide
    const moveToNextSlide = () => {
        currentIndex++;
        sliderTrack.style.transition = "transform 0.8s ease-in-out";
        sliderTrack.style.transform = `translateX(-${currentIndex * 100 / totalSlides}%)`;

        // If the next slide is the clone, reset to the beginning
        if (currentIndex === slideCount) {
            setTimeout(() => {
                sliderTrack.style.transition = "none";
                sliderTrack.style.transform = "translateX(0)";
                currentIndex = 0;
            }, 800); // Match the transition duration
        }
        updateText();
    };

    // Update text synchronization
    const updateText = () => {
        const currentSlideIndex = currentIndex % slideCount;
        slides.forEach((slide, index) => {
            const textElement = slide.querySelector(".slide-hero-text");
            if (textElement) {
                if (index === currentSlideIndex) {
                    textElement.classList.add("active");
                } else {
                    textElement.classList.remove("active");
                }
            }
        });
    };

    // Start the slider
    setInterval(moveToNextSlide, 4000);

    // Initial text state
    updateText();
});
