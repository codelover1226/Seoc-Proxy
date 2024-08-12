window.addEventListener('DOMContentLoaded', function () {
    const anInterval = setInterval(function () {
        try {
            const profileLink = document.querySelector(`a[onclick*="callZbaseUserCenterPopupOpen()"]`);
            const myPlanLink = document.querySelector(`a[onclick*="callZbaseUserCenterPopupOpen(\\"profile\\")"]`);
            const settingLink = document.querySelector(`a[href*="setting"]`);
            const logoutLink = document.querySelector(`a[href*="logout"]`);
            const userLoginLink = document.querySelector(`a[href*="user/login"]`);

            if (profileLink && myPlanLink && settingLink) {
                profileLink.remove();
                myPlanLink .remove();
                settingLink .remove();
                logoutLink .remove();
                clearInterval(anInterval);
            }

            if (userLoginLink) {
                clearInterval(anInterval);
                location.assign('user/login');
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});