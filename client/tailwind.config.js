export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070a12",
        panel: "rgba(18, 24, 38, 0.68)",
        cyanGlass: "rgba(45, 212, 191, 0.12)",
        roseGlass: "rgba(251, 113, 133, 0.12)"
      },
      boxShadow: {
        glow: "0 0 34px rgba(45, 212, 191, 0.22)",
        violet: "0 0 40px rgba(168, 85, 247, 0.20)"
      }
    }
  },
  plugins: []
};
