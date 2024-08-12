window.addEventListener('DOMContentLoaded', function () {
    const anInterval = setInterval(function () {
        try {
            const cookiesDescriptionPara = document.querySelector(`#ch2-dialog-description`);
            if (cookiesDescriptionPara && cookiesDescriptionPara.textContent.indexOf('cookies') > -1) {
                if (cookiesDescriptionPara.parentElement) {
                    if (cookiesDescriptionPara.parentElement.parentElement) {
                        if (cookiesDescriptionPara.parentElement.parentElement.parentElement) {
                            if (cookiesDescriptionPara.parentElement.parentElement.parentElement.parentElement) {
                                cookiesDescriptionPara.parentElement.parentElement.parentElement.parentElement.remove();
                            }
                        }
                    }
                }
                clearInterval(anInterval);
            }
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});