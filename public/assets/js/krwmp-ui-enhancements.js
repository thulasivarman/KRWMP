/**
 * KRWMP shared UI enhancement helpers.
 * This file is intentionally UI-only: no authentication or data access logic.
 */
(function () {
    function markActiveNavigation() {
        const currentPath = window.location.pathname;
        document.querySelectorAll('a[href]').forEach((link) => {
            const href = link.getAttribute('href');
            if (!href || href === '#') return;
            const isActive = currentPath === href || currentPath.endsWith(href);
            link.classList.toggle('krwmp-nav-active', isActive);
            if (isActive) link.setAttribute('aria-current', 'page');
        });
    }

    function enhanceForms() {
        document.querySelectorAll('input, select, textarea').forEach((field) => {
            if (!field.id) field.id = `krwmp-field-${Math.random().toString(36).slice(2, 9)}`;
            field.classList.add('krwmp-form-control');
            if (field.hasAttribute('required')) {
                const label = document.querySelector(`label[for="${field.id}"]`);
                if (label && !label.querySelector('.krwmp-required')) {
                    const required = document.createElement('span');
                    required.className = 'krwmp-required';
                    required.textContent = ' *';
                    label.appendChild(required);
                }
            }
        });
    }

    function enhanceTables() {
        document.querySelectorAll('table').forEach((table) => {
            if (table.parentElement?.classList.contains('krwmp-table-wrap')) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'krwmp-table-wrap';
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
            table.classList.add('krwmp-data-table');
        });
    }

    function showToast(message, type = 'info') {
        let stack = document.getElementById('krwmp-toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'krwmp-toast-stack';
            stack.className = 'krwmp-toast-stack';
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        const toast = document.createElement('div');
        toast.className = `krwmp-toast krwmp-toast-${type}`;
        toast.textContent = message;
        stack.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3600);
    }

    function applyEnhancements() {
        markActiveNavigation();
        enhanceForms();
        enhanceTables();
    }

    window.KRWMP_UI = {
        applyEnhancements,
        markActiveNavigation,
        enhanceForms,
        enhanceTables,
        showToast
    };

    document.addEventListener('DOMContentLoaded', applyEnhancements);
    document.addEventListener('krwmp:sidebar-loaded', applyEnhancements);
})();
