/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'accent-primary': '#3b82f6',
                'bg-app': '#09090b',
                'bg-panel': '#18181b',
                'bg-card': '#27272a',
            }
        },
    },
    plugins: [],
}
