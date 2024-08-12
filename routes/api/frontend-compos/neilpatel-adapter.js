window.addEventListener('DOMContentLoaded', function () {
    let eventAttached = false;
    const anInterval = setInterval(function () {
        try {
            const loginLink = document.querySelector(`a[data-testid="nav-sign-in-button"]`);
            if (loginLink && ! eventAttached) {
                eventAttached = true;
                loginLink.addEventListener('click', function(event){
                    event.stopImmediatePropagation();
                    location.assign('/login');
                });
                clearInterval(anInterval);
                location.assign('/login');
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});