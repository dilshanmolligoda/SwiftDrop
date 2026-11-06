export function AuthBackground() {
  return (
    <div className="login-page__bg" aria-hidden="true">
      <svg
        viewBox="0 0 1440 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <rect width="1440" height="900" fill="url(#bg-gradient)" />
        <path
          d="M-100 450 C 300 250, 600 650, 1000 400 C 1250 250, 1450 350, 1550 300 L 1550 950 L -100 950 Z"
          fill="url(#wave-gradient-1)"
          opacity="0.85"
        />
        <path
          d="M-50 200 C 400 450, 800 150, 1200 400 C 1350 480, 1480 420, 1550 450 L 1550 950 L -50 950 Z"
          fill="url(#wave-gradient-2)"
          opacity="0.6"
        />
        <path
          d="M-100 700 C 250 500, 700 800, 1100 600 C 1300 500, 1450 620, 1550 580 L 1550 950 L -100 950 Z"
          fill="url(#wave-gradient-3)"
          opacity="0.45"
        />
        <defs>
          <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#083820" />
            <stop offset="50%" stopColor="#0d4e2d" />
            <stop offset="100%" stopColor="#062817" />
          </linearGradient>
          <linearGradient id="wave-gradient-1" x1="0%" y1="0%" x2="100%" y2="80%">
            <stop offset="0%" stopColor="#0a4327" />
            <stop offset="100%" stopColor="#105e37" />
          </linearGradient>
          <linearGradient id="wave-gradient-2" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#115433" />
            <stop offset="100%" stopColor="#0b3d24" />
          </linearGradient>
          <linearGradient id="wave-gradient-3" x1="0%" y1="30%" x2="100%" y2="70%">
            <stop offset="0%" stopColor="#13663c" />
            <stop offset="100%" stopColor="#093d24" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

