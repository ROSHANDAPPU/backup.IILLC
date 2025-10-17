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

    // Clone the last slide and prepend it to the beginning for right-to-left effect
    const lastSlideClone = slides[slides.length - 1].cloneNode(true);
    sliderTrack.insertBefore(lastSlideClone, sliderTrack.firstChild);

    const allSlides = Array.from(sliderTrack.children);
    const totalSlides = allSlides.length;

    // Set track width to accommodate all slides
    sliderTrack.style.width = `${totalSlides * 100}%`;

    // Set each slide width to viewport width
    allSlides.forEach(slide => {
        slide.style.width = '100vw';
        slide.style.flexShrink = '0';
    });

    // Start from the second slide (original first slide)
    currentIndex = 1;
    sliderTrack.style.transform = `translateX(-100vw)`;

    // Function to move to the next slide (right to left)
    const moveToNextSlide = () => {
        currentIndex++;
        sliderTrack.style.transition = "transform 0.8s ease-in-out";
        sliderTrack.style.transform = `translateX(-${currentIndex * 100}vw)`;

        // If the next slide is the clone, reset to the beginning
        if (currentIndex === slideCount + 1) {
            setTimeout(() => {
                sliderTrack.style.transition = "none";
                sliderTrack.style.transform = `translateX(-100vw)`;
                currentIndex = 1;
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
            const tagElement = slide.querySelector(".slide-tag");
            if (tagElement) {
                if (index === currentSlideIndex) {
                    tagElement.classList.add("active");
                } else {
                    tagElement.classList.remove("active");
                }
            }
        });
    };

    // Start the slider immediately
    const startSlider = () => {
        setInterval(moveToNextSlide, 4000);
    };

    // Start immediately
    startSlider();

    // Initial text state
    updateText();
});
