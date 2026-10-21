"use client";

/** Two large, plainly-worded buttons to choose between the chat and the form. */
export default function BookingModeSwitch({
  mode,
  onChange,
}: {
  mode: "chat" | "form";
  onChange: (mode: "chat" | "form") => void;
}) {
  const options: Array<{ key: "chat" | "form"; title: string; sub: string; icon: React.ReactNode }> = [
    { key: "chat", title: "Book with AI Assistant", sub: "Answer a few quick questions", icon: <ChatIcon /> },
    { key: "form", title: "Fill a form", sub: "Step by step", icon: <FormIcon /> },
  ];

  return (
    <div role="group" aria-label="Choose how to book" className="grid grid-cols-2 gap-3">
      {options.map((o) => {
        const active = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={active}
            onClick={() => !active && onChange(o.key)}
            className={`flex min-h-[76px] items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 ${
              active
                ? "border-red-600 bg-red-600 text-white"
                : "border-neutral-400 bg-white text-neutral-900 hover:border-red-600 hover:bg-red-50"
            }`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                active ? "bg-white/20 text-white" : "bg-red-100 text-red-700"
              }`}
            >
              {o.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold leading-tight">{o.title}</span>
              <span className={`mt-0.5 block text-sm ${active ? "text-red-50" : "text-neutral-600"}`}>
                {active ? "Selected" : o.sub}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FormIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8" />
    </svg>
  );
}
