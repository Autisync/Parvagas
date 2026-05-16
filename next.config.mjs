/** @type {import('next').NextConfig} */
const nextConfig = {
    allowedDevOrigins: [
        'localhost',
        '127.0.0.1',
        '100.75.2.25'
    ],
    images: {
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
