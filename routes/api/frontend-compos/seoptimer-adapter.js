window.addEventListener('load', function () {
    console.log('hhdhdhdh')
    let eventAttached = false;
    const anInterval = setInterval(function () {
        try {
            const userAccountLinkElt = document.querySelector(`a[href~="myaccount"]`);
            const logoutLinkElt = document.querySelector(`a[href~="logout"]`);
            const changeLanguageElt = document.querySelector(`li[language="en-US"]`);
            if (changeLanguageElt) {
                changeLanguageElt.parentElement.remove();
                clearInterval(anInterval);
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});