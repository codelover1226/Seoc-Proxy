window.addEventListener('load', function () {
    let eventAttached = false;
    const anInterval = setInterval(function () {
        try {
            const userOptsElt = document.querySelector(`.item.my-account{`);
            if (userOptsElt) {
                userOptsElt.remove();
                clearInterval(anInterval);
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});