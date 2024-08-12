window.addEventListener('load', function () {

});

const anInterval = setInterval(function () {
    try {
        const userOptsElt = document.querySelector(`.Header_avatar-container__4svZT`);
        if (userOptsElt) {
            userOptsElt.remove();
            clearInterval(anInterval);
        }
    } catch (e) {
        clearInterval(anInterval);
        console.log(e);
    }
}, 0);