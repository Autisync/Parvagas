/** @type {import('next').NextConfig} */

// Content-Security-Policy for the HTML documents Vercel serves. The backend
// already sets headers on API responses; this covers the frontend origin.
// Pragmatic (not nonce-based) policy: Next injects inline hydration scripts and
// styles, and reCAPTCHA/Plausible/Vercel Analytics load from known hosts, so we
// allow 'unsafe-inline' for those while still locking down object/base/frame and
// upgrading insecure requests.
const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://recaptcha.net https://plausible.io https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-src 'self' https://www.google.com https://recaptcha.net https://www.youtube.com https://www.youtube-nocookie.com",
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
    // Canonical host is the apex domain (matches metadataBase / og:url below) —
    // redirect www so share previews and SEO don't split across two hosts.
    async redirects() {
        return [
            {
                source: '/:path*',
                has: [{ type: 'host', value: 'www.parvagas.pt' }],
                destination: 'https://parvagas.pt/:path*',
                permanent: true,
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
