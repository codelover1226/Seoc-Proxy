window.addEventListener('load', function () {
    let eventAttached = false;
    const anInterval = setInterval(function () {
        try {
            const userOptsElt = document.querySelector(`.css-35px53-workspaceName.updateable__workspace-name`);
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