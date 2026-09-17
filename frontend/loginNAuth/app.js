// Registration Form submission & processing
const registrationForm = document.getElementById('registrationForm');
if (registrationForm) {
    // Password strength logic
    const pwdInput = document.getElementById('password');
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');
    
    if (pwdInput) {
        pwdInput.addEventListener('input', () => {
            const val = pwdInput.value;
            let score = 0;
            if (val.length >= 6) score += 20;
            if (val.length >= 10) score += 20;
            if (/[A-Z]/.test(val)) score += 20;
            if (/[0-9]/.test(val)) score += 20;
            if (/[^A-Za-z0-9]/.test(val)) score += 20;
            
            strengthBar.style.width = `${score}%`;
            
            if (score <= 40) {
                strengthBar.style.backgroundColor = '#ef4444';
                strengthText.textContent = 'Weak Password';
            } else if (score <= 80) {
                strengthBar.style.backgroundColor = '#f59e0b';
                strengthText.textContent = 'Moderate Password';
            } else {
                strengthBar.style.backgroundColor = '#10b981';
                strengthText.textContent = 'Strong Password';
            }
        });
    }

    registrationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await register();
    });
}

async function register() {
    const fullName = document.getElementById('fullName').value;
    const email = document.getElementById('email').value;
    const mobile = document.getElementById('mobile').value;
    const password = document.getElementById('password').value;
    const registerBtn = document.getElementById('registerBtn');

    // Add loading indicator
    const originalText = registerBtn.innerHTML;
    registerBtn.disabled = true;
    registerBtn.innerHTML = 'Registering... <span class="spinner"></span>';

    const registrationData = {
        email: email,
        full_name: fullName,
        mobile: mobile,
        password: password
    };

    try {
        const response = await fetch('https://vyomplus.onrender.com/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(registrationData)
        });

        const data = await response.json();
        const alertBanner = document.getElementById('alert-banner');

        if (response.ok) {
            alertBanner.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
            alertBanner.style.borderColor = 'var(--color-success)';
            alertBanner.textContent = 'Registration successful! Directing to verification...';
            alertBanner.style.display = 'block';
            localStorage.setItem('email', email);
            registrationForm.reset();
            setTimeout(() => {
                window.location.href = 'auth.html';
            }, 1500);
        } else {
            alertBanner.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            alertBanner.style.borderColor = 'var(--color-error)';
            alertBanner.textContent = 'Registration failed: ' + (data.detail || 'Please try again.');
            alertBanner.style.display = 'block';
            registerBtn.disabled = false;
            registerBtn.innerHTML = originalText;
        }
    } catch (error) {
        const alertBanner = document.getElementById('alert-banner');
        alertBanner.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        alertBanner.style.borderColor = 'var(--color-error)';
        alertBanner.textContent = 'An error occurred. Please try again.';
        alertBanner.style.display = 'block';
        registerBtn.disabled = false;
        registerBtn.innerHTML = originalText;
    }
}

// Verification OTP Form logic
const authForm = document.getElementById('authForm');
if (authForm) {
    const digits = document.querySelectorAll('.otp-digit');
    const otpHidden = document.getElementById('otp');
    
    // Auto-focus transitions
    digits.forEach((digit, index) => {
        digit.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < digits.length - 1) {
                digits[index + 1].focus();
            }
            updateHiddenOTP();
        });
        digit.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
                digits[index - 1].focus();
            }
        });
    });

    function updateHiddenOTP() {
        let current = '';
        digits.forEach(d => current += d.value);
        otpHidden.value = current;
    }

    // Timer countdown
    const resendTimer = document.getElementById('resendTimer');
    const resendBtn = document.getElementById('resendBtn');
    let timeLeft = 60;
    
    const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(interval);
            resendTimer.style.display = 'none';
            resendBtn.style.display = 'inline';
        } else {
            resendTimer.textContent = `Resend in ${timeLeft}s`;
        }
    }, 1000);

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await verify();
    });
}

async function verify() {
    const otp = document.getElementById('otp').value;
    const email = localStorage.getItem('email');
    const verifyBtn = document.getElementById('verifyBtn');

    // Add loading indicator
    const originalText = verifyBtn.innerHTML;
    verifyBtn.disabled = true;
    verifyBtn.innerHTML = 'Verifying... <span class="spinner"></span>';

    const verificationData = {
        otp: otp,
        email: email
    };

    try {
        const response = await fetch('https://vyomplus.onrender.com/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(verificationData)
        });

        const data = await response.json();
        const alertBanner = document.getElementById('alert-banner');

        if (response.ok) {
            alertBanner.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
            alertBanner.style.borderColor = 'var(--color-success)';
            alertBanner.textContent = 'OTP verified! Redirecting to login page...';
            alertBanner.style.display = 'block';
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } else {
            alertBanner.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            alertBanner.style.borderColor = 'var(--color-error)';
            alertBanner.textContent = 'OTP verification failed: ' + (data.detail || 'Please try again.');
            alertBanner.style.display = 'block';
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = originalText;
        }
    } catch (error) {
        const alertBanner = document.getElementById('alert-banner');
        alertBanner.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        alertBanner.style.borderColor = 'var(--color-error)';
        alertBanner.textContent = 'An error occurred. Please try again.';
        alertBanner.style.display = 'block';
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = originalText;
    }
}

// Login logic
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await login();
    });
}

async function login() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');

    // Add loading indicator
    const originalText = loginBtn.innerHTML;
    loginBtn.disabled = true;
    loginBtn.innerHTML = 'Signing In... <span class="spinner"></span>';

    const loginData = {
        email: email,
        password: password
    };

    try {
        const response = await fetch('https://vyomplus.onrender.com/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginData)
        });

        const data = await response.json();
        const alertBanner = document.getElementById('alert-banner');

        if (response.ok) {
            alertBanner.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
            alertBanner.style.borderColor = 'var(--color-success)';
            alertBanner.textContent = 'Login successful! Redirecting...';
            alertBanner.style.display = 'block';
            
            // Set cookie manually in JS in case backend cookies are blocked (cross-origin)
            document.cookie = `session_token=${data.token}; path=/; max-age=604800; SameSite=Lax`;
            if (data.unique_id) {
                document.cookie = `unique_id=${data.unique_id}; path=/; max-age=604800; SameSite=Lax`;
                localStorage.setItem('unique_id', data.unique_id);
            }
            
            localStorage.setItem('email', email);
            localStorage.setItem('onboarding_complete', data.onboarding_complete);
            loginForm.reset();
            setTimeout(() => {
                if (data.onboarding_complete) {
                    window.location.href = "../console/overview/overview.html";
                } else {
                    window.location.href = "../onboarding/onboarding.html";
                }
            }, 1500);
        } else {
            alertBanner.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            alertBanner.style.borderColor = 'var(--color-error)';
            alertBanner.textContent = 'Login failed: ' + (data.detail || 'Please try again.');
            alertBanner.style.display = 'block';
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalText;
        }
    } catch (error) {
        const alertBanner = document.getElementById('alert-banner');
        alertBanner.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        alertBanner.style.borderColor = 'var(--color-error)';
        alertBanner.textContent = 'An error occurred. Please try again.';
        alertBanner.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalText;
    }
}



// Background canvas is handled by shared/canvas.js which is loaded after this file.
// canvas.js reads --color-canvas-bg-1 / --color-canvas-bg-2 from the CSS variables
// defined in style.css so the particle network background matches the VYOM+ design system.
