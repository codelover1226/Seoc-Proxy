window.addEventListener('DOMContentLoaded', function () {
    const anInterval = setInterval(function () {
        try {
            const connectedBlock = document.querySelector(`.gr-auth__connected > .gr-auth__popover--new-home`);
            if (! connectedBlock) {
                clearInterval(anInterval);
                //location.replace('/serve-login-page');
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 10);
});