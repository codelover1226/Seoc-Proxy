window.addEventListener('DOMContentLoaded', function () {
    const anInterval = setInterval(function () {
        try {
            const loadingImgs = document.querySelectorAll(`img[alt="Loading"]`);
            const disableButton = document.querySelector(`button[data-target="disabler.button"]:disabled`);
            if (loadingImgs.length > 0) {
                clearInterval(anInterval);
                location.reload();
            }

            if (disableButton) {
                setTimeout(function () {
                    clearInterval(anInterval);
                    location.reload();
                }, 15000);
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 10);
});