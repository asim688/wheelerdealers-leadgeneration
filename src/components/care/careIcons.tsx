import type { ReactNode } from "react";

type P = { className?: string };

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const I = (children: ReactNode) =>
  function Icon({ className = "h-6 w-6" }: P) {
    return (
      <svg {...base} className={className}>
        {children}
      </svg>
    );
  };

export const IconBattery = I(
  <>
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M7 7V5h3v2M14 7V5h3v2M8 13h3M9.5 11.5v3M14 13h3" />
  </>,
);
export const IconSiren = I(
  <>
    <path d="M7 18v-6a5 5 0 0 1 10 0v6" />
    <path d="M5 18h14v3H5zM12 3v2M4.5 6.5 6 8M19.5 6.5 18 8M3 12h2M19 12h2" />
  </>,
);
export const IconFuel = I(
  <>
    <path d="M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M3 20h12" />
    <path d="M7 8h4M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3" />
  </>,
);
export const IconOil = I(
  <>
    <path d="M4 9h9l3-3h4l-1 5h-3v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6H4z" />
    <path d="M10.5 13c-.8 1-1.2 1.7-1.2 2.3a1.2 1.2 0 0 0 2.4 0c0-.6-.4-1.3-1.2-2.3Z" />
  </>,
);
export const IconToolbox = I(
  <>
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18M11 13v2h2v-2" />
  </>,
);
export const IconTruck = I(
  <>
    <path d="M2 16V7a1 1 0 0 1 1-1h10v10M13 9h4l4 4v3h-2" />
    <path d="M2 16h2M9 16h6" />
    <circle cx="6.5" cy="17" r="2" />
    <circle cx="17.5" cy="17" r="2" />
  </>,
);
export const IconSearch = I(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4-4" />
  </>,
);
export const IconPhone = I(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />);
export const IconArrow = I(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconShield = I(
  <>
    <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const IconPin = I(
  <>
    <path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </>,
);
export const IconTag = I(
  <>
    <path d="M3 12V4h8l10 10-8 8z" />
    <circle cx="7.5" cy="8.5" r="1.2" />
  </>,
);
export const IconClock = I(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const IconCheck = I(<path d="m5 12 4.5 4.5L19 7" />);
export const IconBag = I(
  <>
    <path d="M5 8h14l-1 12H6z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </>,
);
export const IconWrench = I(
  <>
    <path d="M4 20 14 10" />
    <path d="M14 10 11 7a4 4 0 0 1 6-4l-2.5 2.5 1.5 1.5L18.5 3a4 4 0 0 1 2.5 6 4 4 0 0 1-4 1z" />
    <path d="m4 4 5 5M7 7 3.5 9.5 5 11l3-2.5M20 20l-6-6" />
  </>,
);
