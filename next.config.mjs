/** @type {import('next').NextConfig} */

// Content-Security-Policy for the HTML documents Vercel serves. The backend
// already sets headers on API responses; this covers the frontend origin.
// Pragmatic (not nonce-based) policy: Next injects inline hydration scripts and
// styles, and reCAPTCHA/Plausible/Vercel Analytics load from known hosts, so we
// allow 'unsafe-inline' for those while still locking down object/base/frame and
// upgrading insecure requests. 'unsafe-eval' was dropped — nothing shipped here
// needs it, and it's the single most exploitable CSP directive (an XSS via any
// other gap could otherwise reach eval/Function() to run arbitrary script). If
// a future dependency needs it, that's a signal to scope it more narrowly
// (e.g. a nonce) rather than reopening this broadly.
const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com https://recaptcha.net https://plausible.io https://va.vercel-scripts.com https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-src 'self' https://www.google.com https://recaptcha.net https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
];

const nextConfig = {
    allowedDevOrigins: [
        'localhost',
        '127.0.0.1',
        '100.75.2.25'
    ],
    async headers() {
        return [
            {
                source: '/:path*',
                headers: securityHeaders,
            },
        ];
    },
    images: {
        unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === '1',
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'tailwindui.com'
            },
            {
                protocol: 'https',
                hostname: 'images.pexels.com'
            },
            {
                protocol: 'https',
                hostname: 'images.unsplash.com'
            },
            {
                protocol: 'https',
                hostname: 'images.material-tailwind.com'
            }
        ],
    },
};

export default nextConfig;
