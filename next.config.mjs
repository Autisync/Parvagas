/** @type {import('next').NextConfig} */
const nextConfig = {};

export const images = {
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
};
