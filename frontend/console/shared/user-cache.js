/**
 * VYOM+ User Profile Cache
 * ========================
 * Centralises all read/write of locally-cached user data.
 * Loaded before sidebar.js on every console page.
 *
 * Public API:
 *   VyomUser.get()            - returns the cached profile object (or null)
 *   VyomUser.set(obj)         - merges obj into the cache
 *   VyomUser.clear()          - wipes everything (called on logout)
 *   VyomUser.logout()         - clears cache + cookies then redirects to index
 *   VyomUser.getInitials()    - returns 1-2 letter initials string
 *   VyomUser.getDisplayName() - returns best name to show
 *   VyomUser.getRole()        - returns "Business name" or status
 *   VyomUser.refreshFromAPI() - fetches latest from /profile/details and saves
 *   VyomUser.populateSidebar()- fills .sidebar-avatar, .sidebar-user-name, .sidebar-user-role
 */

window.API_BASE = (function () {
    if (window.VYOM_API_BASE) return window.VYOM_API_BASE;
    var host = window.location.hostname;
    var port = window.location.port;
    if (host === 'localhost' || host === '127.0.0.1') {
        if (port === '8000') return '';
        return 'http://127.0.0.1:8000';
    }
    if (window.location.protocol === 'file:') {
        return 'http://127.0.0.1:8000';
    }
    return 'https://vyomplus.onrender.com';
})();

const API_BASE = window.API_BASE;
const CACHE_KEY = 'vyom_user_profile';

window.VyomUser = (function () {

    function get() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function set(obj) {
        var current = get() || {};
        var merged = Object.assign({}, current, obj);
        localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
    }

    function clear() {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem('unique_id');
        localStorage.removeItem('email');
        localStorage.removeItem('onboarding_complete');
        localStorage.removeItem('sidebar_collapsed');
        document.cookie = 'session_token=; path=/; max-age=0; SameSite=Lax';
        document.cookie = 'unique_id=; path=/; max-age=0; SameSite=Lax';
    }

    function logout() {
        // Optionally call backend to revoke session token (fire-and-forget)
        try {
            var token = getCookieToken();
            if (token) {
                fetch(API_BASE + '/logout', {
                    method: 'POST', credentials: 'include',
                    headers: { 'Authorization': 'Bearer ' + token }
                }).catch(function() {});
            }
        } catch (e) {}

        clear();

        // Build path back to /frontend/index.html regardless of current depth
        var path = window.location.pathname;
        var parts = path.split('/').filter(Boolean);
        var frontendIdx = parts.indexOf('frontend');
        if (frontendIdx !== -1) {
            // e.g. /frontend/console/profile/profile.html → stepsUp = 2
            var stepsUp = parts.length - frontendIdx - 1;
            var prefix = '';
            for (var i = 0; i < stepsUp; i++) prefix += '../';
            window.location.href = prefix + 'index.html';
        } else {
            // Fallback — go to root
            window.location.href = '/frontend/index.html';
        }
    }

    function getInitials() {
        var profile = get();
        if (!profile) return '?';
        var name = (profile.full_name || profile.username || profile.email || '').trim();
        var parts = name.split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        if (parts[0] && parts[0].length > 0) return parts[0].slice(0, 2).toUpperCase();
        return '?';
    }

    function getDisplayName() {
        var profile = get();
        if (!profile) return 'User';
        return profile.full_name || profile.username || profile.email || 'User';
    }

    function getRole() {
        var profile = get();
        if (!profile) return '';
        var biz = profile.business || {};
        return biz.display_name || biz.trade_name || biz.legal_name || profile.email || '';
    }

    function populateSidebar() {
        var avatarEl = document.querySelector('.sidebar-avatar');
        var nameEl = document.querySelector('.sidebar-user-name');
        var roleEl = document.querySelector('.sidebar-user-role');
        if (avatarEl) avatarEl.textContent = getInitials();
        if (nameEl)   nameEl.textContent   = getDisplayName();
        if (roleEl)   roleEl.textContent   = getRole();
    }

    function getUniqueId() {
        var p = get();
        if (p && p.unique_id) return p.unique_id;
        var loc = localStorage.getItem('unique_id');
        if (loc) return loc;
        var match = document.cookie.match(/unique_id=([^;]+)/);
        return match ? match[1] : '';
    }

    function getAuthHeaders() {
        var headers = {};
        var uid = getUniqueId();
        if (uid) headers['X-Unique-ID'] = uid;
        var token = getCookieToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        return headers;
    }

    async function refreshFromAPI() {
        try {
            var headers = getAuthHeaders();
            var res = await fetch(API_BASE + '/profile/details', {
                method: 'GET',
                credentials: 'include',
                headers: headers
            });
            if (!res.ok) return null;
            var data = await res.json();
            var merged = Object.assign({}, data.user, { business: data.business });
            set(merged);
            return merged;
        } catch (e) {
            return null;
        }
    }

    return { get, set, clear, logout, getInitials, getDisplayName, getRole, populateSidebar, refreshFromAPI, getUniqueId, getAuthHeaders };
})();
