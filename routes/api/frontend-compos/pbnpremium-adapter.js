window.addEventListener('DOMContentLoaded', function () {
    const anInterval = setInterval(function () {
        try {
            const archiveUl = document.querySelector(`ul[ng-show="domain.details.webArchiveYears"]`);
            if (archiveUl) archiveUl.remove();
        } catch (e) {
            clearInterval(anInterval);
            console.log(e);
        }
    }, 1);
});

