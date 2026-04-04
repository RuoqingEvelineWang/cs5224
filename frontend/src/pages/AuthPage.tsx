import { useState } from "react";
import { signIn, signUp, confirmSignUp, signOut, autoSignIn } from "aws-amplify/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "signIn" | "signUp" | "confirm";

interface Fields {
  email: string;
  password: string;
  confirm: string;
  code: string;
}

// ─── Shared UI Atoms ──────────────────────────────────────────────────────────

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
  const isPwd = type === "password";

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <input
          type={isPwd ? (visible ? "text" : "password") : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 outline-none transition-all focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100"
        />
        {isPwd && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible(v => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {visible ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function PrimaryButton({
  loading,
  children,
  onClick,
}: {
  loading: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.985] text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" />
      </svg>
      <span>{msg}</span>
    </div>
  );
}

// ─── Left Branding Panel ──────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    title: "Sync schedules",
    desc: "See everyone's free time at a glance",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Fair venue finder",
    desc: "Midpoint venues balanced for all travel times",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: "Friend matching",
    desc: "Discover compatible people based on interests",
  },
];

function BrandPanel() {
  return (
    <div className="hidden lg:flex lg:w-[52%] relative bg-indigo-700 flex-col justify-between p-12 overflow-hidden select-none">

      {/* Background geometry */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-indigo-600/60" />
        <div className="absolute top-1/3 -left-20 w-72 h-72 rounded-full bg-violet-600/30" />
        <div className="absolute -bottom-24 right-12 w-64 h-64 rounded-full bg-indigo-500/40" />
        {/* Subtle dot grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.5" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
      </div>

      {/* Logo */}
      <div className="relative flex items-center gap-3">
        <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-md">
          <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <span className="text-white font-bold text-lg tracking-tight">MidMeet</span>
      </div>

      {/* Headline */}
      <div className="relative space-y-4">
        <h1 className="text-4xl xl:text-[2.75rem] font-bold text-white leading-[1.2] tracking-tight">
          Plan meetups,<br />the smart way.
        </h1>
        <p className="text-indigo-200 text-base leading-relaxed max-w-xs">
          Coordinate schedules, find the fairest midpoint, and discover great venues — together.
        </p>
      </div>

      {/* Feature list */}
      <div className="relative space-y-5">
        {FEATURES.map(f => (
          <div key={f.title} className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-indigo-200 shrink-0">
              {f.icon}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{f.title}</p>
              <p className="text-indigo-300 text-xs mt-0.5">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom caption */}
      <p className="relative text-indigo-400 text-xs">© 2026 MidMeet SG · CS5224 Team 23</p>
    </div>
  );
}

// ─── Sign In Form ─────────────────────────────────────────────────────────────

function SignInForm({
  onSuccess,
  onSwitchToSignUp,
}: {
  onSuccess: () => void;
  onSwitchToSignUp: () => void;
}) {
  const [fields, setFields] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k: keyof typeof fields) {
    return (v: string) => { setFields(f => ({ ...f, [k]: v })); setError(""); };
  }

  async function handleSubmit() {
    if (!fields.email || !fields.password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      await signOut().catch(() => { });
      // Pass the email address directly into Amplify's username parameter
      await signIn({ username: fields.email, password: fields.password });
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign in failed. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
        <p className="text-sm text-gray-500 mt-1">Sign in to your MidMeet account</p>
      </div>

      <ErrorBanner msg={error} />

      <div className="space-y-4">
        <Field label="Email" type="email" value={fields.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" />
        <Field label="Password" type="password" value={fields.password} onChange={set("password")} placeholder="••••••••" autoComplete="current-password" />
      </div>

      <div className="flex justify-end">
        <button type="button" className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline transition-colors">
          Forgot password?
        </button>
      </div>

      <PrimaryButton loading={loading} onClick={handleSubmit}>
        Sign In
      </PrimaryButton>

      <p className="text-center text-sm text-gray-500">
        Don't have an account?{" "}
        <button type="button" onClick={onSwitchToSignUp} className="text-indigo-600 font-semibold hover:underline">
          Sign up
        </button>
      </p>
    </div>
  );
}

// ─── Sign Up Form ─────────────────────────────────────────────────────────────

function SignUpForm({
  onSuccess,
  onSwitchToSignIn,
}: {
  onSuccess: (email: string) => void;
  onSwitchToSignIn: () => void;
}) {
  const [fields, setFields] = useState<Pick<Fields, "email" | "password" | "confirm">>({
    email: "", password: "", confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(k: keyof typeof fields) {
    return (v: string) => { setFields(f => ({ ...f, [k]: v })); setError(""); };
  }

  async function handleSubmit() {
    if (!fields.email || !fields.password || !fields.confirm) {
      setError("Please fill in all fields."); return;
    }
    if (fields.password !== fields.confirm) { setError("Passwords do not match."); return; }
    if (fields.password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    try {
      await signUp({
        // Pass the email into the username parameter
        username: fields.email,
        password: fields.password,
        options: { userAttributes: { email: fields.email }, autoSignIn: true },
      });
      onSuccess(fields.email);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign up failed. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Create account</h2>
        <p className="text-sm text-gray-500 mt-1">Join MidMeet and start planning</p>
      </div>

      <ErrorBanner msg={error} />

      <div className="space-y-4">
        <Field label="Email" type="email" value={fields.email} onChange={set("email")} placeholder="you@example.com" autoComplete="email" />
        <Field label="Password" type="password" value={fields.password} onChange={set("password")} placeholder="Min. 8 characters" autoComplete="new-password" />
        <Field label="Confirm Password" type="password" value={fields.confirm} onChange={set("confirm")} placeholder="••••••••" autoComplete="new-password" />
      </div>

      <PrimaryButton loading={loading} onClick={handleSubmit}>
        Create Account
      </PrimaryButton>

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToSignIn} className="text-indigo-600 font-semibold hover:underline">
          Sign in
        </button>
      </p>
    </div>
  );
}

// ─── Confirm Sign Up Form ─────────────────────────────────────────────────────

function ConfirmForm({
  email,
  onSuccess,
}: {
  email: string;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!code.trim()) { setError("Please enter the verification code."); return; }
    setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code.trim() });
      await signOut().catch(() => {});
      await autoSignIn();
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Verification failed. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="space-y-5">
      {/* Icon */}
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-2">
        <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Verify your email</h2>
        <p className="text-sm text-gray-500 mt-1">
          We sent a 6-digit code to <span className="font-medium text-gray-800">{email}</span>.
        </p>
      </div>

      <ErrorBanner msg={error} />

      <Field
        label="Verification Code"
        value={code}
        onChange={v => { setCode(v); setError(""); }}
        placeholder="123456"
        autoComplete="one-time-code"
      />

      <PrimaryButton loading={loading} onClick={handleSubmit}>
        Verify & Continue
      </PrimaryButton>

      <p className="text-center text-sm text-gray-500">
        Didn't receive it?{" "}
        <button type="button" className="text-indigo-600 font-semibold hover:underline">
          Resend code
        </button>
      </p>
    </div>
  );
}

// ─── Main Auth Page ───────────────────────────────────────────────────────────

export default function AuthPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [pendingEmail, setPendingEmail] = useState("");

  function handleSignUpSuccess(email: string) {
    setPendingEmail(email);
    setMode("confirm");
  }

  function handleConfirmSuccess() {
    onAuthenticated();
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left — Branding */}
      <BrandPanel />

      {/* Right — Auth Form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">

        {/* Mobile logo (hidden on lg+) */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">MidMeet</span>
        </div>

        {/* Form card */}
        <div className="w-full max-w-[380px]">
          {mode === "signIn" && (
            <SignInForm onSuccess={onAuthenticated} onSwitchToSignUp={() => setMode("signUp")} />
          )}
          {mode === "signUp" && (
            <SignUpForm onSuccess={handleSignUpSuccess} onSwitchToSignIn={() => setMode("signIn")} />
          )}
          {mode === "confirm" && (
            <ConfirmForm email={pendingEmail} onSuccess={handleConfirmSuccess} />
          )}

        </div>
      </div>
    </div>
  );
}