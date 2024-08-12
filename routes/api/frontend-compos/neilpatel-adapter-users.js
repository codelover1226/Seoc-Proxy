window.addEventListener('DOMContentLoaded', function () {
    const anInterval = setInterval(function () {
        try {
            const userInfosLink = document.querySelector(`a[href*="settings/account_billing"]`);
            if (userInfosLink) {
                userInfosLink.remove();
                clearInterval(anInterval);
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});