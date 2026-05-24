const LABEL = "CONFIDENTIAL – BISHOPRIC";

export function ConfidentialBanner({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      aria-hidden="true"
      className={`fixed ${position}-0 inset-x-0 z-[9999] flex items-center justify-center bg-red-600 py-0.5 select-none`}
    >
      <span className="text-[10px] font-bold tracking-widest text-white uppercase">
        {LABEL}
      </span>
    </div>
  );
}
