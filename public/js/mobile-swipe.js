(function () {
    let touchStartX = 0;
    let touchStartY = 0;
    let swipeStartOffset = 0;
    let swipeWrapper = null;

    function getSwipeLimit(wrapper) {
        const actions = wrapper?.querySelector('.swipe-actions');
        return actions ? actions.offsetWidth : 100;
    }

    function getSwipeX(wrapper) {
        const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(wrapper?.style.transform || '');
        if (match) return Number(match[1]);
        return wrapper?.classList.contains('swiped') ? -getSwipeLimit(wrapper) : 0;
    }

    function handleSwipeStart(e) {
        if (window.innerWidth > 799 || !e.touches?.length) return;
        const wrapper = e.currentTarget?.classList?.contains('swipe-wrapper')
            ? e.currentTarget
            : e.target.closest('.swipe-wrapper');
        if (!wrapper) return;

        document.querySelectorAll('.swipe-wrapper.swiped').forEach(w => {
            if (w !== wrapper) {
                w.style.transform = 'translateX(0)';
                w.classList.remove('swiped');
            }
        });

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        swipeStartOffset = getSwipeX(wrapper);
        swipeWrapper = wrapper;
        wrapper.style.transition = 'none';
    }

    function handleSwipeMove(e) {
        if (!swipeWrapper || window.innerWidth > 799 || !e.touches?.length) return;
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - touchStartX;
        const diffY = currentY - touchStartY;

        if (Math.abs(diffX) <= Math.abs(diffY) || Math.abs(diffX) < 8) return;

        e.preventDefault();
        const limit = getSwipeLimit(swipeWrapper);
        const nextX = Math.max(-limit, Math.min(0, swipeStartOffset + diffX));
        swipeWrapper.style.transform = `translateX(${nextX}px)`;
    }

    function handleSwipeEnd() {
        if (!swipeWrapper || window.innerWidth > 799) return;
        swipeWrapper.style.transition = 'transform 0.3s cubic-bezier(0.1, 0.7, 0.1, 1)';

        const limit = getSwipeLimit(swipeWrapper);
        const x = getSwipeX(swipeWrapper);

        if (x < -Math.min(40, limit * 0.35)) {
            swipeWrapper.style.transform = `translateX(-${limit}px)`;
            swipeWrapper.classList.add('swiped');
        } else {
            swipeWrapper.style.transform = 'translateX(0)';
            swipeWrapper.classList.remove('swiped');
        }
        swipeWrapper = null;
    }

    function init(container) {
        if (!container || container.dataset.swipeBound === 'true') return;
        container.dataset.swipeBound = 'true';
        container.addEventListener('touchstart', handleSwipeStart, { passive: true });
        container.addEventListener('touchmove', handleSwipeMove, { passive: false });
        container.addEventListener('touchend', handleSwipeEnd);
        container.addEventListener('touchcancel', handleSwipeEnd);
    }

    window.DayCostSwipe = { init };
    window.handleSwipeStart = handleSwipeStart;
    window.handleSwipeMove = handleSwipeMove;
    window.handleSwipeEnd = handleSwipeEnd;
}());
