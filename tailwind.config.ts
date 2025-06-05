import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: '#E0E0E0', // Soft gray border
        input: '#FFFFFF', // White input fields
        ring: '#FF9FF3', // Doodles pink glow
        background: '#F7FFF7', // Creamy white
        foreground: '#2C3A47', // Dark slate text
        primary: {
          DEFAULT: '#FF9FF3', // Signature Doodles pink
          foreground: '#2C3A47'
        },
        secondary: {
          DEFAULT: '#FECA57', // Sunny yellow
          foreground: '#2C3A47'
        },
        destructive: {
          DEFAULT: '#FF6B6B', // Coral red
          foreground: '#FFFFFF'
        },
        muted: {
          DEFAULT: '#DAF5FF', // Light blue
          foreground: '#34495E'
        },
        accent: {
          DEFAULT: '#48DBFB', // Electric blue
          foreground: '#2C3A47'
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#2C3A47'
        },
        card: {
          DEFAULT: '#FFE6F4', // Light pink
          foreground: '#2C3A47'
        },
        sidebar: {
          DEFAULT: '#9B59B6', // Doodles purple
          foreground: '#FFFFFF',
          primary: '#FF9FF3',
          'primary-foreground': '#2C3A47',
          accent: '#FECA57',
          'accent-foreground': '#2C3A47',
          border: '#E0E0E0',
          ring: '#48DBFB'
        }
      },
      borderRadius: {
        lg: '1rem', // Playful rounded corners
        md: '0.75rem',
        sm: '0.5rem'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        // Added Doodles-style animations
        'bounce': {
          '0%, 100%': { transform: 'translateY(-5%)', easing: 'cubic-bezier(0.8,0,1,1)' },
          '50%': { transform: 'translateY(0)', easing: 'cubic-bezier(0,0,0.2,1)' }
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'bounce': 'bounce 1s infinite',
        'float': 'float 3s ease-in-out infinite'
      },
      // Custom Doodles additions
      boxShadow: {
        'doodle': '4px 4px 0px 0px #2C3A47', // Cartoonish offset
        'doodle-sm': '2px 2px 0px 0px #2C3A47'
      },
      fontFamily: {
        doodle: ['"Comic Neue"', 'cursive'] // Playful handwritten font
      }
    }
  },
  plugins: [
    require("tailwindcss-animate"),
    function({ addUtilities }) {
      addUtilities({
        '.doodle-stroke': {
          '-webkit-text-stroke': '1px #2C3A47',
          'text-stroke': '1px #2C3A47'
        },
        '.sketch-border': {
          'border': '2px solid #2C3A47',
          'box-shadow': '4px 4px 0px 0px #2C3A47'
        }
      })
    }
  ],
} satisfies Config;