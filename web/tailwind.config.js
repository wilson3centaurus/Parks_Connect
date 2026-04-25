/** @type {import('tailwindcss').Config} */
export default {
  content: ["./views/**/*.{ejs,html}", "./public/js/**/*.js"],
  theme: {
    extend: {
      colors: {
        green: "var(--green)",
        "green-dark": "var(--green-dark)",
        "green-deep": "var(--green-deep)",
        yellow: "var(--yellow)",
        "yellow-deep": "var(--yellow-deep)",
        "gray-bg": "var(--gray-bg)",
        "gray-border": "var(--gray-border)",
        "gray-text": "var(--gray-text)",
        "text-dark": "var(--text-dark)"
      },
      boxShadow: {
        card: "0 10px 30px var(--shadow-color)"
      }
    }
  },
  plugins: []
};
