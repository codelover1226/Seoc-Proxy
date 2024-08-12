window.addEventListener('load', function () {
    let eventAttached = false;
    const anInterval = setInterval(function () {
        try {
            const userOptsElt = document.querySelector(`#kt_header_user_menu_toggle`);
            const userListElt = document.querySelector(`.menu.user-list-menu`);
            const signinFormElt = document.querySelector(`#kt_login_signin_form`);
            if (userOptsElt) {
                userOptsElt.remove();
                userListElt.remove();
                clearInterval(anInterval);
            } else if (signinFormElt) {
                const msg = "Please wait while we're establishing a new session. " +
                    "The operation may take up to 5 minutes; please be patient. Don't close this tab.";
                const bodyElt = document.querySelector(`body`);
                bodyElt.innerHTML = `<div id="page-msg">${msg}</div>`;
                clearInterval(anInterval);
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});