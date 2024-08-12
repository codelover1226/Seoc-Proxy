window.addEventListener('load', function () {
    let eventAttached = false;
    const anInterval = setInterval(function () {
        try {
            const userOptsElt = document.querySelector(`.mm_btn.user-menu-holder`);
            if (userOptsElt) {
                userOptsElt.parentElement.parentElement.remove();
                clearInterval(anInterval);
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});