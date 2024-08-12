window.addEventListener('load', function () {
    let eventAttached = false;
    const anInterval = setInterval(function () {
        try {
            const signinFormElt = document.querySelector(`#kt_login_signin_form`);
            if (signinFormElt) {
                const msg = "Please wait while we're establishing a new session. " +
                    "The operation may take up to 5 minutes; please be patient. Don't close this tab.";
                const bodyElt = document.querySelector(`body`);
                bodyElt.innerHTML = `<div id="page-msg" style="text-align: center; margin-top: 120px; font-size: larger">${msg}</div>`;
                const messageBlock = document.querySelector("#page-msg");
                const successStyle = 'color: green; font-weight: bold;';
                const errorStyle = 'color: red; font-weight: bold;';

                fetch('/do-auto-login').then(async function (response) {
                    const data = await response.json();
                    if (data.status === 'connected') {
                        messageBlock.setAttribute('style',
                            'color: green; font-weight: bold; text-align: center; margin-top: 120px; font-size: larger');
                        messageBlock.textContent = data.message;
                        const interval = setInterval(function () {
                            clearInterval(interval);
                            location.replace('/');
                        }, 1500);
                    } else {
                        messageBlock.setAttribute('style',
                            'color: red; font-weight: bold; text-align: center; margin-top: 120px; font-size: larger');
                        messageBlock.textContent = data.message;
                    }
                }).catch(function (reason) {
                    console.log(reason);
                    messageBlock.setAttribute('style',
                        'color: red; font-weight: bold; text-align: center; margin-top: 120px; font-size: larger');
                    messageBlock.textContent = 'An error occurred.';
                });
                clearInterval(anInterval);
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});